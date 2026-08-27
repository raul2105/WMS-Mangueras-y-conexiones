import type { Prisma, PrismaClient } from "@prisma/client";
import { createAuditLogSafeWithDb } from "@/lib/audit-log";
import { getCustomerById, resolveCustomerSnapshot } from "@/lib/customers/customer-service";
import { cancelAssemblyWorkOrder, configureAssemblyOrderExact, createAssemblyOrderDraftHeader } from "@/lib/assembly/work-order-service";
import { InventoryService, InventoryServiceError } from "@/lib/inventory-service";
import { startPerf } from "@/lib/perf";
import { getAssemblyQuantityPolicy, getQuantityPolicy, quantityValidationMessage } from "@/lib/quantity-policy";
import { getNextSalesInternalOrderCode, getNextSalesPickListCode } from "@/lib/sales/internal-orders";
import { hasWarehouseFulfillmentOwnership } from "@/lib/sales/fulfillment-readiness";
import { calculateReservationDeltas, type ReservationDelta } from "@/lib/sales/reservation-reconciliation";
import { buildDesiredReservedByPair } from "@/lib/reservation-policy";

type Tx = Prisma.TransactionClient;

const inventoryServiceSymbol = Symbol.for("wms.inventory-service");

type ProductLineInput = {
  orderId: string;
  productId: string;
  requestedQty: number;
  notes?: string | null;
};

type InitialProductLineInput = {
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
  workingPressureBar?: number | null;
  operatingTemperatureC?: number | null;
  medium?: string | null;
  application?: string | null;
  assemblyMethod?: string | null;
  compatibilityReviewApproved?: boolean;
};

export type CreateSalesRequestDraftArgs = {
  customerId?: string | null;
  customerName?: string | null;
  requireFormalCustomer?: boolean;
  warehouseId: string;
  dueDate: Date;
  notes?: string | null;
  requestedByUserId?: string | null;
  requestedByRoles?: string[] | null;
  initialProductLine?: InitialProductLineInput | null;
};

export type CreateSalesRequestAssemblyArgs = CreateSalesRequestDraftArgs & {
  assembly: Omit<AssemblyLineInput, "orderId">;
};

export type CreateSalesRequestLineInput =
  | { kind: "PRODUCT"; productId: string; requestedQty: number; notes?: string | null }
  | {
      kind: "ASSEMBLY";
      entryFittingProductId: string;
      hoseProductId: string;
      exitFittingProductId: string;
      hoseLength: number;
      assemblyQuantity: number;
      sourceDocumentRef?: string | null;
      notes?: string | null;
      workingPressureBar?: number | null;
      operatingTemperatureC?: number | null;
      medium?: string | null;
      application?: string | null;
      assemblyMethod?: string | null;
    };

type ProductAllocation = {
  lineId: string;
  productId: string;
  productSku: string;
  locationId: string;
  locationCode: string;
  requestedQty: number;
};

type ReservationBatchItem = {
  productId: string;
  locationId: string;
  qty: number;
};

function isPrismaUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return "code" in error && (error as { code?: unknown }).code === "P2002";
}

export type MarkSalesRequestDeliveredResult =
  | { delivered: true; alreadyDelivered: false; warning: null; movementIds: string[] }
  | { delivered: true; alreadyDelivered: true; warning: string; movementIds: string[] };

export type MarkSalesRequestPreparedForDeliveryResult =
  | { prepared: true; alreadyPrepared: false; preparedAt: Date }
  | { prepared: true; alreadyPrepared: true; preparedAt: Date; warning: string };

function getInventoryService(prisma: PrismaClient) {
  const scoped = prisma as PrismaClient & { [inventoryServiceSymbol]?: InventoryService };
  if (!scoped[inventoryServiceSymbol]) {
    scoped[inventoryServiceSymbol] = new InventoryService(prisma);
  }
  return scoped[inventoryServiceSymbol]!;
}

const RESERVATION_PICK_LIST_STATUSES = ["DRAFT", "RELEASED", "IN_PROGRESS", "PARTIAL"] as const;

type ReservationReconciliationMode = "DRY_RUN" | "APPLY";

export type SalesRequestReservationReconciliationResult = {
  orderId: string;
  orderCode: string;
  mode: ReservationReconciliationMode;
  alreadyConsistent: boolean;
  repaired: boolean;
  deltas: ReservationDelta[];
  movementIds: string[];
  auditId: string | null;
};

async function loadSalesRequestReservationState(tx: Tx, orderId: string) {
  const order = await tx.salesInternalOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      code: true,
      pickLists: {
        where: { status: { in: [...RESERVATION_PICK_LIST_STATUSES] } },
        select: {
          tasks: {
            select: {
              reservedQty: true,
              pickedQty: true,
              shortQty: true,
              sourceLocationId: true,
              orderLine: { select: { productId: true } },
            },
          },
        },
      },
    },
  });

  if (!order) {
    throw new InventoryServiceError("ORDER_NOT_FOUND", "Pedido no encontrado");
  }

  const currentOrderRequirements = order.pickLists.flatMap((pickList) =>
    pickList.tasks.flatMap((task) =>
      task.orderLine.productId
        ? [{
            productId: task.orderLine.productId,
            locationId: task.sourceLocationId,
            reservedQty: task.reservedQty,
            pickedQty: task.pickedQty,
            shortQty: task.shortQty,
          }]
        : [],
    ),
  );
  const allSalesTasks = await tx.salesInternalOrderPickTask.findMany({
    where: {
      pickList: { status: { in: [...RESERVATION_PICK_LIST_STATUSES] } },
      orderLine: { productId: { not: null } },
    },
    select: {
      reservedQty: true,
      pickedQty: true,
      shortQty: true,
      sourceLocationId: true,
      orderLine: { select: { orderId: true, productId: true } },
    },
  });
  const allSalesRequirements = allSalesTasks.flatMap((task) =>
    task.orderLine.productId
      ? [{
          productId: task.orderLine.productId,
          locationId: task.sourceLocationId,
          reservedQty: task.reservedQty,
          pickedQty: task.pickedQty,
          shortQty: task.shortQty,
        }]
      : [],
  );
  const requestedPairKeys = new Set(currentOrderRequirements.map((row) => `${row.productId}:${row.locationId}`));
  const scopedSalesRequirements = allSalesRequirements.filter((row) => requestedPairKeys.has(`${row.productId}:${row.locationId}`));
  const scope = Array.from(new Map(scopedSalesRequirements.map((row) => [`${row.productId}:${row.locationId}`, row])).values())
    .map(({ productId, locationId }) => ({ productId, locationId }));
  // An empty scope means this order has no active direct-pick pairs (for
  // example an assembly-only order). Do not pass that empty array to the
  // helper, whose default semantics intentionally mean "all open orders".
  const productionReservations = scope.length > 0
    ? await buildDesiredReservedByPair(tx, { scope })
    : new Map<string, number>();
  const aggregateRequirements = [
    ...scopedSalesRequirements,
    ...Array.from(productionReservations, ([pair, reservedQty]) => {
      const [productId, locationId] = pair.split(":");
      return { productId, locationId, reservedQty, pickedQty: 0, shortQty: 0 };
    }),
  ];
  const inventoryKeys = Array.from(
    new Map(aggregateRequirements.map((row) => [`${row.productId}:${row.locationId}`, row])).values(),
  );
  const inventory = inventoryKeys.length
    ? await tx.inventory.findMany({
        where: {
          OR: inventoryKeys.map((row) => ({ productId: row.productId, locationId: row.locationId })),
        },
        select: { productId: true, locationId: true, reserved: true },
      })
    : [];

  return {
    orderId: order.id,
    orderCode: order.code,
    deltas: calculateReservationDeltas(aggregateRequirements, inventory),
    otherExpectedByKey: new Map(
      aggregateRequirements.map((row) => `${row.productId}:${row.locationId}`)
        .map((pair) => {
          const [productId, locationId] = pair.split(":");
          const aggregateExpected = aggregateRequirements
            .filter((row) => row.productId === productId && row.locationId === locationId)
            .reduce((sum, row) => sum + Math.max(0, row.reservedQty - row.pickedQty - row.shortQty), 0);
          const currentExpected = currentOrderRequirements
            .filter((row) => row.productId === productId && row.locationId === locationId)
            .reduce((sum, row) => sum + Math.max(0, row.reservedQty - row.pickedQty - row.shortQty), 0);
          return [pair, Math.max(0, aggregateExpected - currentExpected)] as const;
        }),
    ),
  };
}

function reservationMismatches(deltas: ReservationDelta[]) {
  // Hose quantities can be fractional; ignore IEEE-754 noise while retaining
  // real reservation differences.
  const epsilon = 1e-9;
  return deltas.filter((row) => Math.abs(row.delta) > epsilon);
}

async function assertSalesRequestReservationConsistency(tx: Tx, orderId: string) {
  const state = await loadSalesRequestReservationState(tx, orderId);
  const mismatches = reservationMismatches(state.deltas);
  if (mismatches.length > 0) {
    throw new InventoryServiceError(
      "RESERVATION_MISMATCH",
      `La reserva real no coincide con las reservas activas (${mismatches.map((row) => `${row.productId}/${row.locationId}: esperada ${row.expected}, real ${row.actual}`).join(", ")})`,
    );
  }
  return state;
}

