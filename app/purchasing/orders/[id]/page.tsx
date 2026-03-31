import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { purchaseOrderLineSchema, firstErrorMessage } from "@/lib/schemas/wms";
import { createAuditLogSafe } from "@/lib/audit-log";

const STATUS_LABELS: Record<string, string> = {
  BORRADOR: "Borrador",
  CONFIRMADA: "Confirmada",
  EN_TRANSITO: "En Tránsito",
  RECIBIDA: "Recibida",
  PARCIAL: "Parcial",
  CANCELADA: "Cancelada",
};

const STATUS_COLORS: Record<string, string> = {
  BORRADOR: "text-slate-400 bg-slate-500/20 border-slate-500/30",
  CONFIRMADA: "text-blue-400 bg-blue-500/20 border-blue-500/30",
  EN_TRANSITO: "text-amber-400 bg-amber-500/20 border-amber-500/30",
  RECIBIDA: "text-emerald-400 bg-emerald-500/20 border-emerald-500/30",
  PARCIAL: "text-orange-400 bg-orange-500/20 border-orange-500/30",
  CANCELADA: "text-red-400 bg-red-500/20 border-red-500/30",
};

// Valid status transitions
const TRANSITIONS: Record<string, string[]> = {
  BORRADOR: ["CONFIRMADA", "CANCELADA"],
  CONFIRMADA: ["EN_TRANSITO", "CANCELADA"],
  EN_TRANSITO: ["RECIBIDA", "CANCELADA"],
  PARCIAL: ["EN_TRANSITO", "CANCELADA"],
  RECIBIDA: [],
  CANCELADA: [],
};

async function updateStatus(orderId: string, formData: FormData) {
  "use server";

  const newStatus = String(formData.get("status") ?? "").trim();

  const order = await prisma.purchaseOrder.findUnique({
    where: { id: orderId },
    select: {
      status: true,
      lines: { select: { qtyOrdered: true, qtyReceived: true } },
    },
  });
  if (!order) redirect(`/purchasing/orders/${orderId}?error=Orden no encontrada`);

  const allowed = TRANSITIONS[order.status] ?? [];
  if (!allowed.includes(newStatus)) {
    redirect(`/purchasing/orders/${orderId}?error=${encodeURIComponent(`Transición ${order.status} → ${newStatus} no permitida`)}`);
  }

  if (newStatus === "CONFIRMADA" && order.lines.length === 0) {
    redirect(`/purchasing/orders/${orderId}?error=${encodeURIComponent("Agrega al menos una línea antes de confirmar")}`);
  }

  if (newStatus === "RECIBIDA") {
    const allComplete = order.lines.every((l) => l.qtyReceived >= l.qtyOrdered);
    if (!allComplete) {
      redirect(`/purchasing/orders/${orderId}?error=${encodeURIComponent("Hay líneas con pendiente de recibir — usa Recepción Parcial")}`);
    }
  }

  await prisma.purchaseOrder.update({ where: { id: orderId }, data: { status: newStatus as never } });

  await createAuditLogSafe({
    entityType: "PURCHASE_ORDER",
    entityId: orderId,
    action: "STATUS_CHANGE",
    before: JSON.stringify({ status: order.status }),
    after: JSON.stringify({ status: newStatus }),
    source: "purchasing/orders",
  });

  redirect(`/purchasing/orders/${orderId}?ok=1`);
}

