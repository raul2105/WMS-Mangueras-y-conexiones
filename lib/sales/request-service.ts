import type { Prisma, PrismaClient } from "@prisma/client";
import { createAuditLogSafeWithDb } from "@/lib/audit-log";
import { cancelAssemblyWorkOrder, configureAssemblyOrderExact, createAssemblyOrderDraftHeader } from "@/lib/assembly/work-order-service";
import { InventoryService, InventoryServiceError } from "@/lib/inventory-service";
import { getNextSalesInternalOrderCode, getNextSalesPickListCode } from "@/lib/sales/internal-orders";

type Tx = Prisma.TransactionClient;

const inventoryServiceSymbol = Symbol.for("wms.inventory-service");

type ProductLineInput = {
  orderId: string;
  productId: string;
  requestedQty: number;
  notes?: string | null;
};

type AssemblyLineInput = {
  orderId: string;
  warehouseId: string;
  entryFittingProductId: string;
  hoseProductId: string;
  exitFittingProductId: string;
  hoseLength: number;
  assemblyQuantity: number;
  sourceDocumentRef?: string | null;
  notes?: string | null;
};

type ProductAllocation = {
  lineId: string;
  productId: string;
  productSku: string;
  locationId: string;
  locationCode: string;
  requestedQty: number;
};

function getInventoryService(prisma: PrismaClient) {
  const scoped = prisma as PrismaClient & { [inventoryServiceSymbol]?: InventoryService };
  if (!scoped[inventoryServiceSymbol]) {
    scoped[inventoryServiceSymbol] = new InventoryService(prisma);
  }
  return scoped[inventoryServiceSymbol]!;
}

async function ensureEditableOrder(tx: Tx, orderId: string) {
  const order = await tx.salesInternalOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      code: true,
      status: true,
      customerName: true,
      dueDate: true,
      warehouseId: true,
      notes: true,
    },
  });

  if (!order) {
    throw new InventoryServiceError("ORDER_NOT_FOUND", "Pedido no encontrado");
  }
  if (order.status !== "BORRADOR") {
    throw new InventoryServiceError("INVALID_ORDER_STATE", "Solo se puede editar un pedido en borrador");
  }
  if (!order.warehouseId) {
    throw new InventoryServiceError("WAREHOUSE_REQUIRED", "El pedido requiere un almacén asignado");
  }

  return order;
}

async function ensureWarehouseFulfillmentTarget(tx: Tx, warehouseId: string) {
  const warehouse = await tx.warehouse.findUnique({
    where: { id: warehouseId },
    select: { id: true, code: true },
  });
  if (!warehouse) {
    throw new InventoryServiceError("WAREHOUSE_NOT_FOUND", "Almacén no encontrado");
  }

  const stagingCode = `STAGING-${warehouse.code}`;
  const staging = await tx.location.findFirst({
    where: {
      warehouseId,
      code: stagingCode,
      isActive: true,
    },
    select: { id: true, code: true, name: true, usageType: true },
  });
  if (staging) return staging;

  const shipping = await tx.location.findFirst({
    where: {
      warehouseId,
      usageType: "SHIPPING",
      isActive: true,
    },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, usageType: true },
  });
  if (shipping) return shipping;

  throw new InventoryServiceError(
    "TARGET_LOCATION_REQUIRED",
    "No hay una ubicación STAGING ni SHIPPING configurada para el almacén del pedido"
  );
}

async function ensureNoDirectFulfillmentStarted(tx: Tx, orderId: string) {
  const activePickList = await tx.salesInternalOrderPickList.findFirst({
    where: {
      orderId,
      status: {
        in: ["RELEASED", "IN_PROGRESS", "PARTIAL", "COMPLETED"],
      },
    },
    select: { id: true, code: true, status: true },
  });

  if (activePickList) {
    throw new InventoryServiceError(
      "FULFILLMENT_ALREADY_STARTED",
      `El surtido directo ya no es editable (${activePickList.code} - ${activePickList.status})`
    );
  }
}