export async function reconcileSalesRequestReservations(
  prisma: PrismaClient,
  args: {
    orderId: string;
    mode: ReservationReconciliationMode;
    actorUserId?: string | null;
    reason: string;
  },
): Promise<SalesRequestReservationReconciliationResult> {
  const reason = args.reason.trim();
  if (!reason) {
    throw new InventoryServiceError("REASON_REQUIRED", "El motivo de reconciliación es obligatorio");
  }
  if (args.mode === "APPLY" && !args.actorUserId) {
    throw new InventoryServiceError("ACTOR_REQUIRED", "La aplicación de una reconciliación requiere un usuario autenticado");
  }

  return prisma.$transaction(async (tx) => {
    const before = await loadSalesRequestReservationState(tx, args.orderId);
    const mismatches = reservationMismatches(before.deltas);
    if (args.mode === "DRY_RUN" || mismatches.length === 0) {
      return {
        orderId: before.orderId,
        orderCode: before.orderCode,
        mode: args.mode,
        alreadyConsistent: mismatches.length === 0,
        repaired: false,
        deltas: before.deltas,
        movementIds: [],
        auditId: null,
      };
    }

    const overReserved = mismatches.filter((row) => row.delta < 0);
    if (overReserved.length > 0) {
      throw new InventoryServiceError(
        "RESERVATION_OVERALLOCATED",
        "La reserva real excede la requerida; no se libera automáticamente para evitar afectar otra operación",
      );
    }
    const ambiguous = mismatches.filter((row) => row.delta > 0 && (before.otherExpectedByKey.get(`${row.productId}:${row.locationId}`) ?? 0) > 0);
    if (ambiguous.length > 0) {
      throw new InventoryServiceError(
        "RESERVATION_SCOPE_AMBIGUOUS",
        "No se puede reparar automáticamente una reserva compartida por otros pedidos u órdenes de producción",
      );
    }

    const inventoryService = getInventoryService(prisma);
    const movementIds: string[] = [];
    for (const row of mismatches) {
      const result = await inventoryService.reserveStock(row.productId, row.locationId, row.delta, {
        tx,
        reference: before.orderCode,
        notes: reason,
        actor: "reservation-reconciliation",
        actorUserId: args.actorUserId ?? null,
        operatorUserId: args.actorUserId ?? null,
        source: "sales/reservation-reconciliation",
        documentType: "SALES_INTERNAL_ORDER",
        documentId: before.orderId,
      });
      if (result.movementId) movementIds.push(result.movementId);
    }

    const after = await loadSalesRequestReservationState(tx, args.orderId);
    const remaining = reservationMismatches(after.deltas);
    if (remaining.length > 0) {
      throw new InventoryServiceError("RESERVATION_RECONCILIATION_FAILED", "La reconciliación no dejó las reservas consistentes");
    }

    const audit = await tx.auditLog.create({
      data: {
        entityType: "SALES_INTERNAL_ORDER",
        entityId: before.orderId,
        action: "RECONCILE_ORDER_RESERVATIONS",
        actor: "reservation-reconciliation",
        actorUserId: args.actorUserId ?? null,
        source: "sales/reservation-reconciliation",
        before: JSON.stringify({ deltas: before.deltas, reason }),
        after: JSON.stringify({ deltas: after.deltas, movementIds }),
      },
      select: { id: true },
    });

    return {
      orderId: before.orderId,
      orderCode: before.orderCode,
      mode: args.mode,
      alreadyConsistent: false,
      repaired: true,
      deltas: after.deltas,
      movementIds,
      auditId: audit.id,
    };
  });
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
  const perf = startPerf("sales.release_draft_picklist_reservations");
  const deleteDrafts = options.deleteDrafts ?? true;
  const loadPerf = startPerf("sales.release_draft_picklist_reservations.load_drafts");
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
  loadPerf.end({ draftPickListCount: draftPickLists.length });

  const releaseByKey = new Map<string, ReservationBatchItem>();

  for (const pickList of draftPickLists) {
    for (const task of pickList.tasks) {
      const productId = task.orderLine.productId;
      const pendingReserved = Math.max(0, task.reservedQty - task.pickedQty);
      if (!productId || pendingReserved <= 0) continue;
      const key = `${productId}:${task.sourceLocationId}`;
      const current = releaseByKey.get(key);
      if (current) {
        current.qty += pendingReserved;
      } else {
        releaseByKey.set(key, {
          productId,
          locationId: task.sourceLocationId,
          qty: pendingReserved,
        });
      }
    }
  }

  const releasePerf = startPerf("sales.release_draft_picklist_reservations.release_batch");
  for (const item of releaseByKey.values()) {
    await inventoryService.releaseReservedStock(item.productId, item.locationId, item.qty, {
      tx,
      reference: `ORDER:${orderId}`,
      notes: "Liberación de reserva por recálculo de surtido",
      documentType: "SALES_INTERNAL_ORDER",
      documentId: orderId,
    });
  }
  releasePerf.end({ releaseOps: releaseByKey.size });

  if (deleteDrafts && draftPickLists.length > 0) {
    const deletePerf = startPerf("sales.release_draft_picklist_reservations.delete_drafts");
    await tx.salesInternalOrderPickTask.deleteMany({
      where: { pickList: { orderId, status: "DRAFT" } },
    });
    await tx.salesInternalOrderPickList.deleteMany({
      where: { orderId, status: "DRAFT" },
    });
    deletePerf.end();
  }
  perf.end({ draftPickListCount: draftPickLists.length, releaseOps: releaseByKey.size, deleteDrafts });
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
  const perf = startPerf("sales.rebuild_draft_product_picklist");
  const loadPerf = startPerf("sales.rebuild_draft_product_picklist.load_order");
  const order = await tx.salesInternalOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      code: true,
      warehouseId: true,
      warehouseAssignmentMode: true,
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
  loadPerf.end({ lineCount: order?.lines.length ?? 0 });

  if (!order?.warehouseId) {
    throw new InventoryServiceError("ORDER_NOT_FOUND", "Pedido no encontrado");
  }

  const guardPerf = startPerf("sales.rebuild_draft_product_picklist.guard");
  await ensureNoDirectFulfillmentStarted(tx, orderId);
  await releaseDraftPickListReservations(tx, prisma, orderId, { deleteDrafts: true });
  guardPerf.end();

  const productLines = order.lines
    .filter((line): line is typeof line & { product: NonNullable<typeof line.product> } => Boolean(line.product));

  if (productLines.length === 0) {
    return null;
  }

  const targetLocation = await ensureWarehouseFulfillmentTarget(tx, order.warehouseId);
  const allocPerf = startPerf("sales.rebuild_draft_product_picklist.allocations");
  const allocations = await buildProductAllocations(tx, order.warehouseId, productLines);
  allocPerf.end({ allocationCount: allocations.length });
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

  const reservePerf = startPerf("sales.rebuild_draft_product_picklist.reserve");
  const reserveByKey = new Map<string, ReservationBatchItem>();
  for (const allocation of allocations) {
    const key = `${allocation.productId}:${allocation.locationId}`;
    const current = reserveByKey.get(key);
    if (current) {
      current.qty += allocation.requestedQty;
    } else {
      reserveByKey.set(key, {
        productId: allocation.productId,
        locationId: allocation.locationId,
        qty: allocation.requestedQty,
      });
    }
  }
  for (const item of reserveByKey.values()) {
    await inventoryService.reserveStock(item.productId, item.locationId, item.qty, {
      tx,
      reference: order.code,
      notes: "Reserva para surtido directo del pedido",
      documentType: "SALES_INTERNAL_ORDER",
      documentId: orderId,
    });
  }
  reservePerf.end({ reserveOps: reserveByKey.size });

  const tasksPerf = startPerf("sales.rebuild_draft_product_picklist.create_tasks");
  let sequence = 1;
  for (const allocation of allocations) {
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
        assignmentMode: order.warehouseAssignmentMode === "MANUAL" ? "MANAGER_REQUIRED" : "AUTO_STANDARD",
      },
    });
    sequence += 1;
  }
  tasksPerf.end({ taskCount: allocations.length });

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

  perf.end({ orderId, productLineCount: productLines.length, allocationCount: allocations.length });
  return pickList;
}

function assertValidRequestedQty(requestedQty: number) {
  if (!Number.isFinite(requestedQty) || requestedQty <= 0) {
    throw new InventoryServiceError("INVALID_QTY", "La cantidad solicitada debe ser mayor que cero");
  }
}

function isInventoryServiceError(error: unknown, code: string) {
  return error instanceof InventoryServiceError && error.code === code;
}

async function createSalesRequestProductLineInTx(
  tx: Tx,
  prisma: PrismaClient,
  input: ProductLineInput,
) {
  const order = await ensureEditableOrder(tx, input.orderId);
  assertValidRequestedQty(input.requestedQty);

  const product = await tx.product.findUnique({
    where: { id: input.productId },
    select: { id: true, sku: true, name: true, type: true, unitLabel: true, attributes: true },
  });
  if (!product) {
    throw new InventoryServiceError("PRODUCT_NOT_FOUND", "Producto no encontrado");
  }
  const quantityError = quantityValidationMessage(input.requestedQty, getQuantityPolicy(product));
  if (quantityError) {
    throw new InventoryServiceError("INVALID_QTY", quantityError);
  }

  const line = await tx.salesInternalOrderLine.create({
    data: {
      orderId: order.id,
      lineKind: "PRODUCT",
      productId: product.id,
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
      productId: product.id,
      productSku: product.sku,
      productName: product.name,
      requestedQty: input.requestedQty,
    },
  }, tx);

  return line;
}

async function tryCreateInitialSalesRequestProductLineInTx(
  tx: Tx,
  prisma: PrismaClient,
  orderId: string,
  input: InitialProductLineInput,
) {
  try {
    return await createSalesRequestProductLineInTx(tx, prisma, {
      orderId,
      productId: input.productId,
      requestedQty: input.requestedQty,
      notes: input.notes ?? null,
    });
  } catch (error) {
    if (isInventoryServiceError(error, "PRODUCT_NOT_FOUND")) {
      return null;
    }
    throw error;
  }
}

async function createSalesRequestDraftHeaderInTx(
  tx: Tx,
  prisma: PrismaClient,
  args: CreateSalesRequestDraftArgs,
) {
  const perf = startPerf("sales.create_request_draft_header");
  if (args.requireFormalCustomer && !args.customerId) {
    throw new InventoryServiceError("CUSTOMER_ID_REQUIRED", "Selecciona un cliente formal del catálogo");
  }

  let snapshot = resolveCustomerSnapshot(null);
  if (args.customerId) {
    const selectedCustomer = await getCustomerById(tx, args.customerId);
    if (!selectedCustomer.isActive) {
      throw new InventoryServiceError("CUSTOMER_INACTIVE", "El cliente seleccionado está inactivo");
    }
    snapshot = resolveCustomerSnapshot(selectedCustomer);
  } else {
    snapshot = {
      customerId: null,
      customerName: String(args.customerName ?? "").trim() || null,
    };
  }

  if (!snapshot.customerName) {
    throw new InventoryServiceError("CUSTOMER_REQUIRED", "El pedido requiere un cliente");
  }

  const codePerf = startPerf("sales.create_request_draft_header.next_code");
  const code = await getNextSalesInternalOrderCode(tx);
  codePerf.end({ code });
  const createPerf = startPerf("sales.create_request_draft_header.insert_order");
  const shouldAutoAssignToRequester = Boolean(
    args.requestedByUserId
    && args.requestedByRoles?.includes("SALES_EXECUTIVE")
    && !args.requestedByRoles?.includes("MANAGER")
    && !args.requestedByRoles?.includes("SYSTEM_ADMIN")
  );
  const createData: Record<string, unknown> = {
        code,
        customerName: snapshot.customerName,
        warehouseId: args.warehouseId,
        dueDate: args.dueDate,
        notes: args.notes ?? null,
        requestedByUserId: args.requestedByUserId ?? null,
        assignedToUserId: shouldAutoAssignToRequester ? args.requestedByUserId : null,
        assignedAt: shouldAutoAssignToRequester ? new Date() : null,
    };

  if (snapshot.customerId) {
    createData.customerId = snapshot.customerId;
  }

  const created = await tx.salesInternalOrder.create({
      data: createData as Prisma.SalesInternalOrderCreateInput,
      select: { id: true, code: true },
    });
  createPerf.end({ orderId: created.id });

  if (args.initialProductLine) {
    await tryCreateInitialSalesRequestProductLineInTx(tx, prisma, created.id, {
      productId: args.initialProductLine.productId,
      requestedQty: args.initialProductLine.requestedQty,
      notes: args.initialProductLine.notes ?? null,
    });
  }

  const auditPerf = startPerf("sales.create_request_draft_header.audit");
  await createAuditLogSafeWithDb({
      entityType: "SALES_INTERNAL_ORDER",
      entityId: created.id,
      action: "CREATE_REQUEST_DRAFT",
      actor: "system",
      source: "sales/request-service",
      after: {
        code: created.code,
        customerId: snapshot.customerId,
        customerName: snapshot.customerName,
        warehouseId: args.warehouseId,
        dueDate: args.dueDate.toISOString(),
        assignedToUserId: shouldAutoAssignToRequester ? args.requestedByUserId : null,
        initialProductLine: args.initialProductLine
          ? {
              productId: args.initialProductLine.productId,
              requestedQty: args.initialProductLine.requestedQty,
            }
          : null,
      },
  }, tx);
  auditPerf.end();
  perf.end({ orderId: created.id });

  return created;
}