async function addLine(orderId: string, formData: FormData) {
  "use server";

  const productId = String(formData.get("productId") ?? "").trim();
  const qtyOrderedRaw = String(formData.get("qtyOrderedRaw") ?? "").trim();
  const unitPriceRaw = String(formData.get("unitPriceRaw") ?? "").trim();

  const parsed = purchaseOrderLineSchema.safeParse({ purchaseOrderId: orderId, productId, qtyOrderedRaw, unitPriceRaw });
  if (!parsed.success) {
    redirect(`/purchasing/orders/${orderId}?error=${encodeURIComponent(firstErrorMessage(parsed.error))}`);
  }

  const order = await prisma.purchaseOrder.findUnique({ where: { id: orderId } });
  if (!order || order.status !== "BORRADOR") {
    redirect(`/purchasing/orders/${orderId}?error=${encodeURIComponent("Solo se pueden agregar líneas a OCs en Borrador")}`);
  }

  const unitPrice = unitPriceRaw ? Number(unitPriceRaw.replace(",", ".")) : null;
  const qtyOrdered = parsed.data.qtyOrderedRaw;

  // Check if supplier has a price for this product
  let resolvedPrice = unitPrice;
  if (resolvedPrice == null) {
    const supplierProduct = await prisma.supplierProduct.findUnique({
      where: { supplierId_productId: { supplierId: order.supplierId, productId } },
    });
    resolvedPrice = supplierProduct?.unitPrice ?? null;
  }

  await prisma.purchaseOrderLine.upsert({
    where: { purchaseOrderId_productId: { purchaseOrderId: orderId, productId } },
    create: { purchaseOrderId: orderId, productId, qtyOrdered, unitPrice: resolvedPrice },
    update: { qtyOrdered, unitPrice: resolvedPrice },
  });

  redirect(`/purchasing/orders/${orderId}`);
}

async function removeLine(orderId: string, formData: FormData) {
  "use server";

  const lineId = String(formData.get("lineId") ?? "").trim();

  const line = await prisma.purchaseOrderLine.findUnique({ where: { id: lineId } });
  if (!line || line.qtyReceived > 0) {
    redirect(`/purchasing/orders/${orderId}?error=${encodeURIComponent("No se puede eliminar una línea con recepciones")}`);
  }

  const order = await prisma.purchaseOrder.findUnique({ where: { id: orderId } });
  if (!order || order.status !== "BORRADOR") {
    redirect(`/purchasing/orders/${orderId}?error=${encodeURIComponent("Solo se pueden eliminar líneas de OCs en Borrador")}`);
  }

  await prisma.purchaseOrderLine.delete({ where: { id: lineId } });
  redirect(`/purchasing/orders/${orderId}`);
}

export const dynamic = "force-dynamic";

