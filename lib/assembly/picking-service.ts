import type { PrismaClient, Prisma } from "@prisma/client";
import { InventoryServiceError } from "@/lib/inventory-service";
import { createMovementTraceAndLabelJob } from "@/lib/labeling-service";
import { createAuditLogSafeWithDb } from "@/lib/audit-log";

type Tx = Prisma.TransactionClient;

async function recomputePickStates(tx: Tx, assemblyWorkOrderId: string) {
  const [tasks, lines] = await Promise.all([
    tx.pickTask.findMany({
      where: { pickList: { assemblyWorkOrderId } },
      select: { status: true, pickedQty: true, shortQty: true },
    }),
    tx.assemblyWorkOrderLine.findMany({
      where: { assemblyWorkOrderId },
      select: { id: true, requiredQty: true, pickedQty: true, consumedQty: true, wipQty: true },
    }),
  ]);

  const anyPicked = tasks.some((t) => t.pickedQty > 0);
  const anyShort = tasks.some((t) => t.shortQty > 0);
  const allTasksClosed = tasks.length > 0 && tasks.every((t) => t.status === "COMPLETED" || t.status === "CANCELLED");

  const pickStatus = allTasksClosed ? (anyShort ? "PARTIAL" : "COMPLETED") : anyPicked ? "IN_PROGRESS" : "RELEASED";
  const wipStatus = lines.every((line) => line.wipQty >= line.requiredQty)
    ? "IN_WIP"
    : lines.some((line) => line.wipQty > 0)
      ? "PARTIAL"
      : "NOT_IN_WIP";
  const consumptionStatus = lines.every((line) => line.consumedQty >= line.requiredQty)
    ? "CONSUMED"
    : lines.some((line) => line.consumedQty > 0)
      ? "PARTIAL"
      : "NOT_CONSUMED";

  await tx.assemblyWorkOrder.update({
    where: { id: assemblyWorkOrderId },
    data: {
      pickStatus,
      wipStatus,
      consumptionStatus,
      hasShortage: anyShort,
      reservationStatus: "RESERVED",
      releasedAt: anyPicked ? new Date() : undefined,
    },
  });
}

async function moveReservedToWipInTx(args: {
  tx: Tx;
  productId: string;
  fromLocationId: string;
  toWipLocationId: string;
  qty: number;
  reference: string;
  documentId: string;
  documentLineId: string;
  operatorName?: string | null;
  taskId: string;
}) {
  const { tx, productId, fromLocationId, toWipLocationId, qty, reference, documentId, documentLineId, operatorName, taskId } = args;

  const source = await tx.inventory.findUnique({
    where: { productId_locationId: { productId, locationId: fromLocationId } },
    select: { id: true, quantity: true, reserved: true, available: true },
  });
  if (!source || source.reserved < qty || source.quantity < qty) {
    throw new InventoryServiceError("INSUFFICIENT_RESERVED", "Insufficient reserved stock in source location");
  }

  const target = await tx.inventory.findUnique({
    where: { productId_locationId: { productId, locationId: toWipLocationId } },
    select: { id: true, quantity: true, reserved: true },
  });

  const nextSourceQty = source.quantity - qty;
  const nextSourceReserved = source.reserved - qty;
  const nextSourceAvailable = nextSourceQty - nextSourceReserved;

  await tx.inventory.update({
    where: { id: source.id },
    data: {
      quantity: nextSourceQty,
      reserved: nextSourceReserved,
      available: nextSourceAvailable,
    },
  });

  const nextTargetQty = (target?.quantity ?? 0) + qty;
  const targetReserved = target?.reserved ?? 0;
  const nextTargetAvailable = nextTargetQty - targetReserved;
  if (target) {
    await tx.inventory.update({
      where: { id: target.id },
      data: { quantity: nextTargetQty, available: nextTargetAvailable },
    });
  } else {
    await tx.inventory.create({
      data: {
        productId,
        locationId: toWipLocationId,
        quantity: nextTargetQty,
        reserved: 0,
        available: nextTargetQty,
      },
    });
  }

  const movement = await tx.inventoryMovement.create({
    select: { id: true },
    data: {
      productId,
      locationId: fromLocationId,
      type: "TRANSFER",
      operatorName: operatorName ?? null,
      quantity: qty,
      reference,
      notes: `Surtido a WIP (task ${taskId})`,
      documentType: "ASSEMBLY_ORDER",
      documentId,
      documentLineId,
    },
  });
  return movement.id;
}