async function releaseDraftPickListReservations(
  tx: Tx,
  prisma: PrismaClient,
  orderId: string,
  options: { deleteDrafts?: boolean } = {},
) {
  const inventoryService = getInventoryService(prisma);
  const deleteDrafts = options.deleteDrafts ?? true;
  const draftPickLists = await tx.salesInternalOrderPickList.findMany({
    where: { orderId, status: "DRAFT" },
    select: {
      id: true,
      code: true,
      tasks: {
        select: {
          id: true,
          orderLineId: true,
          sourceLocationId: true,
          reservedQty: true,
          pickedQty: true,
          orderLine: {
            select: {
              productId: true,
            },
          },
        },
      },
    },
  });

  for (const pickList of draftPickLists) {
    for (const task of pickList.tasks) {
      const productId = task.orderLine.productId;
      const pendingReserved = Math.max(0, task.reservedQty - task.pickedQty);
      if (!productId || pendingReserved <= 0) continue;

      await inventoryService.releaseReservedStock(productId, task.sourceLocationId, pendingReserved, {
        tx,
        reference: pickList.code,
        notes: "Liberación de reserva por recálculo de surtido",
        documentType: "SALES_INTERNAL_ORDER",
        documentId: orderId,
        documentLineId: task.orderLineId,
      });
    }
  }

  if (deleteDrafts && draftPickLists.length > 0) {
    await tx.salesInternalOrderPickTask.deleteMany({
      where: { pickList: { orderId, status: "DRAFT" } },
    });
    await tx.salesInternalOrderPickList.deleteMany({
      where: { orderId, status: "DRAFT" },
    });
  }
}

async function buildProductAllocations(
  tx: Tx,
  warehouseId: string,
  lines: Array<{
    id: string;
    requestedQty: number;
    product: { id: string; sku: string; name: string };
  }>
) {
  if (lines.length === 0) return [] as ProductAllocation[];

  const productIds = Array.from(new Set(lines.map((line) => line.product.id)));
  const inventoryRows = await tx.inventory.findMany({
    where: {
      productId: { in: productIds },
      available: { gt: 0 },
      location: {
        warehouseId,
        isActive: true,
        usageType: "STORAGE",
      },
    },
    select: {
      productId: true,
      available: true,
      locationId: true,
      location: {
        select: {
          code: true,
          zone: true,
          aisle: true,
          rack: true,
          level: true,
        },
      },
    },
    orderBy: [
      { location: { zone: "asc" } },
      { location: { aisle: "asc" } },
      { location: { rack: "asc" } },
      { location: { level: "asc" } },
      { location: { code: "asc" } },
    ],
  });

  const rowsByProduct = new Map<string, Array<typeof inventoryRows[number] & { remaining: number }>>();
  for (const row of inventoryRows) {
    if (!rowsByProduct.has(row.productId)) {
      rowsByProduct.set(row.productId, []);
    }
    rowsByProduct.get(row.productId)?.push({
      ...row,
      remaining: row.available,
    });
  }

  const allocations: ProductAllocation[] = [];

  for (const line of lines) {
    const rows = rowsByProduct.get(line.product.id) ?? [];
    let pending = line.requestedQty;

    for (const row of rows) {
      if (pending <= 0) break;
      const take = Math.min(row.remaining, pending);
      if (take <= 0) continue;

      allocations.push({
        lineId: line.id,
        productId: line.product.id,
        productSku: line.product.sku,
        locationId: row.locationId,
        locationCode: row.location.code,
        requestedQty: take,
      });
      row.remaining -= take;
      pending -= take;
    }

    if (pending > 0) {
      const available = line.requestedQty - pending;
      throw new InventoryServiceError(
        "INSUFFICIENT_AVAILABLE",
        `Stock insuficiente para ${line.product.sku}: requerido ${line.requestedQty}, disponible ${available}`
      );
    }
  }

  return allocations;
}

