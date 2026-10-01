import type { LocationUsageType, PrismaClient } from "@prisma/client";
import { createAuditLogSafeWithDb } from "@/lib/audit-log";
import InventoryService from "@/lib/inventory-service";
import { createMovementTraceAndLabelJob } from "@/lib/labeling-service";

export type PurchaseReceiptCommitLine = {
  lineId: string;
  productId: string;
  qtyReceived: number;
  qtyDamaged: number;
  qtyMissing: number;
  qtyRejected: number;
  qtySurplusReported: number;
  discrepancyReason: string | null;
};

export function isReceivingLocation(location: {
  isActive: boolean;
  usageType: LocationUsageType;
  warehouseIsActive: boolean;
} | null | undefined) {
  return Boolean(location?.isActive && location.usageType === "RECEIVING" && location.warehouseIsActive);
}

export async function commitPurchaseOrderReceipt(input: {
  prismaClient: PrismaClient;
  orderId: string;
  locationId: string;
  referenceDoc: string | null;
  notes: string | null;
  lines: PurchaseReceiptCommitLine[];
  actor: { name: string; userId: string | null; operatorName: string | null };
}) {
  const { prismaClient } = input;
  const inventory = new InventoryService(prismaClient);

  return prismaClient.$transaction(async (tx) => {
    const [order, receivingLocation] = await Promise.all([
      tx.purchaseOrder.findUnique({
        where: { id: input.orderId },
        select: {
          id: true,
          folio: true,
          status: true,
          deliveryWarehouseId: true,
          lines: {
            select: { id: true, productId: true, qtyOrdered: true, qtyReceived: true, purchaseUnitFactor: true },
          },
        },
      }),
      tx.location.findUnique({ where: { id: input.locationId }, select: { isActive: true, usageType: true, warehouseId: true, warehouse: { select: { isActive: true } } } }),
    ]);
    if (!order) throw new Error("La orden de compra ya no está disponible");
    if (!isReceivingLocation(receivingLocation ? { ...receivingLocation, warehouseIsActive: receivingLocation.warehouse.isActive } : null)
      || (order.deliveryWarehouseId && receivingLocation?.warehouseId !== order.deliveryWarehouseId)) {
      throw new Error("Selecciona una zona de recepción autorizada");
    }
    if (!["CONFIRMADA", "EN_TRANSITO", "PARCIAL"].includes(order.status)) {
      throw new Error("La OC ya no está en estado de recepción");
    }
    if (input.lines.length === 0) throw new Error("Ingresa al menos una cantidad mayor a 0");
    if (new Set(input.lines.map((item) => item.lineId)).size !== input.lines.length) {
      throw new Error("La recepción contiene líneas duplicadas; vuelve a consultar la orden");
    }
    if (!input.lines.some((item) => item.qtyReceived > 0)) {
      throw new Error("Ingresa al menos una cantidad aceptada para recibir");
    }

    const orderLinesById = new Map(order.lines.map((line) => [line.id, line]));
    for (const item of input.lines) {
      const line = orderLinesById.get(item.lineId);
      if (!line || line.productId !== item.productId) throw new Error("Una línea ya no pertenece a esta orden");
      const pending = line.qtyOrdered - line.qtyReceived;
      const accounted = item.qtyReceived + item.qtyDamaged + item.qtyMissing + item.qtyRejected;
      const allQuantities = [item.qtyReceived, item.qtyDamaged, item.qtyMissing, item.qtyRejected, item.qtySurplusReported];
      if (allQuantities.some((quantity) => !Number.isFinite(quantity) || quantity < 0)) {
        throw new Error("Las cantidades de recepción deben ser números válidos no negativos");
      }
      if (item.qtyReceived > pending + 1e-8 || accounted > pending + 1e-8) {
        throw new Error("El total contado excede la cantidad pendiente; vuelve a consultar la orden");
      }
    }

    const receipt = await tx.purchaseReceipt.create({
      data: {
        purchaseOrderId: order.id,
        locationId: input.locationId,
        referenceDoc: input.referenceDoc,
        notes: input.notes,
      },
    });

    for (const item of input.lines) {
      const line = orderLinesById.get(item.lineId)!;
      const receiptLine = await tx.purchaseReceiptLine.create({
        data: {
          purchaseReceiptId: receipt.id,
          purchaseOrderLineId: item.lineId,
          productId: item.productId,
          qtyReceived: item.qtyReceived,
          qtyDamaged: item.qtyDamaged,
          qtyMissing: item.qtyMissing,
          qtyRejected: item.qtyRejected,
          qtySurplusReported: item.qtySurplusReported,
          discrepancyReason: item.discrepancyReason,
        },
      });

      const updated = await tx.purchaseOrderLine.updateMany({
        where: { id: item.lineId, purchaseOrderId: order.id, qtyReceived: line.qtyReceived },
        // Compare against the exact snapshot read above. A retry with the same
        // partial payload must fail even when enough quantity remains overall.
        data: { qtyReceived: { increment: item.qtyReceived } },
      });
      if (updated.count !== 1) throw new Error(`La cantidad pendiente cambió para ${item.productId}; vuelve a consultar la orden`);
      if (item.qtyReceived === 0) continue;

      const baseQuantity = item.qtyReceived * (line.purchaseUnitFactor ?? 1);
      const movement = await inventory.receiveStock(item.productId, input.locationId, baseQuantity, order.folio, {
        tx,
        source: "purchasing/receive",
        actor: input.actor.name,
        actorUserId: input.actor.userId,
        operatorName: input.actor.operatorName,
        operatorUserId: input.actor.userId,
        notes: input.referenceDoc ? `Recepción OC ${order.folio} — ${input.referenceDoc}` : `Recepción OC ${order.folio}`,
        documentType: "PURCHASE_RECEIPT",
        documentId: receipt.id,
        documentLineId: receiptLine.id,
      });
      if (!movement.movementId) throw new Error("No se pudo crear movimiento de inventario de recepción");

      await createMovementTraceAndLabelJob(tx, {
        movementId: movement.movementId,
        labelType: "RECEIPT",
        sourceEntityType: "PURCHASE_RECEIPT_LINE",
        sourceEntityId: receiptLine.id,
        operatorName: input.actor.operatorName,
        operatorUserId: input.actor.userId,
      });
    }

    const updatedLines = await tx.purchaseOrderLine.findMany({
      where: { purchaseOrderId: order.id },
      select: { qtyOrdered: true, qtyReceived: true },
    });
    const allDone = updatedLines.every((line) => line.qtyReceived >= line.qtyOrdered - 1e-8);
    const anyDone = updatedLines.some((line) => line.qtyReceived > 0);
    const newStatus = allDone ? "RECIBIDA" : anyDone ? "PARCIAL" : order.status;
    const statusUpdate = await tx.purchaseOrder.updateMany({
      where: { id: order.id, status: order.status },
      data: { status: newStatus as never },
    });
    if (statusUpdate.count !== 1) throw new Error("El estado de la OC cambió durante la recepción; vuelve a consultar la orden");

    await createAuditLogSafeWithDb({
      entityType: "PURCHASE_ORDER",
      entityId: order.id,
      action: "RECEIVE",
      source: "purchasing/receive",
      before: {
        status: order.status,
        lines: input.lines.map((item) => ({
          lineId: item.lineId,
          qtyReceived: orderLinesById.get(item.lineId)?.qtyReceived ?? null,
        })),
      },
      after: {
        locationId: input.locationId,
        referenceDoc: input.referenceDoc,
        lines: input.lines,
        newStatus,
        operatorAlias: input.actor.operatorName,
      },
      actor: input.actor.name,
      actorUserId: input.actor.userId,
    }, tx);

    return receipt.id;
  }, { timeout: 20000 });
}