export async function releaseAssemblyPickList(prisma: PrismaClient, productionOrderId: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.productionOrder.findUnique({
      where: { id: productionOrderId },
      select: {
        id: true,
        kind: true,
        status: true,
        sourceDocumentType: true,
        sourceDocumentId: true,
        assemblyWorkOrder: {
          select: {
            id: true,
            pickLists: {
              where: { status: { in: ["DRAFT", "RELEASED", "IN_PROGRESS", "PARTIAL"] } },
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { id: true, status: true },
            },
          },
        },
      },
    });
    if (!order || order.kind !== "ASSEMBLY_3PIECE" || !order.assemblyWorkOrder) {
      throw new InventoryServiceError("ORDER_NOT_FOUND", "Assembly order not found");
    }
    const pickList = order.assemblyWorkOrder.pickLists[0];
    if (!pickList) {
      throw new InventoryServiceError("PICKLIST_NOT_FOUND", "Pick list not found for assembly order");
    }

    if (order.sourceDocumentType !== "SalesInternalOrder" || !order.sourceDocumentId) {
      throw new InventoryServiceError(
        "SOURCE_ORDER_REQUIRED",
        "La orden de ensamble requiere un pedido de origen confirmado para liberar surtido"
      );
    }

    const sourceOrder = await tx.salesInternalOrder.findUnique({
      where: { id: order.sourceDocumentId },
      select: { id: true, status: true },
    });

    if (!sourceOrder) {
      throw new InventoryServiceError(
        "SOURCE_ORDER_NOT_FOUND",
        "No se encontro el pedido de origen vinculado a la orden de ensamble"
      );
    }

    if (sourceOrder.status !== "CONFIRMADA") {
      throw new InventoryServiceError(
        "SOURCE_ORDER_NOT_CONFIRMED",
        "Solo se puede liberar surtido cuando el pedido de origen esta CONFIRMADA"
      );
    }

    if (pickList.status === "DRAFT") {
      await tx.pickList.update({
        where: { id: pickList.id },
        data: { status: "RELEASED", releasedAt: new Date() },
      });
    }

    await tx.assemblyWorkOrder.update({
      where: { id: order.assemblyWorkOrder.id },
      data: { pickStatus: "RELEASED" },
    });

    if (order.status === "ABIERTA") {
      await tx.productionOrder.update({
        where: { id: order.id },
        data: { status: "EN_PROCESO" },
      });
    }

    await createAuditLogSafeWithDb({
      entityType: "ASSEMBLY_ORDER",
      entityId: order.id,
      action: "RELEASE_PICK_LIST",
      actor: "system",
      source: "assembly/picking-service",
      after: {
        pickListId: pickList.id,
        pickListStatus: pickList.status === "DRAFT" ? "RELEASED" : pickList.status,
        orderStatus: order.status === "ABIERTA" ? "EN_PROCESO" : order.status,
      },
    }, tx);
  }, { timeout: 20000 });
}