async function rebuildDraftProductPickList(tx: Tx, prisma: PrismaClient, orderId: string) {
  const order = await tx.salesInternalOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      code: true,
      warehouseId: true,
      lines: {
        where: {
          lineKind: "PRODUCT",
          productId: { not: null },
        },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          requestedQty: true,
          product: {
            select: {
              id: true,
              sku: true,
              name: true,
            },
          },
        },
      },
    },
  });

  if (!order?.warehouseId) {
    throw new InventoryServiceError("ORDER_NOT_FOUND", "Pedido no encontrado");
  }

  await ensureNoDirectFulfillmentStarted(tx, orderId);
  await releaseDraftPickListReservations(tx, prisma, orderId, { deleteDrafts: true });

  const productLines = order.lines
    .filter((line): line is typeof line & { product: NonNullable<typeof line.product> } => Boolean(line.product));

  if (productLines.length === 0) {
    return null;
  }

  const targetLocation = await ensureWarehouseFulfillmentTarget(tx, order.warehouseId);
  const allocations = await buildProductAllocations(tx, order.warehouseId, productLines);
  const inventoryService = getInventoryService(prisma);
  const pickListCode = await getNextSalesPickListCode(tx);

  const pickList = await tx.salesInternalOrderPickList.create({
    data: {
      code: pickListCode,
      orderId,
      targetLocationId: targetLocation.id,
      status: "DRAFT",
    },
    select: { id: true, code: true },
  });

  let sequence = 1;
  for (const allocation of allocations) {
    await inventoryService.reserveStock(allocation.productId, allocation.locationId, allocation.requestedQty, {
      tx,
      reference: order.code,
      notes: "Reserva para surtido directo del pedido",
      documentType: "SALES_INTERNAL_ORDER",
      documentId: orderId,
      documentLineId: allocation.lineId,
    });

    await tx.salesInternalOrderPickTask.create({
      data: {
        pickListId: pickList.id,
        orderLineId: allocation.lineId,
        sourceLocationId: allocation.locationId,
        targetLocationId: targetLocation.id,
        sequence,
        requestedQty: allocation.requestedQty,
        reservedQty: allocation.requestedQty,
        pickedQty: 0,
        shortQty: 0,
        status: "PENDING",
      },
    });
    sequence += 1;
  }

  await createAuditLogSafeWithDb({
    entityType: "SALES_INTERNAL_ORDER",
    entityId: order.id,
    action: "REBUILD_DIRECT_PICKLIST",
    actor: "system",
    source: "sales/request-service",
    after: {
      pickListCode,
      targetLocation: targetLocation.code,
      taskCount: allocations.length,
    },
  }, tx);

  return pickList;
}

export async function createSalesRequestDraftHeader(
  prisma: PrismaClient,
  args: {
    customerName: string;
    warehouseId: string;
    dueDate: Date;
    notes?: string | null;
    requestedByUserId?: string | null;
  }
) {
  return prisma.$transaction(async (tx) => {
    const code = await getNextSalesInternalOrderCode(tx);
    const created = await tx.salesInternalOrder.create({
      data: {
        code,
        customerName: args.customerName,
        warehouseId: args.warehouseId,
        dueDate: args.dueDate,
        notes: args.notes ?? null,
        requestedByUserId: args.requestedByUserId ?? null,
      },
      select: { id: true, code: true },
    });

    await createAuditLogSafeWithDb({
      entityType: "SALES_INTERNAL_ORDER",
      entityId: created.id,
      action: "CREATE_REQUEST_DRAFT",
      actor: "system",
      source: "sales/request-service",
      after: {
        code: created.code,
        customerName: args.customerName,
        warehouseId: args.warehouseId,
        dueDate: args.dueDate.toISOString(),
      },
    }, tx);

    return created;
  });
}

export async function addSalesRequestProductLine(prisma: PrismaClient, input: ProductLineInput) {
  return prisma.$transaction(async (tx) => {
    const order = await ensureEditableOrder(tx, input.orderId);

    const line = await tx.salesInternalOrderLine.create({
      data: {
        orderId: order.id,
        lineKind: "PRODUCT",
        productId: input.productId,
        requestedQty: input.requestedQty,
        notes: input.notes ?? null,
      },
      select: { id: true },
    });

    await rebuildDraftProductPickList(tx, prisma, order.id);

    await createAuditLogSafeWithDb({
      entityType: "SALES_INTERNAL_ORDER",
      entityId: order.id,
      action: "ADD_PRODUCT_LINE",
      actor: "system",
      source: "sales/request-service",
      after: {
        lineId: line.id,
        productId: input.productId,
        requestedQty: input.requestedQty,
      },
    }, tx);

    return line;
  });
}

