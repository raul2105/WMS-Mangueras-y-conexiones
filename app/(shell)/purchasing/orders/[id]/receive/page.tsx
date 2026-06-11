import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { createAuditLogSafeWithDb } from "@/lib/audit-log";
import InventoryService from "@/lib/inventory-service";
import { createMovementTraceAndLabelJob } from "@/lib/labeling-service";
import { firstErrorMessage, purchaseReceiptOperationSchema, purchaseReceiptLineDiscrepancySchema } from "@/lib/schemas/wms";
import { pageGuard } from "@/components/rbac/PageGuard";

async function receiveItems(orderId: string, formData: FormData) {
  "use server";
  await (await import("@/lib/rbac")).requirePermission("purchasing.receive");

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
          product: { select: { sku: true } },
        },
      },
    },
  });

  if (!order) {
    redirect("/purchasing/orders");
  }

  if (!["CONFIRMADA", "EN_TRANSITO", "PARCIAL"].includes(order.status)) {
    redirect(`/purchasing/orders/${orderId}/receive?error=${encodeURIComponent("La OC no está en estado de recepción")}`);
  }

  const linesToReceive: Array<{
    lineId: string;
    productId: string;
    qtyReceived: number;
    qtyDamaged: number;
    qtyMissing: number;
    qtyRejected: number;
    qtySurplusReported: number;
    discrepancyReason: string | null;
  }> = [];
  for (const line of order.lines) {
    const pending = line.qtyOrdered - line.qtyReceived;
    if (pending <= 0) continue;

    const raw = String(formData.get(`qty_${line.id}`) ?? "").trim();
    if (!raw || raw === "0") continue;

    const qty = Number.parseInt(raw, 10);
    if (!Number.isFinite(qty) || qty <= 0) {
      redirect(`/purchasing/orders/${orderId}/receive?error=${encodeURIComponent(`Cantidad inválida para ${line.product.sku}`)}`);
    }
    if (qty > pending) {
      redirect(`/purchasing/orders/${orderId}/receive?error=${encodeURIComponent(`Cantidad excede pendiente para ${line.product.sku} (máx: ${pending})`)}`);
    }

    // Parse discrepancy fields
    const qtyDamaged = Number.parseInt(String(formData.get(`dmg_${line.id}`) ?? "0"), 10);
    const qtyMissing = Number.parseInt(String(formData.get(`missing_${line.id}`) ?? "0"), 10);
    const qtyRejected = Number.parseInt(String(formData.get(`rejected_${line.id}`) ?? "0"), 10);
    const qtySurplusReported = Number.parseInt(String(formData.get(`surplus_${line.id}`) ?? "0"), 10);
    const discrepancyReason = String(formData.get(`reason_${line.id}`) ?? "").trim() || null;

    // Validate discrepancy schema
    const lineParsed = purchaseReceiptLineDiscrepancySchema.safeParse({
      lineId: line.id,
      qtyReceived: qty,
      qtyDamaged,
      qtyMissing,
      qtyRejected,
      qtySurplusReported,
      discrepancyReason,
    });

    if (!lineParsed.success) {
      redirect(`/purchasing/orders/${orderId}/receive?error=${encodeURIComponent(firstErrorMessage(lineParsed.error))}`);
    }

    // Only qtyReceived counts toward pending; discrepancy quantities are recorded but don't consume pending
    if (qty > pending) {
      redirect(`/purchasing/orders/${orderId}/receive?error=${encodeURIComponent(`Cantidad buena excede pendiente para ${line.product.sku} (máx: ${pending})`)}`);
    }

    // Total accounted (good + damaged + missing + rejected) cannot exceed ordered (only for non-surplus)
    const accounted = qty + qtyDamaged + qtyMissing + qtyRejected;
    if (accounted > line.qtyOrdered) {
      redirect(`/purchasing/orders/${orderId}/receive?error=${encodeURIComponent(`Total de cuenta (bueno + dañado + faltante + rechazado) excede lo ordenado para ${line.product.sku}`)}`);
    }

    linesToReceive.push({
      lineId: line.id,
      productId: line.productId,
      qtyReceived: qty,
      qtyDamaged,
      qtyMissing,
      qtyRejected,
      qtySurplusReported,
      discrepancyReason,
    });
  }

  if (linesToReceive.length === 0) {
    redirect(`/purchasing/orders/${orderId}/receive?error=${encodeURIComponent("Ingresa al menos una cantidad mayor a 0")}`);
  }

  const inventory = new InventoryService(prisma);

  try {
    const receiptId = await prisma.$transaction(async (tx) => {
      const receipt = await tx.purchaseReceipt.create({
        data: {
          purchaseOrderId: orderId,
          locationId,
          referenceDoc,
          notes,
        },
      });
      // Map lineId -> qtyOrdered for concurrency-safe conditional update
      const qtyOrderedMap = new Map(order.lines.map(l => [l.id, l.qtyOrdered]));

      for (const item of linesToReceive) {
        const receiptLine = await tx.purchaseReceiptLine.create({
          data: {
            purchaseReceiptId: receipt.id,
            purchaseOrderLineId: item.lineId,
            productId: item.productId,
          qtyReceived: item.qtyReceived,
          },
        });

        const qtyOrderedForLine = qtyOrderedMap.get(item.lineId) ?? 0;
        // Conditional update: only increment if qtyReceived + item.qty <= qtyOrdered
        // where qtyReceived (current) <= qtyOrdered - item.qty
        const maxAllowedCurrent = qtyOrderedForLine - item.qtyReceived;
        const updated = await tx.purchaseOrderLine.updateMany({
          where: {
            id: item.lineId,
            qtyReceived: { lte: maxAllowedCurrent },
          },
          data: { qtyReceived: { increment: item.qtyReceived } },
        });
        if (updated.count === 0) {
          throw new Error(`Cantidad excede pendiente para la línea ${item.lineId} (concurrencia)`);
        }

        const movement = await inventory.receiveStock(item.productId, locationId, item.qtyReceived, order.folio, {
          tx,
          source: "purchasing/receive",
          actor: operatorName,
          operatorName,
          notes: referenceDoc ? `Recepción OC ${order.folio} — ${referenceDoc}` : `Recepción OC ${order.folio}`,
          documentType: "PURCHASE_RECEIPT",
          documentId: receipt.id,
          documentLineId: receiptLine.id,
        });

        if (!movement.movementId) {
          throw new Error("No se pudo crear movimiento de inventario de recepción");
        }

        await createMovementTraceAndLabelJob(tx, {
          movementId: movement.movementId,
          labelType: "RECEIPT",
          sourceEntityType: "PURCHASE_RECEIPT_LINE",
          sourceEntityId: receiptLine.id,
          operatorName,
        });
      }

      const updatedLines = await tx.purchaseOrderLine.findMany({
        where: { purchaseOrderId: orderId },
        select: { qtyOrdered: true, qtyReceived: true },
      });
      const allDone = updatedLines.every((line) => line.qtyReceived >= line.qtyOrdered);
      const anyDone = updatedLines.some((line) => line.qtyReceived > 0);
      const newStatus = allDone ? "RECIBIDA" : anyDone ? "PARCIAL" : order.status;

      await tx.purchaseOrder.update({
        where: { id: orderId },
        data: { status: newStatus as never },
      });

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
      }, tx);
      return receipt.id;
    }, { timeout: 20000 });

    redirect(`/labels/document/PURCHASE_RECEIPT/${receiptId}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al registrar recepción";
    redirect(`/purchasing/orders/${orderId}/receive?error=${encodeURIComponent(message)}`);
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
  await pageGuard("purchasing.receive");
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

  const pendingLines = order.lines.filter((line) => line.qtyOrdered - line.qtyReceived > 0);

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
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/purchasing/orders/${id}`} className="glass rounded-lg px-4 py-2 text-slate-300 hover:text-white">
          ← {order.folio}
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Recibir Mercancía</h1>
          <p className="text-sm text-slate-400">
            {order.supplier.code} — {order.supplier.businessName ?? order.supplier.name}
          </p>
        </div>
      </div>

      {sp.error ? (
        <div className="glass-card border border-red-500/30 text-sm text-red-200">{sp.error}</div>
      ) : null}

      <form action={receiveItemsBound} className="space-y-6">
        <div className="glass-card space-y-4">
          <h2 className="border-b border-white/10 pb-2 text-base font-bold">Datos de Recepción</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-sm text-slate-400">Ubicación destino *</span>
              <select name="locationId" required className="glass w-full rounded-lg px-4 py-3">
                <option value="">Seleccionar ubicación…</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.warehouse.name} — {location.code}
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
                className="glass w-full rounded-lg px-4 py-3"
              />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-sm text-slate-400">Notas de recepción</span>
            <textarea
              name="notes"
              placeholder="Observaciones operativas, daños, faltantes o referencia de transporte"
              className="glass min-h-[96px] w-full rounded-lg px-4 py-3"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm text-slate-400">Operador *</span>
            <input
              name="operatorName"
              required
              maxLength={120}
              className="glass w-full rounded-lg px-4 py-3"
            />
          </label>
        </div>

        <div className="glass-card space-y-3">
          <h2 className="border-b border-white/10 pb-2 text-base font-bold">
            Artículos Pendientes
            <span className="ml-2 text-sm font-normal text-slate-400">({pendingLines.length} líneas)</span>
          </h2>
          <p className="text-xs text-slate-500">Deja en 0 los artículos que no llegaron para registrar una recepción parcial.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-slate-400">
                  <th className="py-2 text-left">SKU</th>
                  <th className="py-2 text-left">Producto</th>
                  <th className="py-2 text-right">Pendiente</th>
                  <th className="w-32 py-2 text-right">Recibir</th>
                </tr>
              </thead>
              <tbody>
                {pendingLines.map((line) => {
                  const pending = line.qtyOrdered - line.qtyReceived;
                  return (
                    <tr key={line.id} className="border-b border-white/5">
                      <td className="py-3 font-mono text-xs text-cyan-400">{line.product.sku}</td>
                      <td className="py-3 text-slate-300">{line.product.name}</td>
                      <td className="py-3 text-right font-semibold text-amber-400">{pending}</td>
                      <td className="py-3 text-right">
                        <input
                          name={`qty_${line.id}`}
                          type="number"
                          min="0"
                          max={pending}
                          defaultValue={pending}
                          className="glass w-24 rounded-lg px-3 py-1.5 text-right text-sm"
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
          <Link href={`/purchasing/orders/${id}`} className="glass rounded-lg px-4 py-2 text-slate-300 hover:text-white">
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