export async function createSalesRequestDraftHeader(
  prisma: PrismaClient,
  args: CreateSalesRequestDraftArgs,
) {
  return prisma.$transaction((tx) => createSalesRequestDraftHeaderInTx(tx, prisma, args));
}

export async function addSalesRequestProductLine(prisma: PrismaClient, input: ProductLineInput) {
  return prisma.$transaction(async (tx) => {
    return createSalesRequestProductLineInTx(tx, prisma, input);
  });
}

async function addSalesRequestAssemblyLineInTx(tx: Tx, input: AssemblyLineInput) {
    const order = await ensureEditableOrder(tx, input.orderId);

    if (order.warehouseId !== input.warehouseId) {
      throw new InventoryServiceError("WAREHOUSE_MISMATCH", "La configuración debe usar el almacén del pedido");
    }
    if (!order.customerName || !order.dueDate) {
      throw new InventoryServiceError("INVALID_ORDER_STATE", "El pedido requiere cliente y fecha compromiso para agregar ensamble");
    }

    const assemblyQuantityError = quantityValidationMessage(
      input.assemblyQuantity,
      getAssemblyQuantityPolicy(),
    );
    if (assemblyQuantityError) {
      throw new InventoryServiceError("INVALID_QTY", assemblyQuantityError);
    }

    const [entryFitting, hose, exitFitting] = await Promise.all([
      tx.product.findUnique({ where: { id: input.entryFittingProductId }, select: { type: true, unitLabel: true, attributes: true } }),
      tx.product.findUnique({ where: { id: input.hoseProductId }, select: { type: true, unitLabel: true, attributes: true } }),
      tx.product.findUnique({ where: { id: input.exitFittingProductId }, select: { type: true, unitLabel: true, attributes: true } }),
    ]);
    if (!entryFitting || !hose || !exitFitting) {
      throw new InventoryServiceError("PRODUCT_NOT_FOUND", "Uno de los componentes del ensamble ya no existe");
    }
    const fittingQuantityError = quantityValidationMessage(input.assemblyQuantity, getQuantityPolicy(entryFitting))
      ?? quantityValidationMessage(input.assemblyQuantity, getQuantityPolicy(exitFitting));
    const hoseLengthError = quantityValidationMessage(input.hoseLength, getQuantityPolicy(hose));
    if (fittingQuantityError || hoseLengthError) {
      throw new InventoryServiceError("INVALID_QTY", fittingQuantityError ?? hoseLengthError ?? "Cantidad inválida");
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
        workingPressureBar: input.workingPressureBar ?? null,
        operatingTemperatureC: input.operatingTemperatureC ?? null,
        medium: input.medium?.trim() || null,
        application: input.application?.trim() || null,
        assemblyMethod: input.assemblyMethod?.trim() || null,
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
      workingPressureBar: input.workingPressureBar ?? null,
      operatingTemperatureC: input.operatingTemperatureC ?? null,
      medium: input.medium,
      application: input.application,
      assemblyMethod: input.assemblyMethod,
      compatibilityReviewApproved: input.compatibilityReviewApproved,
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
}

export async function addSalesRequestAssemblyLine(prisma: PrismaClient, input: AssemblyLineInput) {
  return prisma.$transaction((tx) => addSalesRequestAssemblyLineInTx(tx, input));
}

export async function createSalesRequestWithAssembly(
  prisma: PrismaClient,
  args: CreateSalesRequestAssemblyArgs,
) {
  return prisma.$transaction(async (tx) => {
    const created = await createSalesRequestDraftHeaderInTx(tx, prisma, {
      ...args,
      initialProductLine: null,
    });
    const assembly = await addSalesRequestAssemblyLineInTx(tx, {
      ...args.assembly,
      orderId: created.id,
    });

    return { ...created, assemblyLineId: assembly.lineId, productionOrderId: assembly.productionOrderId };
  }, { timeout: 20000 });
}

export async function createSalesRequestWithLines(
  prisma: PrismaClient,
  args: CreateSalesRequestDraftArgs & { lines: CreateSalesRequestLineInput[] },
) {
  return prisma.$transaction(async (tx) => {
    const created = await createSalesRequestDraftHeaderInTx(tx, prisma, {
      ...args,
      initialProductLine: null,
    });

    for (const line of args.lines) {
      if (line.kind === "PRODUCT") {
        await createSalesRequestProductLineInTx(tx, prisma, {
          orderId: created.id,
          productId: line.productId,
          requestedQty: line.requestedQty,
          notes: line.notes ?? null,
        });
      } else {
        await addSalesRequestAssemblyLineInTx(tx, {
          orderId: created.id,
          warehouseId: args.warehouseId,
          entryFittingProductId: line.entryFittingProductId,
          hoseProductId: line.hoseProductId,
          exitFittingProductId: line.exitFittingProductId,
          hoseLength: line.hoseLength,
          assemblyQuantity: line.assemblyQuantity,
          sourceDocumentRef: line.sourceDocumentRef ?? null,
          notes: line.notes ?? null,
        });
      }
    }

    return created;
  }, { timeout: 20000 });
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

export async function pullSalesRequestOrder(
  prisma: PrismaClient,
  args: {
    orderId: string;
    assignedToUserId: string;
  }
) {
  return prisma.$transaction(async (tx) => {
    const [order, assignee] = await Promise.all([
      tx.salesInternalOrder.findUnique({
        where: { id: args.orderId },
        select: {
          id: true,
          code: true,
          status: true,
          deliveredToCustomerAt: true,
          assignedToUserId: true,
          pulledAt: true,
          requestedByUser: {
            select: {
              id: true,
              userRoles: {
                where: {
                  role: {
                    code: "MANAGER",
                    isActive: true,
                  },
                },
                select: { roleId: true },
              },
            },
          },
        },
      }),
      tx.user.findUnique({
        where: { id: args.assignedToUserId },
        select: {
          id: true,
          isActive: true,
          userRoles: {
            where: {
              role: {
                code: "SALES_EXECUTIVE",
                isActive: true,
              },
            },
            select: { roleId: true },
          },
        },
      }),
    ]);

    if (!order) {
      throw new InventoryServiceError("ORDER_NOT_FOUND", "Pedido no encontrado");
    }
    if (order.status === "CANCELADA") {
      throw new InventoryServiceError("INVALID_ORDER_STATE", "No se puede tomar un pedido cancelado");
    }
    if (order.deliveredToCustomerAt) {
      throw new InventoryServiceError("INVALID_ORDER_STATE", "No se puede tomar un pedido ya entregado");
    }
    if (!assignee || !assignee.isActive || assignee.userRoles.length === 0) {
      throw new InventoryServiceError("INVALID_ASSIGNEE", "Solo un ejecutivo de ventas activo puede tomar el pedido");
    }
    const isAssignedToCurrentSales = order.assignedToUserId === args.assignedToUserId;
    if (order.assignedToUserId && !isAssignedToCurrentSales) {
      throw new InventoryServiceError("ORDER_ALREADY_ASSIGNED", "El pedido ya tiene responsable");
    }
    if (isAssignedToCurrentSales && order.pulledAt) {
      throw new InventoryServiceError("ORDER_ALREADY_ASSIGNED", "El pedido ya fue tomado");
    }
    if (!isAssignedToCurrentSales && (order.requestedByUser?.userRoles.length ?? 0) === 0) {
      throw new InventoryServiceError("INVALID_ORDER_STATE", "Solo se pueden tomar pedidos no asignados creados por manager");
    }

    const now = new Date();
    const updated = await tx.salesInternalOrder.updateMany({
      where: {
        id: order.id,
        ...(isAssignedToCurrentSales
          ? { assignedToUserId: args.assignedToUserId, pulledAt: null }
          : { assignedToUserId: null }),
        status: { not: "CANCELADA" },
        deliveredToCustomerAt: null,
      },
      data: {
        ...(isAssignedToCurrentSales ? {} : { assignedToUserId: args.assignedToUserId, assignedAt: now }),
        pulledAt: now,
      },
    });
    if (updated.count !== 1) {
      throw new InventoryServiceError("ORDER_ALREADY_ASSIGNED", "El pedido ya fue tomado o actualizado por otro usuario");
    }

    await createAuditLogSafeWithDb({
      entityType: "SALES_INTERNAL_ORDER",
      entityId: order.id,
      action: "PULL_REQUEST",
      actor: "system",
      actorUserId: args.assignedToUserId,
      source: "sales/request-service",
      after: {
        orderCode: order.code,
        assignedToUserId: args.assignedToUserId,
        ...(isAssignedToCurrentSales ? { pulledAt: now.toISOString(), action: "acknowledged" } : { assignedAt: now.toISOString(), pulledAt: now.toISOString(), action: "assigned" }),
      },
    }, tx);
  });
}

export async function assignSalesRequestOrder(
  prisma: PrismaClient,
  args: {
    orderId: string;
    assigneeUserId: string;
    assignedByUserId: string;
    reason: string;
  },
) {
  return prisma.$transaction(async (tx) => {
    const [order, assignee] = await Promise.all([
      tx.salesInternalOrder.findUnique({
        where: { id: args.orderId },
        select: {
          id: true,
          code: true,
          status: true,
          assignedToUserId: true,
          pulledAt: true,
          deliveredToCustomerAt: true,
        },
      }),
      tx.user.findUnique({
        where: { id: args.assigneeUserId },
        select: {
          id: true,
          isActive: true,
          userRoles: {
            where: { role: { code: "SALES_EXECUTIVE", isActive: true } },
            select: { roleId: true },
          },
        },
      }),
    ]);

    if (!order) throw new InventoryServiceError("ORDER_NOT_FOUND", "Pedido no encontrado");
    if (!args.reason.trim()) {
      throw new InventoryServiceError("ASSIGNMENT_REASON_REQUIRED", "La asignación directa requiere un motivo operativo");
    }
    if (order.status !== "CONFIRMADA" || order.deliveredToCustomerAt) {
      throw new InventoryServiceError("INVALID_ORDER_STATE", "Solo se puede asignar un pedido confirmado pendiente de entrega");
    }
    if (order.pulledAt) {
      throw new InventoryServiceError("INVALID_ORDER_STATE", "El pedido ya fue tomado; la reasignación requiere una excepción operativa");
    }
    if (!assignee || !assignee.isActive || assignee.userRoles.length === 0) {
      throw new InventoryServiceError("INVALID_ASSIGNEE", "Selecciona un ejecutivo de ventas activo");
    }

    if (order.assignedToUserId === assignee.id) {
      return { alreadyAssigned: true, orderCode: order.code };
    }

    const now = new Date();
    const updated = await tx.salesInternalOrder.updateMany({
      where: {
        id: order.id,
        status: "CONFIRMADA",
        pulledAt: null,
        deliveredToCustomerAt: null,
      },
      data: { assignedToUserId: assignee.id, assignedAt: now, pulledAt: null },
    });
    if (updated.count !== 1) {
      throw new InventoryServiceError("ORDER_ALREADY_ASSIGNED", "El pedido cambió mientras se asignaba; actualiza la pantalla");
    }

    await createAuditLogSafeWithDb({
      entityType: "SALES_INTERNAL_ORDER",
      entityId: order.id,
      action: "ASSIGN_SALES_REQUEST",
      actor: "system",
      actorUserId: args.assignedByUserId,
      source: "sales/request-service",
      before: { assignedToUserId: order.assignedToUserId },
      after: {
        orderCode: order.code,
        assignedToUserId: assignee.id,
        assignedAt: now.toISOString(),
        reason: args.reason.trim(),
      },
    }, tx);

    return { alreadyAssigned: false, orderCode: order.code };
  });
}

export async function markSalesRequestPreparedForDelivery(
  prisma: PrismaClient,
  args: {
    orderId: string;
    preparedByUserId: string;
    preparedLocationId: string;
    notes?: string | null;
    evidenceUrl?: string | null;
  },
): Promise<MarkSalesRequestPreparedForDeliveryResult> {
  const idempotentWarning = "Pedido ya preparado para entrega; operación idempotente";

  return prisma.$transaction(async (tx) => {
    const order = await tx.salesInternalOrder.findUnique({
      where: { id: args.orderId },
      select: {
        id: true,
        code: true,
        status: true,
        deliveredToCustomerAt: true,
        warehouseId: true,
        assignedToUserId: true,
        pulledAt: true,
        warehouseAssigneeUserId: true,
        warehouseClaimedByUserId: true,
        preparedForDeliveryAt: true,
        lines: { select: { id: true, lineKind: true } },
        pickLists: {
          where: { status: { not: "CANCELLED" } },
          orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
          take: 1,
          select: { status: true },
        },
        operationalExceptions: {
          where: { status: "OPEN" },
          select: { id: true, type: true, reason: true },
        },
      },
    });

    if (!order) throw new InventoryServiceError("ORDER_NOT_FOUND", "Pedido no encontrado");
    await assertSalesRequestReservationConsistency(tx, order.id);
    if (order.status !== "CONFIRMADA" || order.deliveredToCustomerAt) {
      throw new InventoryServiceError("INVALID_ORDER_STATE", "El pedido no está disponible para preparar entrega");
    }
    if (!hasWarehouseFulfillmentOwnership(order)) {
      throw new InventoryServiceError("INVALID_ORDER_STATE", "El pedido debe tener responsable físico de almacén antes de prepararlo");
    }
    if (!order.warehouseId) {
      throw new InventoryServiceError("INVALID_ORDER_STATE", "El pedido no tiene almacén asignado");
    }
    if (order.operationalExceptions.length > 0) {
      throw new InventoryServiceError(
        "ORDER_BLOCKED_BY_EXCEPTION",
        "El pedido tiene una excepción operativa abierta; resuélvela antes de prepararlo"
      );
    }

    const hasProductLines = order.lines.some((line) => line.lineKind === "PRODUCT");
    if (hasProductLines && order.pickLists[0]?.status !== "COMPLETED") {
      throw new InventoryServiceError("INVALID_ORDER_STATE", "Completa el surtido directo antes de preparar el pedido");
    }

    const assemblyLineIds = order.lines
      .filter((line) => line.lineKind === "CONFIGURED_ASSEMBLY")
      .map((line) => line.id);
    if (assemblyLineIds.length > 0) {
      const productionOrders = await tx.productionOrder.findMany({
        where: {
          sourceDocumentType: "SalesInternalOrder",
          sourceDocumentId: order.id,
          sourceDocumentLineId: { in: assemblyLineIds },
        },
        select: { status: true },
      });
      if (productionOrders.length !== assemblyLineIds.length || productionOrders.some((row) => row.status !== "COMPLETADA")) {
        throw new InventoryServiceError("INVALID_ORDER_STATE", "Completa todos los ensambles antes de preparar el pedido");
      }
    }

    const preparedLocation = await tx.location.findFirst({
      where: {
        id: args.preparedLocationId,
        isActive: true,
        warehouseId: order.warehouseId,
        usageType: { in: ["STAGING", "SHIPPING"] },
      },
      select: { id: true, code: true, name: true },
    });
    if (!preparedLocation) {
      throw new InventoryServiceError("INVALID_LOCATION", "Selecciona un área de entrega activa del almacén del pedido");
    }

    if (order.preparedForDeliveryAt) {
      return {
        prepared: true,
        alreadyPrepared: true,
        preparedAt: order.preparedForDeliveryAt,
        warning: idempotentWarning,
      };
    }

    const preparedAt = new Date();
    const claim = await tx.salesInternalOrder.updateMany({
      where: {
        id: order.id,
        status: "CONFIRMADA",
        OR: [
          { warehouseAssigneeUserId: { not: null } },
          { warehouseClaimedByUserId: { not: null } },
          { assignedToUserId: { not: null }, pulledAt: { not: null } },
        ],
        deliveredToCustomerAt: null,
        preparedForDeliveryAt: null,
      },
      data: {
        preparedForDeliveryAt: preparedAt,
        preparedForDeliveryByUserId: args.preparedByUserId,
        preparedForDeliveryLocationId: preparedLocation.id,
        preparedForDeliveryNotes: args.notes?.trim() || null,
        preparedForDeliveryEvidenceUrl: args.evidenceUrl?.trim() || null,
      },
    });
    if (claim.count !== 1) {
      const concurrent = await tx.salesInternalOrder.findUnique({
        where: { id: order.id },
        select: { preparedForDeliveryAt: true },
      });
      if (concurrent?.preparedForDeliveryAt) {
        return {
          prepared: true,
          alreadyPrepared: true,
          preparedAt: concurrent.preparedForDeliveryAt,
          warning: idempotentWarning,
        };
      }
      throw new InventoryServiceError("ORDER_PREPARATION_CONFLICT", "El pedido cambió de estado mientras se preparaba");
    }

    await createAuditLogSafeWithDb({
      entityType: "SALES_INTERNAL_ORDER",
      entityId: order.id,
      action: "MARK_PREPARED_FOR_DELIVERY",
      actorUserId: args.preparedByUserId,
      after: {
        preparedForDeliveryAt: preparedAt.toISOString(),
        preparedForDeliveryByUserId: args.preparedByUserId,
        preparedForDeliveryLocationId: preparedLocation.id,
        preparedForDeliveryLocationCode: preparedLocation.code,
        notes: args.notes?.trim() || null,
        evidenceUrl: args.evidenceUrl?.trim() || null,
      },
    }, tx);

    return { prepared: true, alreadyPrepared: false, preparedAt };
  });
}

export async function markSalesRequestDelivered(
  prisma: PrismaClient,
  args: {
    orderId: string;
    deliveredByUserId: string;
    deliveredByRoles?: string[];
    recipientName?: string;
    deliveryMethod?: string;
    notes?: string | null;
    evidenceUrl?: string | null;
    exceptionReason?: string | null;
  }
) {
  const deliveryDocumentType = "SALES_INTERNAL_ORDER_DELIVERY";
  const idempotentWarning = "Pedido ya entregado; operación idempotente";

  return prisma.$transaction(async (tx) => {
    const order = await tx.salesInternalOrder.findUnique({
      where: { id: args.orderId },
      select: {
        id: true,
        code: true,
        status: true,
        assignedToUserId: true,
        pulledAt: true,
        preparedForDeliveryAt: true,
        deliveredToCustomerAt: true,
        lines: {
          select: {
            id: true,
            lineKind: true,
          },
        },
        pickLists: {
          where: { status: { not: "CANCELLED" } },
          orderBy: [
            { updatedAt: "desc" },
            { createdAt: "desc" },
          ],
          take: 1,
          select: { id: true, status: true, code: true, targetLocationId: true },
        },
        operationalExceptions: {
          where: { status: "OPEN" },
          select: { id: true, type: true },
        },
      },
    });

    if (!order) {
      throw new InventoryServiceError("ORDER_NOT_FOUND", "Pedido no encontrado");
    }
    if (order.status === "CANCELADA") {
      throw new InventoryServiceError("INVALID_ORDER_STATE", "No se puede marcar entregado un pedido cancelado");
    }
    if (order.status !== "CONFIRMADA") {
      throw new InventoryServiceError("INVALID_ORDER_STATE", "Solo se puede marcar entregado un pedido confirmado");
    }
    if (!order.assignedToUserId || !order.pulledAt) {
      throw new InventoryServiceError("INVALID_ORDER_STATE", "No se puede marcar entregado sin tomar y asignar el pedido");
    }
    if (!order.preparedForDeliveryAt) {
      throw new InventoryServiceError("INVALID_ORDER_STATE", "No se puede marcar entregado sin preparar el pedido en el área de entrega");
    }
    if (order.operationalExceptions.length > 0) {
      throw new InventoryServiceError("ORDER_BLOCKED_BY_EXCEPTION", "No se puede entregar mientras exista una excepción operativa abierta");
    }
    const deliveredByRoles = args.deliveredByRoles ?? ["SALES_EXECUTIVE"];
    const recipientName = args.recipientName?.trim() || "No especificado (integración histórica)";
    const deliveryMethod = args.deliveryMethod?.trim() || "No especificado (integración histórica)";
    if (args.deliveredByRoles && (!args.recipientName?.trim() || !args.deliveryMethod?.trim())) {
      throw new InventoryServiceError("DELIVERY_EVIDENCE_REQUIRED", "Registra quién recibió y el método de entrega");
    }
    const isResponsibleExecutive = args.deliveredByUserId === order.assignedToUserId && deliveredByRoles.includes("SALES_EXECUTIVE");
    const isOperationalException = deliveredByRoles.includes("MANAGER") || deliveredByRoles.includes("SYSTEM_ADMIN");
    if (!isResponsibleExecutive && !isOperationalException) {
      throw new InventoryServiceError("DELIVERY_NOT_AUTHORIZED", "Sólo el ejecutivo responsable puede confirmar la entrega");
    }
    if (isOperationalException && !isResponsibleExecutive && !args.exceptionReason?.trim()) {
      throw new InventoryServiceError("DELIVERY_EXCEPTION_REASON_REQUIRED", "Manager/Admin debe registrar el motivo de la entrega excepcional");
    }

    const hasProductLines = order.lines.some((line) => line.lineKind === "PRODUCT");
    const hasAssemblyLines = order.lines.some((line) => line.lineKind === "CONFIGURED_ASSEMBLY");

    if (hasProductLines) {
      const latestDirectPick = order.pickLists[0];
      if (!latestDirectPick || latestDirectPick.status !== "COMPLETED") {
        throw new InventoryServiceError(
          "INVALID_ORDER_STATE",
          "No se puede marcar entregado hasta completar el surtido directo del pedido"
        );
      }
    }

    if (hasAssemblyLines) {
      const linkedProductionOrders = await tx.productionOrder.findMany({
        where: {
          sourceDocumentType: "SalesInternalOrder",
          sourceDocumentId: order.id,
          sourceDocumentLineId: {
            in: order.lines.filter((line) => line.lineKind === "CONFIGURED_ASSEMBLY").map((line) => line.id),
          },
        },
        select: { id: true, status: true },
      });

      const expectedAssemblyLines = order.lines.filter((line) => line.lineKind === "CONFIGURED_ASSEMBLY");
      if (linkedProductionOrders.length !== expectedAssemblyLines.length || linkedProductionOrders.some((row) => row.status !== "COMPLETADA")) {
        throw new InventoryServiceError(
          "INVALID_ORDER_STATE",
          "No se puede marcar entregado hasta concluir todas las órdenes de ensamble ligadas"
        );
      }
    }

    const existingDeliveryMovements = await tx.inventoryMovement.findMany({
      where: {
        type: "OUT",
        documentType: deliveryDocumentType,
        documentId: order.id,
      },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (order.deliveredToCustomerAt) {
      return {
        delivered: true,
        alreadyDelivered: true,
        warning: idempotentWarning,
        movementIds: existingDeliveryMovements.map((row) => row.id),
      } satisfies MarkSalesRequestDeliveredResult;
    }

    const now = new Date();
    const claim = await tx.salesInternalOrder.updateMany({
      where: {
        id: order.id,
        status: "CONFIRMADA",
        assignedToUserId: { not: null },
        pulledAt: { not: null },
        preparedForDeliveryAt: { not: null },
        deliveredToCustomerAt: null,
      },
      data: {
        deliveredToCustomerAt: now,
        deliveredByUserId: args.deliveredByUserId,
        deliveryRecipientName: recipientName,
        deliveryMethod,
        deliveryNotes: args.notes?.trim() || null,
        deliveryEvidenceUrl: args.evidenceUrl?.trim() || null,
        deliveryExceptionReason: isOperationalException && !isResponsibleExecutive ? args.exceptionReason?.trim() || null : null,
      },
    });
    if (claim.count !== 1) {
      const concurrentOrder = await tx.salesInternalOrder.findUnique({
        where: { id: order.id },
        select: { deliveredToCustomerAt: true },
      });
      if (concurrentOrder?.deliveredToCustomerAt) {
        const movements = await tx.inventoryMovement.findMany({
          where: {
            type: "OUT",
            documentType: deliveryDocumentType,
            documentId: order.id,
          },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        });
        return {
          delivered: true,
          alreadyDelivered: true,
          warning: idempotentWarning,
          movementIds: movements.map((row) => row.id),
        } satisfies MarkSalesRequestDeliveredResult;
      }
      throw new InventoryServiceError("ORDER_DELIVERY_CONFLICT", "El pedido cambió de estado durante la entrega");
    }

    const productLines = await tx.salesInternalOrderLine.findMany({
      where: {
        orderId: order.id,
        lineKind: "PRODUCT",
        productId: { not: null },
        requestedQty: { gt: 0 },
      },
      select: {
        id: true,
        requestedQty: true,
        productId: true,
      },
    });
    const directCompletedPickList = hasProductLines ? order.pickLists[0] : null;
    const outByLine = new Map<string, { lineId: string; productId: string; locationId: string; qty: number }>();
    if (directCompletedPickList?.status === "COMPLETED") {
      for (const line of productLines) {
        if (!line.productId) continue;
        outByLine.set(line.id, {
          lineId: line.id,
          productId: line.productId,
          locationId: directCompletedPickList.targetLocationId,
          qty: line.requestedQty,
        });
      }
    }

    const movementIds: string[] = [];
    try {
      for (const item of outByLine.values()) {
        const inventory = await tx.inventory.findUnique({
          where: {
            productId_locationId: {
              productId: item.productId,
              locationId: item.locationId,
            },
          },
          select: { id: true, quantity: true, reserved: true, available: true },
        });
        if (!inventory || inventory.available < item.qty) {
          throw new InventoryServiceError("INSUFFICIENT_AVAILABLE", "No hay stock disponible suficiente para entrega final");
        }
        const guarded = await tx.inventory.updateMany({
          where: {
            id: inventory.id,
            quantity: inventory.quantity,
            reserved: inventory.reserved,
            available: inventory.available,
          },
          data: {
            quantity: { decrement: item.qty },
            available: { decrement: item.qty },
          },
        });
        if (guarded.count !== 1) {
          const latestInventory = await tx.inventory.findUnique({
            where: { id: inventory.id },
            select: { quantity: true, reserved: true, available: true },
          });
          if (!latestInventory || latestInventory.available < item.qty) {
            throw new InventoryServiceError("INSUFFICIENT_AVAILABLE", "No hay stock disponible suficiente para entrega final");
          }
          if (latestInventory.quantity - item.qty < latestInventory.reserved) {
            throw new InventoryServiceError("RESERVED_EXCEEDS_QUANTITY", "Reserva excede el inventario tras egreso final");
          }
          throw new InventoryServiceError(
            "DELIVERY_INVENTORY_CONFLICT",
            "Conflicto concurrente al aplicar egreso final; reintente la entrega"
          );
        }
        const movement = await tx.inventoryMovement.create({
          data: {
            productId: item.productId,
            locationId: item.locationId,
            type: "OUT",
            operatorName: "system",
            quantity: item.qty,
            reference: order.code,
            notes: "Egreso final por entrega al cliente",
            documentType: deliveryDocumentType,
            documentId: order.id,
            documentLineId: item.lineId,
          },
          select: { id: true },
        });
        movementIds.push(movement.id);
      }
    } catch (error) {
      if (isPrismaUniqueViolation(error)) {
        const concurrentOrder = await tx.salesInternalOrder.findUnique({
          where: { id: order.id },
          select: { deliveredToCustomerAt: true },
        });
        if (concurrentOrder?.deliveredToCustomerAt) {
          const movements = await tx.inventoryMovement.findMany({
            where: {
              type: "OUT",
              documentType: deliveryDocumentType,
              documentId: order.id,
            },
            orderBy: { createdAt: "asc" },
            select: { id: true },
          });
          return {
            delivered: true,
            alreadyDelivered: true,
            warning: idempotentWarning,
            movementIds: movements.map((row) => row.id),
          } satisfies MarkSalesRequestDeliveredResult;
        }
        throw new InventoryServiceError("DELIVERY_INCONSISTENT", "Colisión de unicidad en egreso final sin estado entregado");
      }
      throw error;
    }

    await createAuditLogSafeWithDb({
      entityType: "SALES_INTERNAL_ORDER",
      entityId: order.id,
      action: "MARK_DELIVERED_TO_CUSTOMER",
      actor: "system",
      actorUserId: args.deliveredByUserId,
      source: "sales/request-service",
      after: {
        orderCode: order.code,
        deliveredToCustomerAt: now.toISOString(),
        deliveredByUserId: args.deliveredByUserId,
        recipientName,
        deliveryMethod,
        notes: args.notes?.trim() || null,
        evidenceUrl: args.evidenceUrl?.trim() || null,
        exceptionReason: isOperationalException && !isResponsibleExecutive ? args.exceptionReason?.trim() || null : null,
        movementIds,
      },
    }, tx);

    return {
      delivered: true,
      alreadyDelivered: false,
      warning: null,
      movementIds,
    } satisfies MarkSalesRequestDeliveredResult;
  });
}

export async function confirmSalesRequestOrder(
  prisma: PrismaClient,
  args: {
    orderId: string;
    confirmedByUserId?: string | null;
  }
) {
  const perf = startPerf("sales.confirm_order");
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
      actorUserId: args.confirmedByUserId ?? null,
      source: "sales/request-service",
      after: { status: "CONFIRMADA", code: order.code },
    }, tx);
    perf.end({ orderId: order.id });
  });
}