export async function addSalesRequestAssemblyLine(prisma: PrismaClient, input: AssemblyLineInput) {
  return prisma.$transaction(async (tx) => {
    const order = await ensureEditableOrder(tx, input.orderId);

    if (order.warehouseId !== input.warehouseId) {
      throw new InventoryServiceError("WAREHOUSE_MISMATCH", "La configuración debe usar el almacén del pedido");
    }
    if (!order.customerName || !order.dueDate) {
      throw new InventoryServiceError("INVALID_ORDER_STATE", "El pedido requiere cliente y fecha compromiso para agregar ensamble");
    }

    const line = await tx.salesInternalOrderLine.create({
      data: {
        orderId: order.id,
        lineKind: "CONFIGURED_ASSEMBLY",
        requestedQty: input.assemblyQuantity,
        notes: input.notes ?? null,
      },
      select: { id: true },
    });

    await tx.salesInternalOrderAssemblyConfig.create({
      data: {
        orderLineId: line.id,
        entryFittingProductId: input.entryFittingProductId,
        hoseProductId: input.hoseProductId,
        exitFittingProductId: input.exitFittingProductId,
        hoseLength: input.hoseLength,
        assemblyQuantity: input.assemblyQuantity,
        totalHoseRequired: input.hoseLength * input.assemblyQuantity,
        sourceDocumentRef: input.sourceDocumentRef ?? null,
        notes: input.notes ?? null,
      },
    });

    const productionOrder = await createAssemblyOrderDraftHeader(tx, {
      warehouseId: order.warehouseId,
      customerName: order.customerName,
      dueDate: order.dueDate,
      priority: 3,
      notes: `Pedido ${order.code} - línea configurada`,
    });

    await configureAssemblyOrderExact(tx, productionOrder.orderId, {
      warehouseId: input.warehouseId,
      entryFittingProductId: input.entryFittingProductId,
      hoseProductId: input.hoseProductId,
      exitFittingProductId: input.exitFittingProductId,
      hoseLength: input.hoseLength,
      assemblyQuantity: input.assemblyQuantity,
      sourceDocumentRef: input.sourceDocumentRef ?? null,
      notes: input.notes ?? null,
    });

    await tx.productionOrder.update({
      where: { id: productionOrder.orderId },
      data: {
        sourceDocumentType: "SalesInternalOrder",
        sourceDocumentId: order.id,
        sourceDocumentLineId: line.id,
        notes: `Origen pedido ${order.code} / línea configurada / cantidad ${input.assemblyQuantity}`,
      },
    });

    await createAuditLogSafeWithDb({
      entityType: "SALES_INTERNAL_ORDER",
      entityId: order.id,
      action: "ADD_CONFIGURED_ASSEMBLY_LINE",
      actor: "system",
      source: "sales/request-service",
      after: {
        lineId: line.id,
        productionOrderId: productionOrder.orderId,
        assemblyQuantity: input.assemblyQuantity,
      },
    }, tx);

    return {
      lineId: line.id,
      productionOrderId: productionOrder.orderId,
    };
  });
}

