import type { Prisma } from "@prisma/client";

type TxClient = Prisma.TransactionClient;

type ReservationScope = {
  productId: string;
  locationId: string;
};

function key(productId: string, locationId: string) {
  return `${productId}:${locationId}`;
}

async function buildDesiredReservedByPair(
  tx: TxClient,
  opts?: { scope?: ReservationScope[]; excludeOrderId?: string }
) {
  const scopePairs = (opts?.scope ?? []).filter((row) => row.productId && row.locationId);
  const uniqueScopeKeys = new Set(scopePairs.map((row) => key(row.productId, row.locationId)));
  const scopeSet = uniqueScopeKeys.size > 0 ? uniqueScopeKeys : null;

  const openOrders = await tx.productionOrder.findMany({
    where: {
      status: { in: ["ABIERTA", "EN_PROCESO"] },
      ...(opts?.excludeOrderId ? { id: { not: opts.excludeOrderId } } : {}),
    },
    select: {
      id: true,
      items: {
        select: {
          productId: true,
          locationId: true,
          quantity: true,
        },
      },
      assemblyWorkOrder: {
        select: {
          lines: {
            select: {
              productId: true,
              pickTasks: {
                select: {
                  sourceLocationId: true,
                  reservedQty: true,
                  pickedQty: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const desiredByKey = new Map<string, number>();

  for (const order of openOrders) {
    if (order.items.length > 0) {
      for (const item of order.items) {
        const pairKey = key(item.productId, item.locationId);
        if (scopeSet && !scopeSet.has(pairKey)) continue;
        desiredByKey.set(pairKey, (desiredByKey.get(pairKey) ?? 0) + item.quantity);
      }
      continue;
    }

    const legacyLines = order.assemblyWorkOrder?.lines ?? [];
    for (const line of legacyLines) {
      for (const task of line.pickTasks) {
        const pendingReserved = Math.max(0, task.reservedQty - task.pickedQty);
        if (pendingReserved <= 0) continue;
        const pairKey = key(line.productId, task.sourceLocationId);
        if (scopeSet && !scopeSet.has(pairKey)) continue;
        desiredByKey.set(pairKey, (desiredByKey.get(pairKey) ?? 0) + pendingReserved);
      }
    }
  }

  return desiredByKey;
}

export async function reconcileProductionReservations(tx: TxClient, scope?: ReservationScope[]) {
  const scopePairs = (scope ?? []).filter((row) => row.productId && row.locationId);
  const uniqueScopeKeys = new Set(scopePairs.map((row) => key(row.productId, row.locationId)));
  const scopedPairs = Array.from(uniqueScopeKeys).map((pair) => {
    const [productId, locationId] = pair.split(":");
    return { productId, locationId };
  });

  const [desiredByKey, inventoryRows] = await Promise.all([
    buildDesiredReservedByPair(tx, { scope }),
    tx.inventory.findMany({
      where: scopedPairs.length > 0 ? { OR: scopedPairs } : undefined,
      select: { id: true, productId: true, locationId: true, quantity: true, reserved: true },
    }),
  ]);

  for (const inv of inventoryRows) {
    const requested = desiredByKey.get(key(inv.productId, inv.locationId)) ?? 0;
    const desiredReserved = Math.max(0, Math.min(inv.quantity, requested));
    const desiredAvailable = inv.quantity - desiredReserved;

    if (desiredReserved !== inv.reserved || desiredAvailable !== inv.quantity - inv.reserved) {
      await tx.inventory.update({
        where: { id: inv.id },
        data: { reserved: desiredReserved, available: desiredAvailable },
      });
    }
  }
}

export async function assertCanSetOrderInProcess(tx: TxClient, orderId: string) {
  const order = await tx.productionOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      items: {
        select: { productId: true, locationId: true, quantity: true },
      },
    },
  });

  if (!order) {
    return { ok: false, message: "Orden no encontrada" as const };
  }

  const competingMap = await buildDesiredReservedByPair(tx, { excludeOrderId: orderId });

  const uniquePairs = Array.from(new Set(order.items.map((row) => key(row.productId, row.locationId)))).map((pair) => {
    const [productId, locationId] = pair.split(":");
    return { productId, locationId };
  });

  const inventories = uniquePairs.length
    ? await tx.inventory.findMany({
        where: { OR: uniquePairs },
        select: { productId: true, locationId: true, quantity: true },
      })
    : [];
  const inventoryByKey = new Map(inventories.map((row) => [key(row.productId, row.locationId), row.quantity]));

  for (const item of order.items) {
    const qty = inventoryByKey.get(key(item.productId, item.locationId));

    if (typeof qty !== "number") {
      return { ok: false, message: "Inventario inexistente para un material de la orden" as const };
    }

    const usedByOthers = competingMap.get(key(item.productId, item.locationId)) ?? 0;
    const free = qty - usedByOthers;
    if (free < item.quantity) {
      return { ok: false, message: "Inventario insuficiente para reservar" as const };
    }
  }

  return { ok: true as const };
}