export async function cancelSalesRequestOrder(
  prisma: PrismaClient,
  args: {
    orderId: string;
    cancelledByUserId?: string | null;
    reason?: string | null;
  }
) {
  const perf = startPerf("sales.cancel_order");
  return prisma.$transaction(async (tx) => {
    const loadPerf = startPerf("sales.cancel_order.load_order");
    const order = await tx.salesInternalOrder.findUnique({
      where: { id: args.orderId },
      select: {
        id: true,
        code: true,
        status: true,
        deliveredToCustomerAt: true,
      },
    });
    loadPerf.end();
    if (!order) {
      throw new InventoryServiceError("ORDER_NOT_FOUND", "Pedido no encontrado");
    }
    if (order.status === "CANCELADA") {
      throw new InventoryServiceError("INVALID_ORDER_STATE", "El pedido ya está cancelado");
    }
    if (order.deliveredToCustomerAt) {
      throw new InventoryServiceError(
        "DELIVERED_ORDER_REQUIRES_RETURN",
        "Un pedido entregado no se cancela; inicia una devolución para registrar la recepción e inspección física"
      );
    }

    const guardPerf = startPerf("sales.cancel_order.guard");
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
      const cancellationReason = args.reason?.trim();
      if (!cancellationReason) {
        throw new InventoryServiceError(
          "CANCELLATION_REASON_REQUIRED",
          "La solicitud de cancelación posterior a liberar surtido requiere un motivo"
        );
      }
      const existing = await tx.salesInternalOrderException.findFirst({
        where: { orderId: order.id, type: "CANCELLATION_REQUEST", status: "OPEN" },
        select: { id: true },
      });
      if (!existing) {
        await tx.salesInternalOrderException.create({
          data: {
            orderId: order.id,
            type: "CANCELLATION_REQUEST",
            status: "OPEN",
            reason: cancellationReason,
            reportedByUserId: args.cancelledByUserId ?? null,
          },
        });
        await createAuditLogSafeWithDb({
          entityType: "SALES_INTERNAL_ORDER",
          entityId: order.id,
          action: "REQUEST_CANCELLATION_AFTER_PICK_RELEASE",
          actor: "system",
          actorUserId: args.cancelledByUserId ?? null,
          source: "sales/request-service",
          after: { pickListCode: activeDirectPick.code, reason: cancellationReason },
        }, tx);
      }
      return { cancellationRequested: true, orderCode: order.code };
    }
    guardPerf.end();

    const draftPerf = startPerf("sales.cancel_order.cancel_draft_picklists");
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
    draftPerf.end({ draftPickListCount: draftPickLists.length });

    const linkedPerf = startPerf("sales.cancel_order.cancel_linked_production");
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
    linkedPerf.end({ linkedCount: linkedProductionOrders.length });

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
      actorUserId: args.cancelledByUserId ?? null,
      source: "sales/request-service",
      after: { status: "CANCELADA", code: order.code },
    }, tx);
    perf.end({ orderId: order.id });
  });
}

