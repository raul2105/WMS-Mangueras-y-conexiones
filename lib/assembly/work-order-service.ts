import type { PrismaClient, Prisma } from "@prisma/client";
import { InventoryServiceError } from "@/lib/inventory-service";
import { buildAssemblyRequirements, previewAssemblyAvailability } from "@/lib/assembly/availability-service";
import type { AssemblyConfigInput, AssemblyOrderDraftHeaderInput } from "@/lib/assembly/types";

type Tx = Prisma.TransactionClient;

function nextYearSequenceCode(prefix: string, year: number, sequence: number) {
  return `${prefix}-${year}-${String(sequence).padStart(4, "0")}`;
}

async function generateProductionOrderCode(tx: Tx) {
  const year = new Date().getFullYear();
  const count = await tx.productionOrder.count({
    where: {
      kind: "ASSEMBLY_3PIECE",
      code: { startsWith: `ENS-${year}-` },
    },
  });
  return nextYearSequenceCode("ENS", year, count + 1);
}

async function ensureWarehouseWipLocation(tx: Tx, warehouseId: string) {
  const warehouse = await tx.warehouse.findUnique({
    where: { id: warehouseId },
    select: { id: true, code: true, name: true },
  });
  if (!warehouse) {
    throw new InventoryServiceError("WAREHOUSE_NOT_FOUND", "Warehouse not found");
  }

  const wipCode = `WIP-${warehouse.code}`;
  const existing = await tx.location.findUnique({
    where: { code: wipCode },
    select: { id: true, code: true },
  });
  if (existing) {
    return existing;
  }

  return tx.location.create({
    data: {
      code: wipCode,
      name: `Mesa WIP ${warehouse.name}`,
      zone: "WIP",
      isActive: true,
      usageType: "WIP",
      warehouseId,
    },
    select: { id: true, code: true },
  });
}

async function reserveInventoryInTx(args: {
  tx: Tx;
  productId: string;
  locationId: string;
  qty: number;
  reference: string;
  documentType: string;
  documentId: string;
  documentLineId: string;
}) {
  const { tx, productId, locationId, qty, reference, documentType, documentId, documentLineId } = args;
  const row = await tx.inventory.findUnique({
    where: { productId_locationId: { productId, locationId } },
    select: { id: true, quantity: true, reserved: true, available: true },
  });
  if (!row || row.available < qty) {
    throw new InventoryServiceError("INSUFFICIENT_AVAILABLE", "Insufficient available stock for reservation");
  }
  const nextReserved = row.reserved + qty;
  const nextAvailable = row.quantity - nextReserved;
  await tx.inventory.update({
    where: { id: row.id },
    data: { reserved: nextReserved, available: nextAvailable },
  });
  await tx.inventoryMovement.create({
    data: {
      productId,
      locationId,
      type: "ADJUSTMENT",
      quantity: 0,
      reference,
      notes: "Reserva de ensamble",
      documentType,
      documentId,
      documentLineId,
    },
  });
}

async function releaseInventoryReservationInTx(args: {
  tx: Tx;
  productId: string;
  locationId: string;
  qty: number;
  reference: string;
  documentType: string;
  documentId: string;
  documentLineId: string;
}) {
  const { tx, productId, locationId, qty, reference, documentType, documentId, documentLineId } = args;
  if (qty <= 0) return;
  const row = await tx.inventory.findUnique({
    where: { productId_locationId: { productId, locationId } },
    select: { id: true, quantity: true, reserved: true },
  });
  if (!row) return;

  const releaseQty = Math.min(row.reserved, qty);
  const nextReserved = row.reserved - releaseQty;
  const nextAvailable = row.quantity - nextReserved;
  await tx.inventory.update({
    where: { id: row.id },
    data: { reserved: nextReserved, available: nextAvailable },
  });
  await tx.inventoryMovement.create({
    data: {
      productId,
      locationId,
      type: "ADJUSTMENT",
      quantity: 0,
      reference,
      notes: "Liberacion de reserva de ensamble",
      documentType,
      documentId,
      documentLineId,
    },
  });
}

