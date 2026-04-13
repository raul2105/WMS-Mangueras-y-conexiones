import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { createAuditLogSafeWithDb } from "@/lib/audit-log";
import InventoryService from "@/lib/inventory-service";
import { createMovementTraceAndLabelJob } from "@/lib/labeling-service";
import { firstErrorMessage, purchaseReceiptOperationSchema } from "@/lib/schemas/wms";
import { pageGuard } from "@/components/rbac/PageGuard";

async function receiveItems(orderId: string, formData: FormData) {
  "use server";
  await (await import("@/lib/rbac")).requirePermission("purchasing.manage");

  const parsedHeader = purchaseReceiptOperationSchema.safeParse({
    locationId: String(formData.get("locationId") ?? "").trim(),
    referenceDoc: String(formData.get("referenceDoc") ?? "").trim() || undefined,
    notes: String(formData.get("notes") ?? "").trim() || undefined,
    operatorName: String(formData.get("operatorName") ?? "").trim(),
  });
  if (!parsedHeader.success) {
    redirect(`/purchasing/orders/${orderId}/receive?error=${encodeURIComponent(firstErrorMessage(parsedHeader.error))}`);
  }

  const locationId = parsedHeader.data.locationId;
  const referenceDoc = parsedHeader.data.referenceDoc?.trim() || null;
  const notes = parsedHeader.data.notes?.trim() || null;
  const operatorName = parsedHeader.data.operatorName;

  const order = await prisma.purchaseOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      folio: true,
      status: true,
      lines: {
        select: {
          id: true,
          productId: true,
          qtyOrdered: true,
          qtyReceived: true,
          product: { select: { id: true, sku: true } },
        },
      },
    },
  });

  if (!order) redirect(`/purchasing/orders`);

  if (!["CONFIRMADA", "EN_TRANSITO", "PARCIAL"].includes(order.status)) {
    redirect(`/purchasing/orders/${orderId}/receive?error=${encodeURIComponent("La OC no está en estado de recepción")}`);
  }

  // Collect quantities per line
  const linesToReceive: Array<{ lineId: string; productId: string; qty: number }> = [];

  for (const line of order.lines) {
    const pending = line.qtyOrdered - line.qtyReceived;
    if (pending <= 0) continue;

    const raw = String(formData.get(`qty_${line.id}`) ?? "").trim();
    if (!raw || raw === "0") continue;

    const qty = parseInt(raw);
    if (!Number.isFinite(qty) || qty <= 0) {
      redirect(`/purchasing/orders/${orderId}/receive?error=${encodeURIComponent(`Cantidad inválida para ${line.product.sku}`)}`);
    }
    if (qty > pending) {
      redirect(`/purchasing/orders/${orderId}/receive?error=${encodeURIComponent(`Cantidad excede pendiente para ${line.product.sku} (máx: ${pending})`)}`);
    }

    linesToReceive.push({ lineId: line.id, productId: line.productId, qty });
  }

  if (linesToReceive.length === 0) {
    redirect(`/purchasing/orders/${orderId}/receive?error=${encodeURIComponent("Ingresa al menos una cantidad mayor a 0")}`);
  }

  const service = new InventoryService(prisma);
  try {
    const receiptId = await prisma.$transaction(async (tx) => {
      const receipt = await tx.purchaseReceipt.create({
        data: { purchaseOrderId: orderId, locationId, referenceDoc, notes },
      });
      const createdLines: Array<{ receiptLineId: string; productId: string; qty: number }> = [];

      for (const item of linesToReceive) {
        const receiptLine = await tx.purchaseReceiptLine.create({
          data: {
            purchaseReceiptId: receipt.id,
            purchaseOrderLineId: item.lineId,
            productId: item.productId,
            qtyReceived: item.qty,
          },
        });
        createdLines.push({ receiptLineId: receiptLine.id, productId: item.productId, qty: item.qty });

        await tx.purchaseOrderLine.update({
          where: { id: item.lineId },
          data: { qtyReceived: { increment: item.qty } },
        });
      }

      const updatedLines = await tx.purchaseOrderLine.findMany({
        where: { purchaseOrderId: orderId },
      });
      const allDone = updatedLines.every((l) => l.qtyReceived >= l.qtyOrdered);
      const anyDone = updatedLines.some((l) => l.qtyReceived > 0);
      const newStatus = allDone ? "RECIBIDA" : anyDone ? "PARCIAL" : order.status;

      await tx.purchaseOrder.update({
        where: { id: orderId },
        data: { status: newStatus as never },
      });

      for (const row of createdLines) {
        const movement = await service.receiveStock(row.productId, locationId, row.qty, order.folio, {
          tx,
          source: "purchasing/receive",
          actor: operatorName,
          operatorName,
          notes: referenceDoc ? `Recepción OC ${order.folio} — ${referenceDoc}` : `Recepción OC ${order.folio}`,
          documentType: "PURCHASE_RECEIPT",
          documentId: receipt.id,
          documentLineId: row.receiptLineId,
        });
        if (!movement.movementId) {
          throw new Error("No se pudo crear movimiento de inventario de recepción");
        }
        await createMovementTraceAndLabelJob(tx, {
          movementId: movement.movementId,
          labelType: "RECEIPT",
          sourceEntityType: "PURCHASE_RECEIPT_LINE",
          sourceEntityId: row.receiptLineId,
          operatorName,
        });
      }

      await createAuditLogSafeWithDb({
        entityType: "PURCHASE_ORDER",
        entityId: orderId,
        action: "RECEIVE",
        after: {
          locationId,
          referenceDoc,
          lines: linesToReceive,
          newStatus,
          operatorName,
        },
        source: "purchasing/receive",
        actor: operatorName,
      }, tx);

      return receipt.id;
    }, { timeout: 20000 });

    redirect(`/labels/document/PURCHASE_RECEIPT/${receiptId}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al registrar recepción";
    redirect(`/purchasing/orders/${orderId}/receive?error=${encodeURIComponent(msg)}`);
  }
}

export const dynamic = "force-dynamic";

export default async function ReceivePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await pageGuard("purchasing.manage");
  const { id } = await params;
  const sp = await searchParams;

  const order = await prisma.purchaseOrder.findUnique({
    where: { id },
    select: {
      id: true,
      folio: true,
      status: true,
      supplier: { select: { name: true, code: true, businessName: true } },
      lines: {
        select: {
          id: true,
          qtyOrdered: true,
          qtyReceived: true,
          product: { select: { sku: true, name: true } },
        },
        orderBy: { product: { sku: "asc" } },
      },
    },
  });

  if (!order) notFound();

  if (!["CONFIRMADA", "EN_TRANSITO", "PARCIAL"].includes(order.status)) {
    redirect(`/purchasing/orders/${id}?error=${encodeURIComponent("Esta OC no está pendiente de recepción")}`);
  }

  const pendingLines = order.lines.filter((l) => l.qtyOrdered - l.qtyReceived > 0);

  if (pendingLines.length === 0) {
    redirect(`/purchasing/orders/${id}?error=${encodeURIComponent("Todas las líneas ya fueron recibidas")}`);
  }

  const locations = await prisma.location.findMany({
    where: { isActive: true },
    orderBy: [{ warehouse: { name: "asc" } }, { code: "asc" }],
    select: { id: true, code: true, warehouse: { select: { name: true } } },
  });

  const receiveItemsBound = receiveItems.bind(null, id);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/purchasing/orders/${id}`} className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">
          ← {order.folio}
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Recibir Mercancía</h1>
          <p className="text-sm text-slate-400">{order.supplier.code} — {order.supplier.businessName ?? order.supplier.name}</p>
        </div>
      </div>

      {sp.error && (
        <div className="glass-card border border-red-500/30 text-red-200 text-sm">{sp.error}</div>
      )}

      <form action={receiveItemsBound} className="space-y-6">
        {/* Destino y referencia */}
        <div className="glass-card space-y-4">
          <h2 className="text-base font-bold border-b border-white/10 pb-2">Datos de Recepción</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="space-y-1">
              <span className="text-sm text-slate-400">Ubicación destino *</span>
              <select name="locationId" required className="w-full px-4 py-3 glass rounded-lg">
                <option value="">Seleccionar ubicación…</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.warehouse.name} — {loc.code}
                  </option>
                ))}
              </select>
            </label>
          <label className="space-y-1">
            <span className="text-sm text-slate-400">Remisión / Factura</span>
              <input
                name="referenceDoc"
                maxLength={100}
                placeholder="REM-2026-001"
                className="w-full px-4 py-3 glass rounded-lg"
              />
            </label>
          </div>
          <label className="space-y-1 block">
            <span className="text-sm text-slate-400">Notas de recepción</span>
            <textarea
              name="notes"
              rows={2}
              maxLength={500}
              placeholder="Observaciones sobre el estado de la mercancía…"
              className="w-full px-4 py-3 glass rounded-lg resize-none"
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm text-slate-400">Operador *</span>
            <input
              name="operatorName"
              required
              maxLength={120}
              placeholder="Nombre del operador"
              className="w-full px-4 py-3 glass rounded-lg"
            />
          </label>
        </div>

        {/* Tabla de cantidades */}
        <div className="glass-card space-y-3">
          <h2 className="text-base font-bold border-b border-white/10 pb-2">
            Artículos Pendientes
            <span className="text-sm text-slate-400 font-normal ml-2">({pendingLines.length} líneas)</span>
          </h2>
          <p className="text-xs text-slate-500">Deja en 0 los artículos que no llegaron para registrar una recepción parcial.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 border-b border-white/10">
                  <th className="text-left py-2">SKU</th>
                  <th className="text-left py-2">Producto</th>
                  <th className="text-right py-2">Pendiente</th>
                  <th className="text-right py-2 w-32">Recibir</th>
                </tr>
              </thead>
              <tbody>
                {pendingLines.map((line) => {
                  const pending = line.qtyOrdered - line.qtyReceived;
                  return (
                    <tr key={line.id} className="border-b border-white/5">
                      <td className="py-3 font-mono text-cyan-400 text-xs">{line.product.sku}</td>
                      <td className="py-3 text-slate-300">{line.product.name}</td>
                      <td className="py-3 text-right text-amber-400 font-semibold">{pending}</td>
                      <td className="py-3 text-right">
                        <input
                          name={`qty_${line.id}`}
                          type="number"
                          min="0"
                          max={pending}
                          defaultValue={pending}
                          className="w-24 px-3 py-1.5 glass rounded-lg text-sm text-right"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Link href={`/purchasing/orders/${id}`} className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">
            Cancelar
          </Link>
          <button type="submit" className="btn-primary">
            Confirmar Recepción
          </button>
        </div>
      </form>
    </div>
  );
}