export async function resolveSalesRequestOperationalException(
  prisma: PrismaClient,
  args: {
    exceptionId: string;
    decidedByUserId: string;
    resolution: "WAIT_REPLENISHMENT" | "PARTIAL_DELIVERY" | "SUBSTITUTE_PRODUCT" | "REDUCE_QUANTITY" | "URGENT_PURCHASE" | "CANCEL_LINE" | "CANCEL_ORDER" | "REJECT_CANCELLATION";
    notes: string;
  },
) {
  return prisma.$transaction(async (tx) => {
    const exception = await tx.salesInternalOrderException.findUnique({
      where: { id: args.exceptionId },
      select: {
        id: true,
        orderId: true,
        type: true,
        status: true,
        reason: true,
        order: { select: { code: true, deliveredToCustomerAt: true } },
      },
    });
    if (!exception) throw new InventoryServiceError("EXCEPTION_NOT_FOUND", "La excepción operativa no existe");
    if (exception.status !== "OPEN") throw new InventoryServiceError("EXCEPTION_CLOSED", "La excepción ya tiene una decisión registrada");
    if (!args.notes.trim()) throw new InventoryServiceError("RESOLUTION_NOTES_REQUIRED", "La resolución requiere una nota operativa");
    if (exception.type === "CANCELLATION_REQUEST" && !["CANCEL_ORDER", "REJECT_CANCELLATION"].includes(args.resolution)) {
      throw new InventoryServiceError("INVALID_CANCELLATION_RESOLUTION", "Una solicitud de cancelación sólo puede aprobarse o rechazarse");
    }

    const status = args.resolution === "REJECT_CANCELLATION" ? "REJECTED" as const : "RESOLVED" as const;
    const decidedAt = new Date();
    await tx.salesInternalOrderException.update({
      where: { id: exception.id },
      data: {
        status,
        resolution: args.resolution,
        resolutionNotes: args.notes.trim(),
        decidedByUserId: args.decidedByUserId,
        decidedAt,
      },
    });

    let returnId: string | null = null;
    if (exception.type === "CANCELLATION_REQUEST" && args.resolution === "CANCEL_ORDER") {
      const pickedTasks = await tx.salesInternalOrderPickTask.findMany({
        where: { pickList: { orderId: exception.orderId }, pickedQty: { gt: 0 }, orderLine: { productId: { not: null } } },
        select: {
          orderLineId: true,
          pickedQty: true,
          sourceLocationId: true,
          targetLocationId: true,
          orderLine: { select: { productId: true } },
        },
      });
      const createdReturn = await tx.salesInternalOrderReturn.create({
        data: {
          orderId: exception.orderId,
          exceptionId: exception.id,
          kind: "CANCELLATION_REVERSAL",
          reason: exception.reason,
          requestedByUserId: args.decidedByUserId,
          notes: args.notes.trim(),
          items: {
            create: pickedTasks.flatMap((task) => task.orderLine.productId ? [{
              orderLineId: task.orderLineId,
              productId: task.orderLine.productId,
              sourceLocationId: task.targetLocationId,
              destinationLocationId: task.sourceLocationId,
              quantity: task.pickedQty,
              disposition: "RESTOCK",
              notes: "Reversión física de surtido por cancelación",
            }] : []),
          },
        },
        select: { id: true },
      });
      returnId = createdReturn.id;
    }

    await createAuditLogSafeWithDb({
      entityType: "SALES_INTERNAL_ORDER",
      entityId: exception.orderId,
      action: "RESOLVE_OPERATIONAL_EXCEPTION",
      actor: "system",
      actorUserId: args.decidedByUserId,
      source: "sales/request-service",
      after: {
        exceptionId: exception.id,
        exceptionType: exception.type,
        resolution: args.resolution,
        notes: args.notes.trim(),
        returnId,
      },
    }, tx);
    return { exceptionId: exception.id, returnId, status };
  });
}