export async function deleteSalesRequestLine(
  prisma: PrismaClient,
  args: {
    orderId: string;
    lineId: string;
  }
) {
  return prisma.$transaction(async (tx) => {
    const order = await ensureEditableOrder(tx, args.orderId);

    const line = await tx.salesInternalOrderLine.findFirst({
      where: {
        id: args.lineId,
        orderId: order.id,
      },
      select: {
        id: true,
        lineKind: true,
        productId: true,
      },
    });

    if (!line) {
      throw new InventoryServiceError("LINE_NOT_FOUND", "Línea no encontrada");
    }

    if (line.lineKind === "PRODUCT") {
      await ensureNoDirectFulfillmentStarted(tx, order.id);
      await tx.salesInternalOrderLine.delete({ where: { id: line.id } });
      await rebuildDraftProductPickList(tx, prisma, order.id);
    } else {
      const linkedProductionOrder = await tx.productionOrder.findFirst({
        where: {
          sourceDocumentType: "SalesInternalOrder",
          sourceDocumentId: order.id,
          sourceDocumentLineId: line.id,
        },
        select: {
          id: true,
          status: true,
          assemblyWorkOrder: {
            select: {
              pickStatus: true,
            },
          },
        },
      });

      if (linkedProductionOrder?.assemblyWorkOrder && linkedProductionOrder.assemblyWorkOrder.pickStatus !== "NOT_RELEASED") {
        throw new InventoryServiceError("INVALID_ORDER_STATE", "La línea configurada ya no se puede eliminar porque el surtido fue liberado");
      }

      if (linkedProductionOrder && linkedProductionOrder.status !== "CANCELADA") {
        await cancelAssemblyWorkOrder(tx, linkedProductionOrder.id);
      }

      await tx.salesInternalOrderLine.delete({ where: { id: line.id } });
    }

    await createAuditLogSafeWithDb({
      entityType: "SALES_INTERNAL_ORDER",
      entityId: order.id,
      action: "DELETE_REQUEST_LINE",
      actor: "system",
      source: "sales/request-service",
      after: {
        lineId: line.id,
        lineKind: line.lineKind,
      },
    }, tx);
  });
}

export async function confirmSalesRequestOrder(
  prisma: PrismaClient,
  args: {
    orderId: string;
    confirmedByUserId?: string | null;
  }
) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.salesInternalOrder.findUnique({
      where: { id: args.orderId },
      select: { id: true, code: true, status: true, _count: { select: { lines: true } } },
    });
    if (!order) {
      throw new InventoryServiceError("ORDER_NOT_FOUND", "Pedido no encontrado");
    }
    if (order.status !== "BORRADOR") {
      throw new InventoryServiceError("INVALID_ORDER_STATE", "Solo se puede confirmar un pedido en borrador");
    }
    if (order._count.lines === 0) {
      throw new InventoryServiceError("EMPTY_ORDER", "El pedido debe tener al menos una línea antes de confirmarse");
    }

    await tx.salesInternalOrder.update({
      where: { id: order.id },
      data: {
        status: "CONFIRMADA",
        confirmedAt: new Date(),
        confirmedByUserId: args.confirmedByUserId ?? null,
      },
    });

    await createAuditLogSafeWithDb({
      entityType: "SALES_INTERNAL_ORDER",
      entityId: order.id,
      action: "CONFIRM_REQUEST",
      actor: "system",
      source: "sales/request-service",
      after: { status: "CONFIRMADA", code: order.code },
    }, tx);
  });
}

export async function cancelSalesRequestOrder(
  prisma: PrismaClient,
  args: {
    orderId: string;
    cancelledByUserId?: string | null;
  }
) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.salesInternalOrder.findUnique({
      where: { id: args.orderId },
      select: {
        id: true,
        code: true,
        status: true,
      },
    });
    if (!order) {
      throw new InventoryServiceError("ORDER_NOT_FOUND", "Pedido no encontrado");
    }
    if (order.status === "CANCELADA") {
      throw new InventoryServiceError("INVALID_ORDER_STATE", "El pedido ya está cancelado");
    }

    const activeDirectPick = await tx.salesInternalOrderPickList.findFirst({
      where: {
        orderId: order.id,
        status: {
          in: ["RELEASED", "IN_PROGRESS", "PARTIAL", "COMPLETED"],
        },
      },
      select: { id: true, code: true, status: true },
    });
    if (activeDirectPick) {
      throw new InventoryServiceError(
        "INVALID_ORDER_STATE",
        `No se puede cancelar porque el surtido directo ya fue liberado (${activeDirectPick.code})`
      );
    }

    const draftPickLists = await tx.salesInternalOrderPickList.findMany({
      where: { orderId: order.id, status: "DRAFT" },
      select: {
        id: true,
      },
    });
    if (draftPickLists.length > 0) {
      await releaseDraftPickListReservations(tx, prisma, order.id, { deleteDrafts: false });
      await tx.salesInternalOrderPickTask.updateMany({
        where: { pickList: { orderId: order.id, status: "DRAFT" } },
        data: { status: "CANCELLED" },
      });
      await tx.salesInternalOrderPickList.updateMany({
        where: { orderId: order.id, status: "DRAFT" },
        data: {
          status: "CANCELLED",
          canceledAt: new Date(),
        },
      });
    }

    const linkedProductionOrders = await tx.productionOrder.findMany({
      where: {
        sourceDocumentType: "SalesInternalOrder",
        sourceDocumentId: order.id,
      },
      select: {
        id: true,
        status: true,
        assemblyWorkOrder: {
          select: {
            pickStatus: true,
          },
        },
      },
    });

    for (const linked of linkedProductionOrders) {
      if (linked.status === "CANCELADA") continue;
      if (linked.assemblyWorkOrder && linked.assemblyWorkOrder.pickStatus !== "NOT_RELEASED") {
        throw new InventoryServiceError(
          "INVALID_ORDER_STATE",
          "No se puede cancelar porque una línea de ensamble ya fue liberada"
        );
      }
      await cancelAssemblyWorkOrder(tx, linked.id);
    }

    await tx.salesInternalOrder.update({
      where: { id: order.id },
      data: {
        status: "CANCELADA",
        cancelledAt: new Date(),
        cancelledByUserId: args.cancelledByUserId ?? null,
      },
    });

    await createAuditLogSafeWithDb({
      entityType: "SALES_INTERNAL_ORDER",
      entityId: order.id,
      action: "CANCEL_REQUEST",
      actor: "system",
      source: "sales/request-service",
      after: { status: "CANCELADA", code: order.code },
    }, tx);
  });
}