export async function confirmAssemblyPickTask(
  prisma: PrismaClient,
  args: { taskId: string; pickedQty: number; shortReason?: string | null; operatorName?: string | null }
) {
  if (!Number.isFinite(args.pickedQty) || args.pickedQty < 0) {
    throw new InventoryServiceError("INVALID_QTY", "Picked quantity must be zero or greater");
  }

  return prisma.$transaction(async (tx) => {
    const task = await tx.pickTask.findUnique({
      where: { id: args.taskId },
      select: {
        id: true,
        reservedQty: true,
        pickedQty: true,
        shortQty: true,
        status: true,
        sourceLocationId: true,
        targetWipLocationId: true,
        assemblyWorkOrderLineId: true,
        pickListId: true,
        assemblyWorkOrderLine: {
          select: {
            id: true,
            productId: true,
            requiredQty: true,
            reservedQty: true,
            pickedQty: true,
            wipQty: true,
            shortQty: true,
            assemblyWorkOrderId: true,
            assemblyWorkOrder: {
              select: {
                productionOrder: { select: { id: true, code: true } },
              },
            },
          },
        },
        pickList: { select: { id: true, status: true, assemblyWorkOrderId: true } },
      },
    });
    if (!task) {
      throw new InventoryServiceError("TASK_NOT_FOUND", "Pick task not found");
    }
    if (task.status === "COMPLETED" || task.status === "CANCELLED") {
      throw new InventoryServiceError("TASK_CLOSED", "Pick task is already closed");
    }
    if (!["RELEASED", "IN_PROGRESS", "PARTIAL"].includes(task.pickList.status)) {
      throw new InventoryServiceError("PICKLIST_NOT_RELEASED", "Cannot confirm pick tasks before release");
    }

    const pending = task.reservedQty - task.pickedQty;
    if (args.pickedQty > pending) {
      throw new InventoryServiceError("INVALID_QTY", "Picked quantity exceeds pending reserved quantity");
    }

    let movementId: string | null = null;
    if (args.pickedQty > 0) {
      movementId = await moveReservedToWipInTx({
        tx,
        productId: task.assemblyWorkOrderLine.productId,
        fromLocationId: task.sourceLocationId,
        toWipLocationId: task.targetWipLocationId,
        qty: args.pickedQty,
        reference: task.assemblyWorkOrderLine.assemblyWorkOrder.productionOrder.code,
        documentId: task.assemblyWorkOrderLine.assemblyWorkOrder.productionOrder.id,
        documentLineId: task.assemblyWorkOrderLine.id,
        operatorName: args.operatorName ?? null,
        taskId: task.id,
      });
    }

    const additionalShort = pending - args.pickedQty;
    const nextTaskPicked = task.pickedQty + args.pickedQty;
    const nextTaskShort = task.shortQty + additionalShort;
    const nextTaskStatus = additionalShort > 0 ? "PARTIAL" : "COMPLETED";
    await tx.pickTask.update({
      where: { id: task.id },
      data: {
        pickedQty: nextTaskPicked,
        shortQty: nextTaskShort,
        status: nextTaskStatus,
        shortReason: additionalShort > 0 ? (args.shortReason?.trim() || "FALTANTE_EN_PICK") : null,
      },
    });

    const nextLinePicked = task.assemblyWorkOrderLine.pickedQty + args.pickedQty;
    const nextLineWip = task.assemblyWorkOrderLine.wipQty + args.pickedQty;
    const nextLineShort = task.assemblyWorkOrderLine.shortQty + additionalShort;
    const nextLineStatus = nextLinePicked >= task.assemblyWorkOrderLine.requiredQty
      ? "COMPLETED"
      : nextLinePicked > 0
        ? "PARTIAL"
        : "NOT_RELEASED";
    await tx.assemblyWorkOrderLine.update({
      where: { id: task.assemblyWorkOrderLine.id },
      data: {
        pickedQty: nextLinePicked,
        wipQty: nextLineWip,
        shortQty: nextLineShort,
        pickStatus: nextLineStatus,
        wipStatus: nextLineWip >= task.assemblyWorkOrderLine.requiredQty ? "IN_WIP" : "PARTIAL",
      },
    });

    const pickListTasks = await tx.pickTask.findMany({
      where: { pickListId: task.pickListId },
      select: { status: true },
    });
    const anyPending = pickListTasks.some((row) => row.status === "PENDING" || row.status === "IN_PROGRESS");
    const anyShort = pickListTasks.some((row) => row.status === "PARTIAL");
    const allDone = pickListTasks.every((row) => row.status === "COMPLETED" || row.status === "PARTIAL" || row.status === "CANCELLED");
    const nextPickListStatus = allDone ? (anyShort ? "PARTIAL" : "COMPLETED") : anyShort ? "PARTIAL" : anyPending ? "IN_PROGRESS" : "RELEASED";
    await tx.pickList.update({
      where: { id: task.pickListId },
      data: {
        status: nextPickListStatus,
        completedAt: nextPickListStatus === "COMPLETED" ? new Date() : null,
      },
    });

    await recomputePickStates(tx, task.pickList.assemblyWorkOrderId);

    let labelJobId: string | null = null;
    let orderTraceId: string | null = null;
    if (movementId) {
      const { job, trace } = await createMovementTraceAndLabelJob(tx, {
        movementId,
        labelType: "WIP",
        sourceEntityType: "ASSEMBLY_ORDER",
        sourceEntityId: task.assemblyWorkOrderLine.assemblyWorkOrder.productionOrder.id,
        operatorName: args.operatorName ?? null,
      });
      labelJobId = job.id;
      orderTraceId = trace.traceId;
    }

    await createAuditLogSafeWithDb({
      entityType: "ASSEMBLY_PICK_TASK",
      entityId: task.id,
      action: "CONFIRM_PICK",
      actor: args.operatorName ?? "system",
      source: "assembly/picking-service",
      before: {
        taskStatus: task.status,
        pickedQty: task.pickedQty,
        shortQty: task.shortQty,
      },
      after: {
        taskStatus: nextTaskStatus,
        pickedQty: nextTaskPicked,
        shortQty: nextTaskShort,
        linePickedQty: nextLinePicked,
        lineWipQty: nextLineWip,
        movementId,
        labelJobId,
        orderTraceId,
        pickListStatus: nextPickListStatus,
      },
    }, tx);

    return {
      movementId,
      labelJobId,
      orderTraceId,
      productionOrderId: task.assemblyWorkOrderLine.assemblyWorkOrder.productionOrder.id,
    };
  }, { timeout: 20000 });
}