export async function requestSalesRequestCustomerReturn(
  prisma: PrismaClient,
  args: { orderId: string; requestedByUserId: string; reason: string; notes?: string | null },
) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.salesInternalOrder.findUnique({
      where: { id: args.orderId },
      select: { id: true, code: true, deliveredToCustomerAt: true },
    });
    if (!order) throw new InventoryServiceError("ORDER_NOT_FOUND", "Pedido no encontrado");
    if (!order.deliveredToCustomerAt) throw new InventoryServiceError("INVALID_ORDER_STATE", "Sólo un pedido entregado puede iniciar una devolución");
    if (!args.reason.trim()) throw new InventoryServiceError("RETURN_REASON_REQUIRED", "La devolución requiere un motivo");
    const existing = await tx.salesInternalOrderReturn.findFirst({
      where: { orderId: order.id, kind: "CUSTOMER_RETURN", status: { in: ["REQUESTED", "RECEIVED"] } },
      select: { id: true },
    });
    if (existing) return { returnId: existing.id, alreadyRequested: true };

    const delivered = await tx.inventoryMovement.findMany({
      where: { type: "OUT", documentType: "SALES_INTERNAL_ORDER_DELIVERY", documentId: order.id },
      select: { productId: true, documentLineId: true, quantity: true },
    });
    if (delivered.length === 0) throw new InventoryServiceError("RETURN_SOURCE_NOT_FOUND", "No hay movimientos de entrega para devolver");
    const created = await tx.salesInternalOrderReturn.create({
      data: {
        orderId: order.id,
        kind: "CUSTOMER_RETURN",
        reason: args.reason.trim(),
        requestedByUserId: args.requestedByUserId,
        notes: args.notes?.trim() || null,
        items: {
          create: delivered.map((movement) => ({
            orderLineId: movement.documentLineId ?? null,
            productId: movement.productId,
            quantity: movement.quantity,
            disposition: "REJECT",
            notes: "Pendiente de recepción e inspección física",
          })),
        },
      },
      select: { id: true },
    });
    await createAuditLogSafeWithDb({
      entityType: "SALES_INTERNAL_ORDER",
      entityId: order.id,
      action: "REQUEST_CUSTOMER_RETURN",
      actor: "system",
      actorUserId: args.requestedByUserId,
      source: "sales/request-service",
      after: { returnId: created.id, reason: args.reason.trim() },
    }, tx);
    return { returnId: created.id, alreadyRequested: false };
  });
}

export async function receiveSalesRequestReturn(
  prisma: PrismaClient,
  args: {
    returnId: string;
    receivedByUserId: string;
    items: Array<{
      itemId: string;
      disposition: "RESTOCK" | "REPAIR" | "SCRAP" | "REJECT";
      destinationLocationId?: string | null;
      notes?: string | null;
    }>;
  },
) {
  const inventoryService = getInventoryService(prisma);
  return prisma.$transaction(async (tx) => {
    const record = await tx.salesInternalOrderReturn.findUnique({
      where: { id: args.returnId },
      select: {
        id: true,
        orderId: true,
        kind: true,
        status: true,
        items: { select: { id: true, productId: true, quantity: true, sourceLocationId: true, destinationLocationId: true } },
      },
    });
    if (!record) throw new InventoryServiceError("RETURN_NOT_FOUND", "La devolución no existe");
    if (record.status !== "REQUESTED") throw new InventoryServiceError("RETURN_ALREADY_RECEIVED", "La devolución ya fue recibida o cerrada");
    if (args.items.length !== record.items.length) throw new InventoryServiceError("RETURN_ITEMS_INCOMPLETE", "Registra el resultado de todos los renglones de devolución");

    const inputById = new Map(args.items.map((item) => [item.itemId, item]));
    if (inputById.size !== record.items.length || record.items.some((item) => !inputById.has(item.id))) {
      throw new InventoryServiceError("RETURN_ITEMS_INVALID", "Los renglones de devolución no corresponden al registro");
    }

    for (const item of record.items) {
      const input = inputById.get(item.id)!;
      const destinationLocationId = input.destinationLocationId?.trim() || item.destinationLocationId || null;
      if (input.disposition === "RESTOCK" && !destinationLocationId) {
        throw new InventoryServiceError("RETURN_DESTINATION_REQUIRED", "El reintegro requiere una ubicación de destino");
      }
      if (record.kind === "CANCELLATION_REVERSAL") {
        if (!item.sourceLocationId) throw new InventoryServiceError("RETURN_SOURCE_REQUIRED", "La reversión no tiene ubicación física de origen");
        if (input.disposition === "RESTOCK") {
          await inventoryService.transferStock(item.productId, item.sourceLocationId, destinationLocationId!, item.quantity, record.id, {
            tx,
            actor: "system",
            actorUserId: args.receivedByUserId,
            operatorUserId: args.receivedByUserId,
            notes: "Reversión física de surtido por cancelación",
            documentType: "SALES_INTERNAL_ORDER_RETURN",
            documentId: record.id,
            documentLineId: item.id,
          });
        } else {
          await inventoryService.adjustStock(item.productId, item.sourceLocationId, -item.quantity, `Disposición ${input.disposition} en reversión ${record.id}`, {
            tx,
            actor: "system",
            actorUserId: args.receivedByUserId,
            documentType: "SALES_INTERNAL_ORDER_RETURN",
            documentId: record.id,
            documentLineId: item.id,
          });
        }
      } else if (input.disposition === "RESTOCK") {
        await inventoryService.adjustStock(item.productId, destinationLocationId!, item.quantity, `Reintegro aceptado de devolución ${record.id}`, {
          tx,
          actor: "system",
          actorUserId: args.receivedByUserId,
          documentType: "SALES_INTERNAL_ORDER_RETURN",
          documentId: record.id,
          documentLineId: item.id,
        });
      } else {
        await tx.inventoryMovement.create({
          data: {
            productId: item.productId,
            locationId: destinationLocationId,
            type: "ADJUSTMENT",
            quantity: 0,
            operatorName: "system",
            operatorUserId: args.receivedByUserId,
            reference: record.id,
            notes: `Devolución recibida sin reintegro: ${input.disposition}`,
            documentType: "SALES_INTERNAL_ORDER_RETURN",
            documentId: record.id,
            documentLineId: item.id,
          },
        });
      }
      await tx.salesInternalOrderReturnItem.update({
        where: { id: item.id },
        data: {
          destinationLocationId,
          disposition: input.disposition,
          notes: input.notes?.trim() || null,
        },
      });
    }

    const now = new Date();
    await tx.salesInternalOrderReturn.update({
      where: { id: record.id },
      data: { status: "COMPLETED", receivedByUserId: args.receivedByUserId, receivedAt: now, completedByUserId: args.receivedByUserId, completedAt: now },
    });
    await createAuditLogSafeWithDb({
      entityType: "SALES_INTERNAL_ORDER",
      entityId: record.orderId,
      action: "COMPLETE_SALES_ORDER_RETURN",
      actor: "system",
      actorUserId: args.receivedByUserId,
      source: "sales/request-service",
      after: { returnId: record.id, kind: record.kind },
    }, tx);
    return { returnId: record.id, completed: true };
  });
}