function computePickListStatusFromTasks(tasks: Array<{ status: string; pickedQty: number; shortQty: number }>) {
  if (tasks.length === 0) return "DRAFT" as const;
  const anyPicked = tasks.some((task) => task.pickedQty > 0);
  const anyShort = tasks.some((task) => task.shortQty > 0 || task.status === "PARTIAL");
  const allClosed = tasks.every((task) => task.status === "COMPLETED" || task.status === "CANCELLED" || task.status === "PARTIAL");

  if (allClosed) {
    return anyShort ? ("PARTIAL" as const) : ("COMPLETED" as const);
  }
  return anyPicked ? ("IN_PROGRESS" as const) : ("RELEASED" as const);
}

export async function releaseSalesRequestPickList(prisma: PrismaClient, orderId: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.salesInternalOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        pickLists: {
          where: { status: "DRAFT" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, code: true, status: true },
        },
      },
    });
    if (!order) {
      throw new InventoryServiceError("ORDER_NOT_FOUND", "Pedido no encontrado");
    }
    if (order.status !== "CONFIRMADA") {
      throw new InventoryServiceError("INVALID_ORDER_STATE", "Solo se puede liberar surtido en pedidos confirmados");
    }

    const pickList = order.pickLists[0];
    if (!pickList) {
      throw new InventoryServiceError("PICKLIST_NOT_FOUND", "No hay una lista de surtido directa en borrador");
    }

    await tx.salesInternalOrderPickList.update({
      where: { id: pickList.id },
      data: {
        status: "RELEASED",
        releasedAt: new Date(),
      },
    });

    await createAuditLogSafeWithDb({
      entityType: "SALES_INTERNAL_ORDER",
      entityId: order.id,
      action: "RELEASE_DIRECT_PICKLIST",
      actor: "system",
      source: "sales/request-service",
      after: { pickListId: pickList.id, pickListCode: pickList.code },
    }, tx);
  });
}