async function createAssemblyOperationalRecordsInTx(args: {
  tx: Tx;
  order: { id: string; code: string; warehouseId: string };
  input: AssemblyConfigInput;
  requirements: ReturnType<typeof buildAssemblyRequirements>;
  preview: Awaited<ReturnType<typeof previewAssemblyAvailability>>;
}) {
  const { tx, order, input, requirements, preview } = args;
  const wipLocation = await ensureWarehouseWipLocation(tx, order.warehouseId);

  await tx.assemblyConfiguration.create({
    data: {
      productionOrderId: order.id,
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

  const assemblyWorkOrder = await tx.assemblyWorkOrder.create({
    data: {
      productionOrderId: order.id,
      warehouseId: order.warehouseId,
      wipLocationId: wipLocation.id,
      availabilityStatus: "EXACT",
      reservationStatus: "RESERVED",
      pickStatus: "NOT_RELEASED",
      wipStatus: "NOT_IN_WIP",
      consumptionStatus: "NOT_CONSUMED",
      hasShortage: false,
    },
    select: { id: true },
  });

  const lineByRole = new Map<string, { id: string; productId: string }>();
  for (const requirement of requirements) {
    const line = await tx.assemblyWorkOrderLine.create({
      data: {
        assemblyWorkOrderId: assemblyWorkOrder.id,
        componentRole: requirement.role,
        productId: requirement.productId,
        unitLabel: requirement.unitLabel,
        perAssemblyQty: requirement.perAssemblyQty,
        requiredQty: requirement.requiredQty,
        reservedQty: 0,
        pickedQty: 0,
        wipQty: 0,
        consumedQty: 0,
        shortQty: 0,
        reservationStatus: "RESERVED",
        pickStatus: "NOT_RELEASED",
        wipStatus: "NOT_IN_WIP",
        consumptionStatus: "NOT_CONSUMED",
      },
      select: { id: true, productId: true },
    });
    lineByRole.set(requirement.role, line);
  }

  const year = new Date().getFullYear();
  const pickCount = await tx.pickList.count({ where: { code: { startsWith: `PK-ENS-${year}-` } } });
  const pickCode = `PK-ENS-${year}-${String(pickCount + 1).padStart(4, "0")}`;
  const pickList = await tx.pickList.create({
    data: {
      code: pickCode,
      assemblyWorkOrderId: assemblyWorkOrder.id,
      status: "DRAFT",
    },
    select: { id: true },
  });

  let sequence = 1;
  const reservedByLineId = new Map<string, number>();
  for (const allocation of preview.allocations) {
    const line = lineByRole.get(allocation.role);
    if (!line) continue;

    await reserveInventoryInTx({
      tx,
      productId: allocation.productId,
      locationId: allocation.locationId,
      qty: allocation.requestedQty,
      reference: order.code,
      documentType: "ASSEMBLY_ORDER",
      documentId: order.id,
      documentLineId: line.id,
    });

    await tx.pickTask.create({
      data: {
        pickListId: pickList.id,
        assemblyWorkOrderLineId: line.id,
        sourceLocationId: allocation.locationId,
        targetWipLocationId: wipLocation.id,
        sequence,
        requestedQty: allocation.requestedQty,
        reservedQty: allocation.requestedQty,
        pickedQty: 0,
        shortQty: 0,
        status: "PENDING",
      },
    });
    sequence += 1;

    reservedByLineId.set(line.id, (reservedByLineId.get(line.id) ?? 0) + allocation.requestedQty);
  }

  for (const [lineId, reservedQty] of reservedByLineId.entries()) {
    await tx.assemblyWorkOrderLine.update({
      where: { id: lineId },
      data: { reservedQty },
    });
  }

  await tx.auditLog.create({
    data: {
      entityType: "ASSEMBLY_ORDER",
      entityId: order.id,
      action: "CONFIGURE_EXACT",
      after: JSON.stringify({
        code: order.code,
        warehouseId: order.warehouseId,
        requirements,
        allocations: preview.allocations,
        pickListCode: pickCode,
      }),
      source: "assembly/work-order-service",
      actor: "system",
    },
  });

  return { orderId: order.id, code: order.code };
}

export async function createAssemblyOrderDraftHeader(prisma: PrismaClient, input: AssemblyOrderDraftHeaderInput) {
  return prisma.$transaction(async (tx) => {
    const warehouse = await tx.warehouse.findUnique({
      where: { id: input.warehouseId },
      select: { id: true },
    });
    if (!warehouse) {
      throw new InventoryServiceError("WAREHOUSE_NOT_FOUND", "Warehouse not found");
    }

    const code = await generateProductionOrderCode(tx);
    const order = await tx.productionOrder.create({
      data: {
        code,
        kind: "ASSEMBLY_3PIECE",
        status: "BORRADOR",
        warehouseId: input.warehouseId,
        customerName: input.customerName,
        dueDate: input.dueDate,
        priority: input.priority ?? 3,
        notes: input.notes ?? null,
      },
      select: { id: true, code: true },
    });

    await tx.auditLog.create({
      data: {
        entityType: "ASSEMBLY_ORDER",
        entityId: order.id,
        action: "CREATE_DRAFT_HEADER",
        after: JSON.stringify({
          code: order.code,
          warehouseId: input.warehouseId,
          customerName: input.customerName,
          dueDate: input.dueDate.toISOString(),
          priority: input.priority ?? 3,
        }),
        source: "assembly/work-order-service",
        actor: "system",
      },
    });

    return { orderId: order.id, code: order.code };
  }, { timeout: 20000 });
}

export async function configureAssemblyOrderExact(
  prisma: PrismaClient,
  productionOrderId: string,
  input: AssemblyConfigInput
) {
  const requirements = buildAssemblyRequirements(input);

  return prisma.$transaction(async (tx) => {
    const order = await tx.productionOrder.findUnique({
      where: { id: productionOrderId },
      select: {
        id: true,
        code: true,
        kind: true,
        status: true,
        warehouseId: true,
        assemblyConfiguration: { select: { id: true } },
        assemblyWorkOrder: { select: { id: true } },
      },
    });
    if (!order || order.kind !== "ASSEMBLY_3PIECE") {
      throw new InventoryServiceError("ORDER_NOT_FOUND", "Assembly order not found");
    }
    if (order.assemblyConfiguration || order.assemblyWorkOrder) {
      throw new InventoryServiceError("ORDER_ALREADY_CONFIGURED", "Assembly order is already configured");
    }
    if (order.status !== "BORRADOR") {
      throw new InventoryServiceError("INVALID_ORDER_STATE", "Assembly order must be draft before configuration");
    }
    if (order.warehouseId !== input.warehouseId) {
      throw new InventoryServiceError("WAREHOUSE_MISMATCH", "Assembly configuration must use the order warehouse");
    }

    const preview = await previewAssemblyAvailability(tx, input);
    if (!preview.exact) {
      throw new InventoryServiceError("INSUFFICIENT_AVAILABLE", "Assembly order requires exact stock for all three components");
    }

    const result = await createAssemblyOperationalRecordsInTx({
      tx,
      order,
      input,
      requirements,
      preview,
    });

    await tx.productionOrder.update({
      where: { id: order.id },
      data: { status: "ABIERTA" },
    });

    return result;
  }, { timeout: 20000 });
}

export async function cancelAssemblyWorkOrder(prisma: PrismaClient, productionOrderId: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.productionOrder.findUnique({
      where: { id: productionOrderId },
      select: {
        id: true,
        code: true,
        status: true,
        kind: true,
        assemblyWorkOrder: {
          select: {
            id: true,
            pickStatus: true,
            lines: {
              select: {
                id: true,
                productId: true,
                reservedQty: true,
                pickedQty: true,
                wipQty: true,
                consumedQty: true,
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
    if (!order || order.kind !== "ASSEMBLY_3PIECE" || !order.assemblyWorkOrder) {
      throw new InventoryServiceError("ORDER_NOT_FOUND", "Assembly order not found");
    }

    if (order.status === "COMPLETADA" || order.status === "CANCELADA") {
      throw new InventoryServiceError("INVALID_ORDER_STATE", "Cannot cancel an order that is already completed or cancelled");
    }

    if (order.assemblyWorkOrder.pickStatus !== "NOT_RELEASED") {
      throw new InventoryServiceError("INVALID_ORDER_STATE", "Cannot cancel after pick list release");
    }

    const hasConsumed = order.assemblyWorkOrder.lines.some((line) => line.consumedQty > 0);
    if (hasConsumed) {
      throw new InventoryServiceError("CONSUMPTION_PENDING", "Cannot cancel an order with consumed material");
    }

    const hasWip = order.assemblyWorkOrder.lines.some((line) => line.wipQty > 0);
    if (hasWip) {
      throw new InventoryServiceError("WIP_PENDING", "Cannot cancel an order with material already picked to WIP");
    }

    for (const line of order.assemblyWorkOrder.lines) {
      for (const task of line.pickTasks) {
        const pendingReserved = Math.max(0, task.reservedQty - task.pickedQty);
        await releaseInventoryReservationInTx({
          tx,
          productId: line.productId,
          locationId: task.sourceLocationId,
          qty: pendingReserved,
          reference: order.code,
          documentType: "ASSEMBLY_ORDER",
          documentId: order.id,
          documentLineId: line.id,
        });
      }
    }

    await tx.pickTask.updateMany({
      where: { pickList: { assemblyWorkOrderId: order.assemblyWorkOrder.id } },
      data: { status: "CANCELLED" },
    });
    await tx.pickList.updateMany({
      where: { assemblyWorkOrderId: order.assemblyWorkOrder.id },
      data: { status: "CANCELLED", canceledAt: new Date() },
    });
    await tx.assemblyWorkOrderLine.updateMany({
      where: { assemblyWorkOrderId: order.assemblyWorkOrder.id },
      data: {
        reservedQty: 0,
        reservationStatus: "RELEASED",
        pickStatus: "CANCELED",
      },
    });
    await tx.assemblyWorkOrder.update({
      where: { id: order.assemblyWorkOrder.id },
      data: {
        reservationStatus: "RELEASED",
        pickStatus: "CANCELED",
        canceledAt: new Date(),
      },
    });
    await tx.productionOrder.update({
      where: { id: order.id },
      data: { status: "CANCELADA" },
    });
  }, { timeout: 20000 });
}

export async function closeAssemblyWorkOrderConsume(
  prisma: PrismaClient,
  productionOrderId: string,
  operatorName?: string | null
) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.productionOrder.findUnique({
      where: { id: productionOrderId },
      select: {
        id: true,
        code: true,
        kind: true,
        status: true,
        assemblyWorkOrder: {
          select: {
            id: true,
            wipLocationId: true,
            pickStatus: true,
            wipStatus: true,
            consumptionStatus: true,
            lines: {
              select: {
                id: true,
                productId: true,
                requiredQty: true,
                wipQty: true,
                consumedQty: true,
              },
            },
          },
        },
      },
    });
    if (!order || order.kind !== "ASSEMBLY_3PIECE" || !order.assemblyWorkOrder) {
      throw new InventoryServiceError("ORDER_NOT_FOUND", "Assembly order not found");
    }

    if (order.status === "COMPLETADA" || order.status === "CANCELADA") {
      throw new InventoryServiceError("INVALID_ORDER_STATE", "Cannot close an order that is already completed or cancelled");
    }

    if (order.assemblyWorkOrder.pickStatus !== "COMPLETED") {
      throw new InventoryServiceError("PICKING_INCOMPLETE", "Cannot close assembly order until picking is completed");
    }

    if (order.assemblyWorkOrder.consumptionStatus === "CONSUMED") {
      throw new InventoryServiceError("ALREADY_CONSUMED", "Assembly order is already consumed");
    }

    if (order.assemblyWorkOrder.wipStatus === "NOT_IN_WIP") {
      throw new InventoryServiceError("WIP_INSUFFICIENT", "WIP quantity is insufficient to close the assembly order");
    }

    for (const line of order.assemblyWorkOrder.lines) {
      const pendingToConsume = line.requiredQty - line.consumedQty;
      if (pendingToConsume <= 0) continue;
      if (line.wipQty < pendingToConsume) {
        throw new InventoryServiceError("WIP_INSUFFICIENT", "WIP quantity is insufficient to close the assembly order");
      }

      const wipInventory = await tx.inventory.findUnique({
        where: {
          productId_locationId: {
            productId: line.productId,
            locationId: order.assemblyWorkOrder.wipLocationId,
          },
        },
        select: { id: true, quantity: true, reserved: true },
      });
      if (!wipInventory || wipInventory.quantity < pendingToConsume) {
        throw new InventoryServiceError("WIP_INSUFFICIENT", "WIP location stock is insufficient for final consumption");
      }

      const nextQty = wipInventory.quantity - pendingToConsume;
      const nextAvailable = nextQty - wipInventory.reserved;
      await tx.inventory.update({
        where: { id: wipInventory.id },
        data: { quantity: nextQty, available: nextAvailable },
      });
      await tx.inventoryMovement.create({
        data: {
          productId: line.productId,
          locationId: order.assemblyWorkOrder.wipLocationId,
          type: "OUT",
          operatorName: operatorName ?? null,
          quantity: pendingToConsume,
          reference: order.code,
          notes: "Consumo final de ensamble",
          documentType: "ASSEMBLY_ORDER",
          documentId: order.id,
          documentLineId: line.id,
        },
      });
      await tx.assemblyWorkOrderLine.update({
        where: { id: line.id },
        data: {
          consumedQty: { increment: pendingToConsume },
          wipQty: { decrement: pendingToConsume },
          consumptionStatus: "CONSUMED",
          wipStatus: "CONSUMED",
        },
      });
    }

    await tx.assemblyWorkOrder.update({
      where: { id: order.assemblyWorkOrder.id },
      data: {
        consumptionStatus: "CONSUMED",
        wipStatus: "CONSUMED",
        pickStatus: "COMPLETED",
        closedAt: new Date(),
      },
    });
    await tx.productionOrder.update({
      where: { id: order.id },
      data: { status: "COMPLETADA" },
    });
  }, { timeout: 20000 });
}