export async function confirmAssemblyPickTasksBatch(
  prisma: PrismaClient,
  args: {
    productionOrderId: string;
    operatorName: string;
    tasks: Array<{ taskId: string; pickedQty?: number | null; shortReason?: string | null }>;
  }
) {
  if (!args.productionOrderId) {
    throw new InventoryServiceError("ORDER_NOT_FOUND", "Assembly order not found");
  }
  if (!args.operatorName?.trim()) {
    throw new InventoryServiceError("INVALID_OPERATOR", "Operator name is required");
  }
  if (!args.tasks.length) {
    throw new InventoryServiceError("TASK_NOT_FOUND", "No pick tasks were provided");
  }

  const taskIds = args.tasks.map((task) => task.taskId);
  const dbTasks = await prisma.pickTask.findMany({
    where: { id: { in: taskIds } },
    select: {
      id: true,
      reservedQty: true,
      pickedQty: true,
      status: true,
      pickList: {
        select: {
          id: true,
          status: true,
        },
      },
      assemblyWorkOrderLine: {
        select: {
          assemblyWorkOrder: {
            select: {
              productionOrder: { select: { id: true } },
            },
          },
        },
      },
    },
  });

  const taskById = new Map(dbTasks.map((task) => [task.id, task]));
  for (const task of args.tasks) {
    const dbTask = taskById.get(task.taskId);
    if (!dbTask) {
      throw new InventoryServiceError("TASK_NOT_FOUND", `Pick task not found: ${task.taskId}`);
    }
    if (dbTask.assemblyWorkOrderLine.assemblyWorkOrder.productionOrder.id !== args.productionOrderId) {
      throw new InventoryServiceError("TASK_NOT_FOUND", "Pick task does not belong to the provided assembly order");
    }
    if (dbTask.status === "COMPLETED" || dbTask.status === "CANCELLED") {
      throw new InventoryServiceError("TASK_CLOSED", "One or more pick tasks are already closed");
    }
    if (!["RELEASED", "IN_PROGRESS", "PARTIAL"].includes(dbTask.pickList.status)) {
      throw new InventoryServiceError("PICKLIST_NOT_RELEASED", "Cannot confirm pick tasks before release");
    }
  }

  const results: Array<Awaited<ReturnType<typeof confirmAssemblyPickTask>>> = [];
  for (const task of args.tasks) {
    const dbTask = taskById.get(task.taskId);
    if (!dbTask) continue;
    const pending = Math.max(0, dbTask.reservedQty - dbTask.pickedQty);
    const pickedQty = task.pickedQty == null ? pending : task.pickedQty;
    const result = await confirmAssemblyPickTask(prisma, {
      taskId: task.taskId,
      pickedQty,
      shortReason: task.shortReason ?? null,
      operatorName: args.operatorName,
    });
    results.push(result);
  }

  const labelJobIds = results.map((result) => result.labelJobId).filter((value): value is string => Boolean(value));
  const traceIds = results.map((result) => result.orderTraceId).filter((value): value is string => Boolean(value));

  return {
    processedCount: results.length,
    labelJobIds,
    traceIds,
  };
}