export async function confirmSalesRequestPickTasksBatch(
  prisma: PrismaClient,
  args: {
    orderId: string;
    operatorName: string;
    tasks: Array<{ taskId: string; pickedQty?: number | null; shortReason?: string | null }>;
  }
) {
  const inventoryService = getInventoryService(prisma);

  return prisma.$transaction(async (tx) => {
    const dbTasks = await tx.salesInternalOrderPickTask.findMany({
      where: { id: { in: args.tasks.map((task) => task.taskId) } },
      select: {
        id: true,
        reservedQty: true,
        pickedQty: true,
        shortQty: true,
        status: true,
        sourceLocationId: true,
        targetLocationId: true,
        pickListId: true,
        orderLineId: true,
        orderLine: {
          select: {
            orderId: true,
            productId: true,
          },
        },
        pickList: {
          select: {
            id: true,
            code: true,
            status: true,
            orderId: true,
          },
        },
      },
    });

    const taskById = new Map(dbTasks.map((task) => [task.id, task]));
    for (const task of args.tasks) {
      const dbTask = taskById.get(task.taskId);
      if (!dbTask || dbTask.orderLine.orderId !== args.orderId) {
        throw new InventoryServiceError("TASK_NOT_FOUND", "La tarea de surtido no pertenece al pedido");
      }
      if (!dbTask.orderLine.productId) {
        throw new InventoryServiceError("INVALID_ORDER_STATE", "La tarea no tiene un producto asociado");
      }
      if (dbTask.pickList.status === "DRAFT") {
        throw new InventoryServiceError("INVALID_ORDER_STATE", "La lista de surtido debe estar liberada antes de confirmar tareas");
      }
      if (dbTask.status === "COMPLETED" || dbTask.status === "PARTIAL" || dbTask.status === "CANCELLED") {
        throw new InventoryServiceError("TASK_CLOSED", "Una o más tareas ya están cerradas");
      }
    }

    for (const task of args.tasks) {
      const dbTask = taskById.get(task.taskId);
      if (!dbTask || !dbTask.orderLine.productId) continue;

      const pending = Math.max(0, dbTask.reservedQty - dbTask.pickedQty);
      const pickedQty = task.pickedQty == null ? pending : task.pickedQty;
      if (!Number.isFinite(pickedQty) || pickedQty < 0 || pickedQty > pending) {
        throw new InventoryServiceError("INVALID_QTY", "La cantidad surtida es inválida");
      }

      if (pickedQty > 0) {
        await inventoryService.moveReservedStockToLocation(
          dbTask.orderLine.productId,
          dbTask.sourceLocationId,
          dbTask.targetLocationId,
          pickedQty,
          {
            tx,
            reference: dbTask.pickList.code,
            notes: `Surtido directo (${dbTask.id})`,
            fromLocationCode: undefined,
            toLocationCode: undefined,
            operatorName: args.operatorName,
            documentType: "SALES_INTERNAL_ORDER",
            documentId: args.orderId,
            documentLineId: dbTask.orderLineId,
          }
        );
      }

      const shortQty = pending - pickedQty;
      if (shortQty > 0) {
        await inventoryService.releaseReservedStock(
          dbTask.orderLine.productId,
          dbTask.sourceLocationId,
          shortQty,
          {
            tx,
            reference: dbTask.pickList.code,
            notes: `Liberacion de faltante (${dbTask.id})`,
            actor: args.operatorName,
            source: "sales/request-service",
            documentType: "SALES_INTERNAL_ORDER",
            documentId: args.orderId,
            documentLineId: dbTask.orderLineId,
          },
        );
      }
      await tx.salesInternalOrderPickTask.update({
        where: { id: dbTask.id },
        data: {
          pickedQty: dbTask.pickedQty + pickedQty,
          shortQty: dbTask.shortQty + shortQty,
          status: shortQty > 0 ? "PARTIAL" : "COMPLETED",
          shortReason: shortQty > 0 ? (task.shortReason?.trim() || "FALTANTE_EN_SURTIDO") : null,
        },
      });
    }

    const pickListIds = Array.from(new Set(dbTasks.map((task) => task.pickListId)));
    for (const pickListId of pickListIds) {
      const tasks = await tx.salesInternalOrderPickTask.findMany({
        where: { pickListId },
        select: { status: true, pickedQty: true, shortQty: true },
      });
      const nextStatus = computePickListStatusFromTasks(tasks);
      await tx.salesInternalOrderPickList.update({
        where: { id: pickListId },
        data: {
          status: nextStatus,
          completedAt: nextStatus === "COMPLETED" || nextStatus === "PARTIAL" ? new Date() : null,
        },
      });
    }

    await createAuditLogSafeWithDb({
      entityType: "SALES_INTERNAL_ORDER",
      entityId: args.orderId,
      action: "CONFIRM_DIRECT_PICK",
      actor: args.operatorName,
      source: "sales/request-service",
      after: {
        taskCount: args.tasks.length,
      },
    }, tx);

    return { processedCount: args.tasks.length };
  });
}