export async function finalizeSalesRequestCancellationAfterReversal(
  prisma: PrismaClient,
  args: { orderId: string; cancelledByUserId: string },
) {
  const inventoryService = getInventoryService(prisma);
  return prisma.$transaction(async (tx) => {
    const order = await tx.salesInternalOrder.findUnique({
      where: { id: args.orderId },
      select: {
        id: true,
        code: true,
        status: true,
        operationalExceptions: { where: { type: "CANCELLATION_REQUEST", status: "RESOLVED", resolution: "CANCEL_ORDER" }, select: { id: true } },
        returns: { where: { kind: "CANCELLATION_REVERSAL" }, select: { status: true } },
      },
    });
    if (!order) throw new InventoryServiceError("ORDER_NOT_FOUND", "Pedido no encontrado");
    if (order.status === "CANCELADA") return { alreadyCancelled: true };
    if (order.operationalExceptions.length === 0 || order.returns.some((record) => record.status !== "COMPLETED")) {
      throw new InventoryServiceError("CANCELLATION_REVERSAL_PENDING", "La cancelación requiere una reversión física completada");
    }
    const activeAssemblies = await tx.productionOrder.count({
      where: { sourceDocumentType: "SalesInternalOrder", sourceDocumentId: order.id, status: { not: "CANCELADA" } },
    });
    if (activeAssemblies > 0) {
      throw new InventoryServiceError("ASSEMBLY_CANCELLATION_REVIEW_REQUIRED", "Existe ensamble ligado; Manager/Admin debe decidir su disposición antes de cancelar");
    }
    const tasks = await tx.salesInternalOrderPickTask.findMany({
      where: { pickList: { orderId: order.id, status: { in: ["RELEASED", "IN_PROGRESS", "PARTIAL", "COMPLETED"] } }, orderLine: { productId: { not: null } } },
      select: { id: true, reservedQty: true, pickedQty: true, shortQty: true, sourceLocationId: true, orderLine: { select: { productId: true } } },
    });
    for (const task of tasks) {
      const pendingReservedQty = Math.max(0, task.reservedQty - task.pickedQty - task.shortQty);
      if (pendingReservedQty > 0 && task.orderLine.productId) {
        await inventoryService.releaseReservedStock(task.orderLine.productId, task.sourceLocationId, pendingReservedQty, {
          tx,
          actor: "system",
          actorUserId: args.cancelledByUserId,
          reference: order.code,
          notes: "Liberación por cancelación posterior a surtido",
          documentType: "SALES_INTERNAL_ORDER",
          documentId: order.id,
        });
      }
    }
    await tx.salesInternalOrderPickTask.updateMany({ where: { pickList: { orderId: order.id } }, data: { status: "CANCELLED" } });
    await tx.salesInternalOrderPickList.updateMany({ where: { orderId: order.id, status: { not: "CANCELLED" } }, data: { status: "CANCELLED", canceledAt: new Date() } });
    await tx.salesInternalOrder.update({ where: { id: order.id }, data: { status: "CANCELADA", cancelledAt: new Date(), cancelledByUserId: args.cancelledByUserId } });
    await createAuditLogSafeWithDb({
      entityType: "SALES_INTERNAL_ORDER",
      entityId: order.id,
      action: "CONFIRM_CANCELLATION_AFTER_PHYSICAL_REVERSAL",
      actor: "system",
      actorUserId: args.cancelledByUserId,
      source: "sales/request-service",
      after: { status: "CANCELADA", code: order.code },
    }, tx);
    return { alreadyCancelled: false };
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

    await assertSalesRequestReservationConsistency(tx, order.id);

    await tx.salesInternalOrderPickList.update({
      where: { id: pickList.id },
      data: {
        status: "RELEASED",
        releasedAt: new Date(),
      },
    });
    await tx.salesInternalOrder.update({
      where: { id: order.id },
      data: { warehouseLastActivityAt: new Date() },
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

export async function claimSalesRequestPickTasks(
  prisma: PrismaClient,
  args: { orderId: string; taskIds: string[]; claimedByUserId: string },
) {
  const taskIds = Array.from(new Set(args.taskIds.map((id) => id.trim()).filter(Boolean)));
  if (taskIds.length === 0) {
    throw new InventoryServiceError("TASK_NOT_FOUND", "Selecciona al menos una tarea de surtido");
  }

  return prisma.$transaction(async (tx) => {
    const tasks = await tx.salesInternalOrderPickTask.findMany({
      where: {
        id: { in: taskIds },
        orderLine: { orderId: args.orderId },
      },
      select: {
        id: true,
        status: true,
        assignmentMode: true,
        assignedToUserId: true,
        claimedByUserId: true,
        pickListId: true,
        pickList: { select: { status: true, code: true } },
      },
    });

    if (tasks.length !== taskIds.length) {
      throw new InventoryServiceError("TASK_NOT_FOUND", "Una o más tareas no pertenecen al pedido");
    }
    for (const task of tasks) {
      if (["COMPLETED", "PARTIAL", "CANCELLED"].includes(task.status)) {
        throw new InventoryServiceError("TASK_CLOSED", "Una o más tareas ya están cerradas");
      }
      if (task.pickList.status === "DRAFT") {
        throw new InventoryServiceError("INVALID_ORDER_STATE", "Libera la lista de surtido antes de tomar tareas");
      }
      if (task.assignmentMode === "MANAGER_REQUIRED" && task.assignedToUserId !== args.claimedByUserId) {
        throw new InventoryServiceError("TASK_NOT_ASSIGNED", "Esta tarea requiere asignación del manager");
      }
      if (task.claimedByUserId && task.claimedByUserId !== args.claimedByUserId) {
        throw new InventoryServiceError("TASK_ALREADY_CLAIMED", "Una o más tareas ya fueron tomadas por otro operador");
      }
    }

    const now = new Date();
    const claimed = await tx.salesInternalOrderPickTask.updateMany({
      where: {
        id: { in: taskIds },
        claimedByUserId: null,
        status: { notIn: ["COMPLETED", "PARTIAL", "CANCELLED"] },
        OR: [
          { assignmentMode: "AUTO_STANDARD" },
          { assignmentMode: "MANAGER_REQUIRED", assignedToUserId: args.claimedByUserId },
        ],
      },
      data: {
        claimedByUserId: args.claimedByUserId,
        claimedAt: now,
        lastActivityAt: now,
      },
    });
    if (claimed.count !== taskIds.length) {
      throw new InventoryServiceError("TASK_ALREADY_CLAIMED", "Una o más tareas fueron tomadas mientras confirmabas");
    }

    const pickListIds = Array.from(new Set(tasks.map((task) => task.pickListId)));
    await tx.salesInternalOrderPickList.updateMany({
      where: { id: { in: pickListIds }, status: "RELEASED" },
      data: { status: "IN_PROGRESS" },
    });
    await tx.salesInternalOrder.update({
      where: { id: args.orderId },
      data: {
        warehouseClaimedByUserId: args.claimedByUserId,
        warehouseClaimedAt: now,
        warehouseLastActivityAt: now,
      },
    });
    await createAuditLogSafeWithDb({
      entityType: "SALES_INTERNAL_ORDER",
      entityId: args.orderId,
      action: "CLAIM_WAREHOUSE_PICK_TASKS",
      actor: "system",
      actorUserId: args.claimedByUserId,
      source: "sales/request-service",
      after: { taskIds, pickListIds },
    }, tx);

    return { claimedCount: claimed.count };
  });
}

export async function assignSalesRequestPickTasks(
  prisma: PrismaClient,
  args: { orderId: string; taskIds: string[]; assignedToUserId: string; assignedByUserId: string },
) {
  const taskIds = Array.from(new Set(args.taskIds.map((id) => id.trim()).filter(Boolean)));
  if (taskIds.length === 0) {
    throw new InventoryServiceError("TASK_NOT_FOUND", "Selecciona al menos una tarea de surtido");
  }

  return prisma.$transaction(async (tx) => {
    const [order, assignee, tasks] = await Promise.all([
      tx.salesInternalOrder.findUnique({
        where: { id: args.orderId },
        select: { id: true, code: true, status: true, warehouseAssigneeUserId: true },
      }),
      tx.user.findUnique({
        where: { id: args.assignedToUserId },
        select: {
          id: true,
          name: true,
          isActive: true,
          userRoles: {
            where: { role: { code: "WAREHOUSE_OPERATOR", isActive: true } },
            select: { roleId: true },
          },
        },
      }),
      tx.salesInternalOrderPickTask.findMany({
        where: {
          id: { in: taskIds },
          orderLine: { orderId: args.orderId },
        },
        select: {
          id: true,
          status: true,
          assignmentMode: true,
          assignedToUserId: true,
          claimedByUserId: true,
          pickListId: true,
          pickList: { select: { code: true } },
        },
      }),
    ]);

    if (!order) {
      throw new InventoryServiceError("ORDER_NOT_FOUND", "Pedido no encontrado");
    }
    if (order.status === "CANCELADA") {
      throw new InventoryServiceError("INVALID_ORDER_STATE", "No se pueden asignar tareas de un pedido cancelado");
    }
    if (!assignee || !assignee.isActive || assignee.userRoles.length === 0) {
      throw new InventoryServiceError("INVALID_ASSIGNEE", "Solo un operador de almacén activo puede recibir tareas");
    }
    if (tasks.length !== taskIds.length) {
      throw new InventoryServiceError("TASK_NOT_FOUND", "Una o más tareas no pertenecen al pedido");
    }

    for (const task of tasks) {
      if (task.assignmentMode !== "MANAGER_REQUIRED") {
        throw new InventoryServiceError("INVALID_ASSIGNMENT_MODE", "La tarea no requiere asignación manual del responsable");
      }
      if (["COMPLETED", "PARTIAL", "CANCELLED"].includes(task.status)) {
        throw new InventoryServiceError("TASK_CLOSED", "Una o más tareas ya están cerradas");
      }
      if (task.claimedByUserId) {
        throw new InventoryServiceError("TASK_ALREADY_CLAIMED", "No se puede reasignar una tarea que ya fue tomada");
      }
      if (task.assignedToUserId) {
        throw new InventoryServiceError("TASK_ALREADY_ASSIGNED", "Una o más tareas ya tienen operador asignado");
      }
    }

    const now = new Date();
    const updated = await tx.salesInternalOrderPickTask.updateMany({
      where: {
        id: { in: taskIds },
        assignedToUserId: null,
        claimedByUserId: null,
        status: { notIn: ["COMPLETED", "PARTIAL", "CANCELLED"] },
        assignmentMode: "MANAGER_REQUIRED",
      },
      data: { assignedToUserId: assignee.id, lastActivityAt: now },
    });
    if (updated.count !== taskIds.length) {
      throw new InventoryServiceError("TASK_ASSIGNMENT_CONFLICT", "Las tareas cambiaron mientras se asignaban");
    }

    await tx.salesInternalOrder.update({
      where: { id: order.id },
      data: {
        warehouseAssigneeUserId: assignee.id,
        warehouseAssignmentMode: "MANUAL",
        warehouseLastActivityAt: now,
      },
    });

    await createAuditLogSafeWithDb({
      entityType: "SALES_INTERNAL_ORDER",
      entityId: order.id,
      action: "ASSIGN_WAREHOUSE_PICK_TASKS",
      actor: "system",
      actorUserId: args.assignedByUserId,
      source: "sales/request-service",
      before: {
        warehouseAssigneeUserId: order.warehouseAssigneeUserId,
        taskIds,
      },
      after: {
        warehouseAssigneeUserId: assignee.id,
        assigneeName: assignee.name,
        taskIds,
        pickListIds: Array.from(new Set(tasks.map((task) => task.pickListId))),
      },
    }, tx);

    return { assignedCount: updated.count, assignedToUserId: assignee.id };
  });
}

export async function requireManagerWarehouseAssignment(
  prisma: PrismaClient,
  args: { orderId: string; reason: string; actorUserId: string },
) {
  const reason = args.reason.trim();
  if (!reason) throw new InventoryServiceError("INVALID_REASON", "El motivo de asignación manual es obligatorio");

  return prisma.$transaction(async (tx) => {
    const order = await tx.salesInternalOrder.findUnique({
      where: { id: args.orderId },
      select: { id: true, code: true, status: true },
    });
    if (!order) throw new InventoryServiceError("ORDER_NOT_FOUND", "Pedido no encontrado");
    if (order.status === "CANCELADA") throw new InventoryServiceError("INVALID_ORDER_STATE", "No se puede asignar un pedido cancelado");

    const tasks = await tx.salesInternalOrderPickTask.findMany({
      where: {
        orderLine: { orderId: order.id },
        status: { notIn: ["COMPLETED", "PARTIAL", "CANCELLED"] },
      },
      select: { id: true, assignedToUserId: true, claimedByUserId: true },
    });
    if (tasks.length === 0) throw new InventoryServiceError("TASK_NOT_FOUND", "El pedido no tiene tareas abiertas para asignar");
    if (tasks.some((task) => task.assignedToUserId || task.claimedByUserId)) {
      throw new InventoryServiceError("TASK_ALREADY_CLAIMED", "No se puede cambiar el modo después de asignar o tomar tareas");
    }

    const now = new Date();
    const updated = await tx.salesInternalOrderPickTask.updateMany({
      where: {
        id: { in: tasks.map((task) => task.id) },
        assignedToUserId: null,
        claimedByUserId: null,
        assignmentMode: "AUTO_STANDARD",
        status: { notIn: ["COMPLETED", "PARTIAL", "CANCELLED"] },
      },
      data: { assignmentMode: "MANAGER_REQUIRED", lastActivityAt: now },
    });
    if (updated.count !== tasks.length) {
      throw new InventoryServiceError("TASK_ASSIGNMENT_CONFLICT", "Las tareas cambiaron mientras se solicitaba la asignación manual");
    }
    await tx.salesInternalOrder.update({
      where: { id: order.id },
      data: { warehouseAssignmentMode: "MANUAL", warehouseAssigneeUserId: null, warehouseLastActivityAt: now },
    });
    await createAuditLogSafeWithDb({
      entityType: "SALES_INTERNAL_ORDER",
      entityId: order.id,
      action: "REQUIRE_MANAGER_WAREHOUSE_ASSIGNMENT",
      actor: "system",
      actorUserId: args.actorUserId,
      source: "sales/request-service",
      after: { taskCount: tasks.length, reason, warehouseAssignmentMode: "MANUAL" },
    }, tx);
    return { orderId: order.id, orderCode: order.code, taskCount: tasks.length };
  });
}

export async function confirmSalesRequestPickTasksBatch(
  prisma: PrismaClient,
  args: {
    orderId: string;
    operatorName: string;
    operatorUserId?: string | null;
    tasks: Array<{ taskId: string; pickedQty?: number | null; shortReason?: string | null; scanRef?: string | null }>;
  }
) {
  const perf = startPerf("sales.confirm_pick_tasks_batch");
  const inventoryService = getInventoryService(prisma);

  if (!args.operatorUserId) {
    throw new InventoryServiceError("OPERATOR_REQUIRED", "Se requiere un operador autenticado para confirmar tareas");
  }

  return prisma.$transaction(async (tx) => {
    const loadPerf = startPerf("sales.confirm_pick_tasks_batch.load_tasks");
    const dbTasks = await tx.salesInternalOrderPickTask.findMany({
      where: { id: { in: args.tasks.map((task) => task.taskId) } },
      select: {
        id: true,
        reservedQty: true,
        pickedQty: true,
        shortQty: true,
        status: true,
        claimedByUserId: true,
        sourceLocationId: true,
        sourceLocation: { select: { code: true } },
        targetLocationId: true,
        pickListId: true,
        orderLineId: true,
        orderLine: {
          select: {
            orderId: true,
            productId: true,
            product: { select: { sku: true } },
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
    loadPerf.end({ taskCount: dbTasks.length });

    const taskById = new Map(dbTasks.map((task) => [task.id, task]));
    const inputByTaskId = new Map(args.tasks.map((task) => [task.taskId, task]));
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
      if (dbTask.claimedByUserId !== args.operatorUserId) {
        throw new InventoryServiceError("TASK_NOT_CLAIMED", "La tarea debe ser tomada por el operador antes de confirmar el surtido");
      }
      const pending = Math.max(0, dbTask.reservedQty - dbTask.pickedQty);
      const scanRef = inputByTaskId.get(dbTask.id)?.scanRef?.trim().toLowerCase();
      if (pending > 0 && !scanRef) {
        throw new InventoryServiceError("SCAN_REQUIRED", "Se requiere escanear la ubicación o el SKU antes de confirmar el surtido");
      }
      if (pending > 0 && scanRef !== dbTask.sourceLocation.code.toLowerCase() && scanRef !== dbTask.orderLine.product?.sku?.toLowerCase()) {
        throw new InventoryServiceError("INVALID_SCAN", "El escaneo no coincide con la ubicación o el SKU de la tarea");
      }
    }

    await assertSalesRequestReservationConsistency(tx, args.orderId);

    const moveByKey = new Map<string, { productId: string; fromLocationId: string; toLocationId: string; qty: number; reference: string }>();
    const releaseByKey = new Map<string, { productId: string; locationId: string; qty: number; reference: string }>();
    const updates: Array<{
      id: string;
      pickedQty: number;
      shortQty: number;
      status: "COMPLETED" | "PARTIAL";
      shortReason: string | null;
    }> = [];
    for (const task of args.tasks) {
      const dbTask = taskById.get(task.taskId);
      if (!dbTask || !dbTask.orderLine.productId) continue;

      const pending = Math.max(0, dbTask.reservedQty - dbTask.pickedQty);
      const pickedQty = task.pickedQty == null ? pending : task.pickedQty;
      if (!Number.isFinite(pickedQty) || pickedQty < 0 || pickedQty > pending) {
        throw new InventoryServiceError("INVALID_QTY", "La cantidad surtida es inválida");
      }

      if (pickedQty > 0) {
        const moveKey = `${dbTask.orderLine.productId}:${dbTask.sourceLocationId}:${dbTask.targetLocationId}:${dbTask.pickList.code}`;
        const currentMove = moveByKey.get(moveKey);
        if (currentMove) {
          currentMove.qty += pickedQty;
        } else {
          moveByKey.set(moveKey, {
            productId: dbTask.orderLine.productId,
            fromLocationId: dbTask.sourceLocationId,
            toLocationId: dbTask.targetLocationId,
            qty: pickedQty,
            reference: dbTask.pickList.code,
          });
        }
      }

      const shortQty = pending - pickedQty;
      if (shortQty > 0) {
        const releaseKey = `${dbTask.orderLine.productId}:${dbTask.sourceLocationId}:${dbTask.pickList.code}`;
        const currentRelease = releaseByKey.get(releaseKey);
        if (currentRelease) {
          currentRelease.qty += shortQty;
        } else {
          releaseByKey.set(releaseKey, {
            productId: dbTask.orderLine.productId,
            locationId: dbTask.sourceLocationId,
            qty: shortQty,
            reference: dbTask.pickList.code,
          });
        }
      }
      updates.push({
        id: dbTask.id,
        pickedQty: dbTask.pickedQty + pickedQty,
        shortQty: dbTask.shortQty + shortQty,
        status: shortQty > 0 ? "PARTIAL" : "COMPLETED",
        shortReason: shortQty > 0 ? (task.shortReason?.trim() || "FALTANTE_EN_SURTIDO") : null,
      });
    }

    const inventoryPerf = startPerf("sales.confirm_pick_tasks_batch.inventory");
    for (const item of moveByKey.values()) {
      await inventoryService.moveReservedStockToLocation(item.productId, item.fromLocationId, item.toLocationId, item.qty, {
        tx,
        reference: item.reference,
        notes: "Surtido directo consolidado",
        operatorName: args.operatorName,
        operatorUserId: args.operatorUserId ?? null,
        actor: args.operatorName,
        actorUserId: args.operatorUserId ?? null,
        documentType: "SALES_INTERNAL_ORDER",
        documentId: args.orderId,
      });
    }
    for (const item of releaseByKey.values()) {
      await inventoryService.releaseReservedStock(item.productId, item.locationId, item.qty, {
        tx,
        reference: item.reference,
        notes: "Liberación consolidada por faltante",
        actor: args.operatorName,
        actorUserId: args.operatorUserId ?? null,
        operatorName: args.operatorName,
        operatorUserId: args.operatorUserId ?? null,
        source: "sales/request-service",
        documentType: "SALES_INTERNAL_ORDER",
        documentId: args.orderId,
      });
    }
    inventoryPerf.end({ moveOps: moveByKey.size, releaseOps: releaseByKey.size });

    const taskUpdatePerf = startPerf("sales.confirm_pick_tasks_batch.update_tasks");
    for (const update of updates) {
      await tx.salesInternalOrderPickTask.update({
        where: { id: update.id },
        data: {
          pickedQty: update.pickedQty,
          shortQty: update.shortQty,
          status: update.status,
          shortReason: update.shortReason,
          lastActivityAt: new Date(),
        },
      });
    }
    for (const update of updates.filter((item) => item.shortQty > 0)) {
      const task = taskById.get(update.id);
      if (!task) continue;
      const existingOpenException = await tx.salesInternalOrderException.findFirst({
        where: {
          pickTaskId: update.id,
          type: "SHORTAGE",
          status: "OPEN",
        },
        select: { id: true },
      });
      if (!existingOpenException) {
        await tx.salesInternalOrderException.create({
          data: {
            orderId: args.orderId,
            orderLineId: task.orderLineId,
            pickTaskId: update.id,
            type: "SHORTAGE",
            status: "OPEN",
            reportedQty: update.shortQty,
            reason: update.shortReason ?? "FALTANTE_EN_SURTIDO",
            reportedByUserId: args.operatorUserId ?? null,
          },
        });
      }
    }
    taskUpdatePerf.end({ updatedTasks: updates.length });

    const pickListIds = Array.from(new Set(dbTasks.map((task) => task.pickListId)));
    const pickListPerf = startPerf("sales.confirm_pick_tasks_batch.update_picklists");
    const allTasksForPickLists = await tx.salesInternalOrderPickTask.findMany({
      where: { pickListId: { in: pickListIds } },
      select: { pickListId: true, status: true, pickedQty: true, shortQty: true },
    });
    const tasksByPickList = new Map<string, Array<{ status: string; pickedQty: number; shortQty: number }>>();
    for (const task of allTasksForPickLists) {
      if (!tasksByPickList.has(task.pickListId)) {
        tasksByPickList.set(task.pickListId, []);
      }
      tasksByPickList.get(task.pickListId)?.push({
        status: task.status,
        pickedQty: task.pickedQty,
        shortQty: task.shortQty,
      });
    }
    for (const pickListId of pickListIds) {
      const tasks = tasksByPickList.get(pickListId) ?? [];
      const nextStatus = computePickListStatusFromTasks(tasks);
      await tx.salesInternalOrderPickList.update({
        where: { id: pickListId },
        data: {
          status: nextStatus,
          completedAt: nextStatus === "COMPLETED" || nextStatus === "PARTIAL" ? new Date() : null,
        },
      });
    }
    await tx.salesInternalOrder.update({
      where: { id: args.orderId },
      data: { warehouseLastActivityAt: new Date() },
    });
    pickListPerf.end({ pickListCount: pickListIds.length });

    await createAuditLogSafeWithDb({
      entityType: "SALES_INTERNAL_ORDER",
      entityId: args.orderId,
      action: "CONFIRM_DIRECT_PICK",
      actor: args.operatorName,
      actorUserId: args.operatorUserId ?? null,
      source: "sales/request-service",
      after: {
        taskCount: args.tasks.length,
      },
    }, tx);
    perf.end({ orderId: args.orderId, taskCount: args.tasks.length });

    return { processedCount: args.tasks.length };
  });
}
