import type { PrismaClient, Prisma, ProductionOrderStatus } from "@prisma/client";
import { InventoryService, InventoryServiceError } from "@/lib/inventory-service";
import { reconcileProductionReservations } from "@/lib/reservation-policy";

type Tx = Prisma.TransactionClient;

type ItemScope = {
  productId: string;
  locationId: string;
};

function withTransaction<T>(prisma: PrismaClient, fn: (tx: Tx) => Promise<T>) {
  return prisma.$transaction((tx) => fn(tx), { timeout: 20000 });
}

function isActiveStatus(status: ProductionOrderStatus) {
  return status === "ABIERTA" || status === "EN_PROCESO";
}

function dedupeScope(scope: ItemScope[]) {
  const seen = new Set<string>();
  const unique: ItemScope[] = [];
  for (const row of scope) {
    if (!row.productId || !row.locationId) continue;
    const key = `${row.productId}:${row.locationId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }
  return unique;
}

function assertGenericEditableStatus(status: ProductionOrderStatus) {
  if (status === "COMPLETADA" || status === "CANCELADA") {
    throw new InventoryServiceError("INVALID_ORDER_STATE", "La orden está cerrada y no permite edición");
  }
}

async function loadGenericOrder(tx: Tx, orderId: string) {
  const order = await tx.productionOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      code: true,
      kind: true,
      status: true,
      items: {
        select: { id: true, productId: true, locationId: true, quantity: true },
      },
    },
  });

  if (!order || order.kind !== "GENERIC") {
    throw new InventoryServiceError("ORDER_NOT_FOUND", "Orden genérica no encontrada");
  }

  return order;
}

async function writeAudit(tx: Tx, orderId: string, action: string, after: unknown) {
  await tx.auditLog.create({
    data: {
      entityType: "PRODUCTION_ORDER",
      entityId: orderId,
      action,
      after: JSON.stringify(after),
      source: "production/generic-order-service",
      actor: "system",
    },
  });
}

export async function addGenericOrderItem(
  prisma: PrismaClient,
  args: { orderId: string; productId: string; locationId: string; quantity: number }
) {
  const qty = Number(args.quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new InventoryServiceError("INVALID_QTY", "Cantidad inválida");
  }

  const inventoryService = new InventoryService(prisma);

  return withTransaction(prisma, async (tx) => {
    const order = await loadGenericOrder(tx, args.orderId);
    assertGenericEditableStatus(order.status);

    const existing = await tx.productionOrderItem.findUnique({
      where: {
        orderId_productId_locationId: {
          orderId: order.id,
          productId: args.productId,
          locationId: args.locationId,
        },
      },
      select: { id: true, quantity: true },
    });

    const nextQty = (existing?.quantity ?? 0) + qty;

    const item = existing
      ? await tx.productionOrderItem.update({
          where: { id: existing.id },
          data: { quantity: nextQty },
          select: { id: true, quantity: true, productId: true, locationId: true },
        })
      : await tx.productionOrderItem.create({
          data: {
            orderId: order.id,
            productId: args.productId,
            locationId: args.locationId,
            quantity: nextQty,
          },
          select: { id: true, quantity: true, productId: true, locationId: true },
        });

    if (isActiveStatus(order.status)) {
      await inventoryService.reserveStock(item.productId, item.locationId, qty, {
        tx,
        reference: order.code,
        notes: "Reserva automática por orden genérica activa",
        documentType: "PRODUCTION_ORDER_GENERIC",
        documentId: order.id,
        documentLineId: item.id,
      });
    }

    await writeAudit(tx, order.id, "UPSERT_GENERIC_ITEM", {
      itemId: item.id,
      productId: item.productId,
      locationId: item.locationId,
      quantity: item.quantity,
      delta: qty,
      status: order.status,
    });

    return item;
  });
}

export async function updateGenericOrderItemQty(
  prisma: PrismaClient,
  args: { orderId: string; itemId: string; quantity: number }
) {
  const qty = Number(args.quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new InventoryServiceError("INVALID_QTY", "Cantidad inválida");
  }

  const inventoryService = new InventoryService(prisma);

  return withTransaction(prisma, async (tx) => {
    const order = await loadGenericOrder(tx, args.orderId);
    assertGenericEditableStatus(order.status);

    const item = await tx.productionOrderItem.findFirst({
      where: { id: args.itemId, orderId: order.id },
      select: { id: true, productId: true, locationId: true, quantity: true },
    });

    if (!item) {
      throw new InventoryServiceError("ORDER_ITEM_NOT_FOUND", "Línea de orden no encontrada");
    }

    const delta = qty - item.quantity;
    const isActive = isActiveStatus(order.status);

    if (isActive && delta > 0) {
      await inventoryService.reserveStock(item.productId, item.locationId, delta, {
        tx,
        reference: order.code,
        notes: "Ajuste de reserva por edición de orden genérica",
        documentType: "PRODUCTION_ORDER_GENERIC",
        documentId: order.id,
        documentLineId: item.id,
      });
    }

    if (isActive && delta < 0) {
      await inventoryService.releaseReservedStock(item.productId, item.locationId, Math.abs(delta), {
        tx,
        reference: order.code,
        notes: "Liberación de reserva por edición de orden genérica",
        documentType: "PRODUCTION_ORDER_GENERIC",
        documentId: order.id,
        documentLineId: item.id,
      });
    }

    const updated = await tx.productionOrderItem.update({
      where: { id: item.id },
      data: { quantity: qty },
      select: { id: true, productId: true, locationId: true, quantity: true },
    });

    if (isActive) {
      await reconcileProductionReservations(tx, [{ productId: updated.productId, locationId: updated.locationId }]);
    }

    await writeAudit(tx, order.id, "UPDATE_GENERIC_ITEM_QTY", {
      itemId: updated.id,
      productId: updated.productId,
      locationId: updated.locationId,
      previousQty: item.quantity,
      quantity: updated.quantity,
      delta,
      status: order.status,
    });

    return updated;
  });
}

export async function removeGenericOrderItem(
  prisma: PrismaClient,
  args: { orderId: string; itemId: string }
) {
  const inventoryService = new InventoryService(prisma);

  return withTransaction(prisma, async (tx) => {
    const order = await loadGenericOrder(tx, args.orderId);
    assertGenericEditableStatus(order.status);

    const item = await tx.productionOrderItem.findFirst({
      where: { id: args.itemId, orderId: order.id },
      select: { id: true, productId: true, locationId: true, quantity: true },
    });

    if (!item) {
      throw new InventoryServiceError("ORDER_ITEM_NOT_FOUND", "Línea de orden no encontrada");
    }

    if (isActiveStatus(order.status)) {
      await inventoryService.releaseReservedStock(item.productId, item.locationId, item.quantity, {
        tx,
        reference: order.code,
        notes: "Liberación de reserva por eliminación de línea genérica",
        documentType: "PRODUCTION_ORDER_GENERIC",
        documentId: order.id,
        documentLineId: item.id,
      });
    }

    await tx.productionOrderItem.delete({ where: { id: item.id } });

    if (isActiveStatus(order.status)) {
      await reconcileProductionReservations(tx, [{ productId: item.productId, locationId: item.locationId }]);
    }

    await writeAudit(tx, order.id, "REMOVE_GENERIC_ITEM", {
      itemId: item.id,
      productId: item.productId,
      locationId: item.locationId,
      quantity: item.quantity,
      status: order.status,
    });
  });
}

export async function transitionGenericOrderStatus(
  prisma: PrismaClient,
  args: { orderId: string; targetStatus: ProductionOrderStatus }
) {
  return withTransaction(prisma, async (tx) => {
    const order = await loadGenericOrder(tx, args.orderId);
    const current = order.status;
    const target = args.targetStatus;

    if (current === target) {
      return { id: order.id, status: current, changed: false };
    }

    if (current === "COMPLETADA" || current === "CANCELADA") {
      throw new InventoryServiceError("INVALID_ORDER_STATE", "La orden ya está cerrada y no permite transición");
    }

    const activeScope = dedupeScope(order.items.map((item) => ({ productId: item.productId, locationId: item.locationId })));

    const inventoryService = new InventoryService(prisma);
    const isCurrentActive = isActiveStatus(current);

    if (current === "BORRADOR") {
      if (target === "ABIERTA" || target === "EN_PROCESO") {
        for (const item of order.items) {
          await inventoryService.reserveStock(item.productId, item.locationId, item.quantity, {
            tx,
            reference: order.code,
            notes: "Reserva al activar orden genérica",
            documentType: "PRODUCTION_ORDER_GENERIC",
            documentId: order.id,
            documentLineId: item.id,
          });
        }
      } else if (target !== "CANCELADA") {
        throw new InventoryServiceError("INVALID_ORDER_STATE", `Transición inválida ${current} -> ${target}`);
      }
    } else if (current === "ABIERTA") {
      if (target !== "EN_PROCESO" && target !== "CANCELADA" && target !== "COMPLETADA") {
        throw new InventoryServiceError("INVALID_ORDER_STATE", `Transición inválida ${current} -> ${target}`);
      }
    } else if (current === "EN_PROCESO") {
      if (target !== "ABIERTA" && target !== "CANCELADA" && target !== "COMPLETADA") {
        throw new InventoryServiceError("INVALID_ORDER_STATE", `Transición inválida ${current} -> ${target}`);
      }
    }

    if (target === "CANCELADA" && isCurrentActive) {
      for (const item of order.items) {
        await inventoryService.releaseReservedStock(item.productId, item.locationId, item.quantity, {
          tx,
          reference: order.code,
          notes: "Liberación de reserva al cancelar orden genérica",
          documentType: "PRODUCTION_ORDER_GENERIC",
          documentId: order.id,
          documentLineId: item.id,
        });
      }
    }

    if (target === "COMPLETADA") {
      if (!isCurrentActive) {
        throw new InventoryServiceError("INVALID_ORDER_STATE", `Transición inválida ${current} -> ${target}`);
      }

      for (const item of order.items) {
        await inventoryService.releaseReservedStock(item.productId, item.locationId, item.quantity, {
          tx,
          reference: order.code,
          notes: "Liberación de reserva al completar orden genérica",
          documentType: "PRODUCTION_ORDER_GENERIC",
          documentId: order.id,
          documentLineId: item.id,
        });

        await inventoryService.pickStock(item.productId, item.locationId, item.quantity, order.code, {
          tx,
          notes: "Consumo final de orden genérica",
          documentType: "PRODUCTION_ORDER_GENERIC",
          documentId: order.id,
          documentLineId: item.id,
        });
      }
    }

    const updated = await tx.productionOrder.update({
      where: { id: order.id },
      data: { status: target },
      select: { id: true, status: true },
    });

    if ((target === "CANCELADA" || target === "COMPLETADA") && activeScope.length > 0) {
      await reconcileProductionReservations(tx, activeScope);
    }

    await writeAudit(tx, order.id, "TRANSITION_GENERIC_STATUS", {
      previousStatus: current,
      status: target,
      itemCount: order.items.length,
      scopePairs: activeScope.length,
    });

    return { id: updated.id, status: updated.status, changed: true };
  });
}