export default async function PurchaseOrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const order = await prisma.purchaseOrder.findUnique({
    where: { id },
    select: {
      id: true,
      supplierId: true,
      folio: true,
      status: true,
      expectedDate: true,
      notes: true,
      supplier: { select: { id: true, code: true, name: true } },
      lines: {
        select: {
          id: true,
          qtyOrdered: true,
          qtyReceived: true,
          unitPrice: true,
          product: { select: { id: true, sku: true, name: true } },
        },
        orderBy: { product: { sku: "asc" } },
      },
      receipts: {
        orderBy: { receivedAt: "desc" },
        select: {
          id: true,
          receivedAt: true,
          notes: true,
          referenceDoc: true,
          location: { select: { code: true } },
          lines: { select: { qtyReceived: true } },
        },
      },
    },
  });

  if (!order) notFound();

  const products = await prisma.product.findMany({
    select: { id: true, sku: true, name: true },
    orderBy: { sku: "asc" },
  });

  const updateStatusBound = updateStatus.bind(null, id);
  const addLineBound = addLine.bind(null, id);
  const removeLineBound = removeLine.bind(null, id);

  const totalOrdered = order.lines.reduce((s, l) => s + l.qtyOrdered, 0);
  const totalReceived = order.lines.reduce((s, l) => s + l.qtyReceived, 0);
  const pctReceived = totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0;
  const totalValue = order.lines.reduce((s, l) => s + (l.unitPrice ?? 0) * l.qtyOrdered, 0);

  const allowedTransitions = TRANSITIONS[order.status] ?? [];
  const hasPending = order.lines.some((l) => l.qtyReceived < l.qtyOrdered);
  const canReceive = ["CONFIRMADA", "EN_TRANSITO", "PARCIAL"].includes(order.status) && hasPending;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <Link href="/purchasing/orders" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">← OCs</Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold font-mono">{order.folio}</h1>
              <span className={`text-xs font-bold px-2 py-1 rounded border ${STATUS_COLORS[order.status] ?? "text-slate-400 bg-slate-500/20 border-slate-500/30"}`}>
                {STATUS_LABELS[order.status] ?? order.status}
              </span>
            </div>
            <p className="text-sm text-slate-400 mt-0.5">
              {order.supplier.code} — {order.supplier.name}
            </p>
          </div>
        </div>
        {canReceive && (
          <Link
            href={`/purchasing/orders/${id}/receive`}
            className="btn-primary"
          >
            Recibir mercancía →
          </Link>
        )}
      </div>

      {sp.error && <div className="glass-card border border-red-500/30 text-red-200 text-sm">{sp.error}</div>}
      {sp.ok && <div className="glass-card border border-green-500/30 text-green-200 text-sm">Orden actualizada correctamente.</div>}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass p-4 rounded-lg">
          <p className="text-xs text-slate-400 uppercase font-bold">Líneas</p>
          <p className="text-xl font-bold text-white mt-1">{order.lines.length}</p>
        </div>
        <div className="glass p-4 rounded-lg">
          <p className="text-xs text-slate-400 uppercase font-bold">Valor estimado</p>
          <p className="text-xl font-bold text-orange-400 mt-1">
            ${totalValue.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="glass p-4 rounded-lg">
          <p className="text-xs text-slate-400 uppercase font-bold">% Recibido</p>
          <p className={`text-xl font-bold mt-1 ${pctReceived === 100 ? "text-emerald-400" : pctReceived > 0 ? "text-orange-400" : "text-slate-400"}`}>
            {pctReceived}%
          </p>
        </div>
        <div className="glass p-4 rounded-lg">
          <p className="text-xs text-slate-400 uppercase font-bold">Fecha esperada</p>
          <p className="text-sm font-medium text-slate-200 mt-1">
            {order.expectedDate ? new Date(order.expectedDate).toLocaleDateString("es-MX") : "—"}
          </p>
        </div>
      </div>

      {/* Cambio de estado */}
      {allowedTransitions.length > 0 && (
        <div className="glass-card">
          <h3 className="text-sm font-semibold text-slate-300 mb-3">Cambiar estado</h3>
          <div className="flex flex-wrap gap-3">
            {allowedTransitions.map((s) => (
              <form key={s} action={updateStatusBound}>
                <input type="hidden" name="status" value={s} />
                <button
                  type="submit"
                  className={`text-sm px-4 py-2 rounded-lg glass border transition-colors ${STATUS_COLORS[s] ?? "text-slate-400"} hover:brightness-125`}
                >
                  → {STATUS_LABELS[s] ?? s}
                </button>
              </form>
            ))}
          </div>
        </div>
      )}

      {/* Líneas */}
      <div className="glass-card space-y-4">
        <h2 className="text-lg font-bold border-b border-white/10 pb-2">
          Líneas de Compra
          <span className="text-sm text-slate-400 font-normal ml-2">({order.lines.length})</span>
        </h2>

        {order.lines.length === 0 ? (
          <p className="text-slate-500 text-sm">Sin líneas. Agrega productos a continuación.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 border-b border-white/10">
                  <th className="text-left py-2">SKU</th>
                  <th className="text-left py-2">Producto</th>
                  <th className="text-right py-2">Pedido</th>
                  <th className="text-right py-2">Recibido</th>
                  <th className="text-right py-2">Pendiente</th>
                  <th className="text-right py-2">Precio Unit.</th>
                  <th className="text-right py-2">Subtotal</th>
                  {order.status === "BORRADOR" && <th className="py-2"></th>}
                </tr>
              </thead>
              <tbody>
                {order.lines.map((line) => {
                  const pending = line.qtyOrdered - line.qtyReceived;
                  const subtotal = (line.unitPrice ?? 0) * line.qtyOrdered;
                  return (
                    <tr key={line.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-2 font-mono text-cyan-400 text-xs">{line.product.sku}</td>
                      <td className="py-2 text-slate-300">{line.product.name}</td>
                      <td className="py-2 text-right text-white font-semibold">{line.qtyOrdered}</td>
                      <td className="py-2 text-right text-emerald-400">{line.qtyReceived}</td>
                      <td className={`py-2 text-right font-semibold ${pending > 0 ? "text-amber-400" : "text-slate-500"}`}>
                        {pending}
                      </td>
                      <td className="py-2 text-right text-slate-400 text-xs">
                        {line.unitPrice != null ? `$${line.unitPrice.toLocaleString("es-MX", { minimumFractionDigits: 2 })}` : "—"}
                      </td>
                      <td className="py-2 text-right text-slate-300 text-xs">
                        {line.unitPrice != null ? `$${subtotal.toLocaleString("es-MX", { minimumFractionDigits: 2 })}` : "—"}
                      </td>
                      {order.status === "BORRADOR" && (
                        <td className="py-2 text-right">
                          <form action={removeLineBound} className="inline">
                            <input type="hidden" name="lineId" value={line.id} />
                            <button type="submit" className="text-xs text-red-400 hover:text-red-300 hover:underline">
                              Quitar
                            </button>
                          </form>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Form agregar línea (solo en BORRADOR) */}
        {order.status === "BORRADOR" && (
          <form action={addLineBound} className="border-t border-white/10 pt-4">
            <h3 className="text-sm font-semibold text-slate-300 mb-3">Agregar producto</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <label className="space-y-1 md:col-span-2">
                <span className="text-xs text-slate-400">Producto *</span>
                <select name="productId" required className="w-full px-3 py-2 glass rounded-lg text-sm">
                  <option value="">Seleccionar…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-400">Cantidad *</span>
                <input
                  name="qtyOrderedRaw"
                  type="number"
                  min="1"
                  step="1"
                  required
                  placeholder="0"
                  className="w-full px-3 py-2 glass rounded-lg text-sm"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-400">Precio Unit. (MXN)</span>
                <input
                  name="unitPriceRaw"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  className="w-full px-3 py-2 glass rounded-lg text-sm"
                />
              </label>
              <div className="flex items-end">
                <button type="submit" className="btn-primary text-sm py-2 px-4">Agregar</button>
              </div>
            </div>
          </form>
        )}
      </div>

      {/* Historial de recepciones */}
      {order.receipts.length > 0 && (
        <div className="glass-card space-y-3">
          <h2 className="text-lg font-bold border-b border-white/10 pb-2">
            Recepciones ({order.receipts.length})
          </h2>
          <div className="space-y-3">
            {order.receipts.map((receipt) => (
              <div key={receipt.id} className="glass p-3 rounded-lg text-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-200 font-medium">
                      {new Date(receipt.receivedAt).toLocaleString("es-MX")}
                    </p>
                    <p className="text-slate-400 text-xs mt-0.5">
                      Ubicación: <span className="text-cyan-400 font-mono">{receipt.location.code}</span>
                      {receipt.referenceDoc && (
                        <span> · Referencia: <span className="text-slate-300">{receipt.referenceDoc}</span></span>
                      )}
                    </p>
                  </div>
                  <span className="text-emerald-400 font-bold">
                    {receipt.lines.reduce((s, l) => s + l.qtyReceived, 0)} u.
                  </span>
                </div>
                {receipt.notes && <p className="text-slate-500 text-xs mt-1">{receipt.notes}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {order.notes && (
        <div className="glass-card">
          <p className="text-xs text-slate-400 uppercase font-bold mb-1">Notas</p>
          <p className="text-slate-300 text-sm">{order.notes}</p>
        </div>
      )}
    </div>
  );
}
