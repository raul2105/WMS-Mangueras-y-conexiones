import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Prisma, PrismaClient } from "@prisma/client";
import { getAssemblyCompatibilityDecision } from "@/lib/catalog/compatibility";
import {
  confirmAssemblyPickTasksBatch,
  releaseAssemblyPickList,
} from "@/lib/assembly/picking-service";
import { cancelAssemblyWorkOrder, closeAssemblyWorkOrderConsume } from "@/lib/assembly/work-order-service";
import { randomUUID } from "node:crypto";

const describePostgres = process.env.RUN_POSTGRES_TESTS === "1" ? describe : describe.skip;

let prisma: PrismaClient;

async function resetDb() {
  await prisma.auditLog.deleteMany();
  await prisma.inventoryMovement.deleteMany();
  await prisma.pickTask.deleteMany();
  await prisma.pickList.deleteMany();
  await prisma.assemblyWorkOrderLine.deleteMany();
  await prisma.assemblyWorkOrder.deleteMany();
  await prisma.assemblyConfiguration.deleteMany();
  await prisma.productionOrderItem.deleteMany();
  await prisma.productionOrder.deleteMany();
  await prisma.salesInternalOrderLine.deleteMany();
  await prisma.salesInternalOrder.deleteMany();
  await prisma.productCompatibilityRule.deleteMany();
  await prisma.productTechnicalSource.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.location.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.product.deleteMany();
}

type Fixture = Awaited<ReturnType<typeof createFixture>>;

async function createFixture() {
  const warehouse = await prisma.warehouse.create({
    data: { code: "COMP-GATE", name: "Compatibility Gate Test" },
  });
  const [storage, wip] = await Promise.all([
    prisma.location.create({
      data: {
        code: "COMP-GATE-STORAGE",
        name: "Compatibility storage",
        usageType: "STORAGE",
        warehouseId: warehouse.id,
      },
    }),
    prisma.location.create({
      data: {
        code: "COMP-GATE-WIP",
        name: "Compatibility WIP",
        usageType: "WIP",
        warehouseId: warehouse.id,
      },
    }),
  ]);
  const [entry, hose, exit, substitute] = await Promise.all([
    prisma.product.create({ data: { sku: "COMP-ENTRY", name: "Entry", type: "FITTING" } }),
    prisma.product.create({ data: { sku: "COMP-HOSE", name: "Hose", type: "HOSE" } }),
    prisma.product.create({ data: { sku: "COMP-EXIT", name: "Exit", type: "FITTING" } }),
    prisma.product.create({ data: { sku: "COMP-SUBSTITUTE", name: "Substitute", type: "FITTING" } }),
  ]);
  const source = await prisma.productTechnicalSource.create({
    data: {
      supplierName: "Compatibility test supplier",
      documentRef: "COMP-GATE-DOC",
      documentVersion: "1",
      status: "APPROVED",
      reviewedAt: new Date(),
    },
  });
  const [entryHoseRule, hoseExitRule] = await Promise.all([
    prisma.productCompatibilityRule.create({
      data: {
        productId: entry.id,
        compatibleProductId: hose.id,
        ruleType: "ASSEMBLY",
        description: "Entrada y manguera aprobadas",
        severity: "INFO",
        decision: "APPROVED",
        governanceStatus: "APPROVED",
        sourceId: source.id,
      },
    }),
    prisma.productCompatibilityRule.create({
      data: {
        productId: hose.id,
        compatibleProductId: exit.id,
        ruleType: "ASSEMBLY",
        description: "Manguera y salida aprobadas",
        severity: "INFO",
        decision: "APPROVED",
        governanceStatus: "APPROVED",
        sourceId: source.id,
      },
    }),
  ]);
  const salesOrder = await prisma.salesInternalOrder.create({
    data: {
      code: "COMP-GATE-SALES",
      status: "CONFIRMADA",
      customerName: "Compatibility customer",
      warehouseId: warehouse.id,
    },
  });
  const productionOrder = await prisma.productionOrder.create({
    data: {
      code: "COMP-GATE-PRODUCTION",
      kind: "ASSEMBLY_3PIECE",
      status: "ABIERTA",
      warehouseId: warehouse.id,
      sourceDocumentType: "SalesInternalOrder",
      sourceDocumentId: salesOrder.id,
      assemblyConfiguration: {
        create: {
          entryFittingProductId: entry.id,
          hoseProductId: hose.id,
          exitFittingProductId: exit.id,
          hoseLength: 1,
          assemblyQuantity: 1,
          totalHoseRequired: 1,
          workingPressureBar: 180,
          operatingTemperatureC: 60,
          medium: "Aceite hidráulico",
          application: "Línea de retorno",
          assemblyMethod: "Prensado",
          compatibilityStatus: "APPROVED",
        },
      },
    },
  });
  const workOrder = await prisma.assemblyWorkOrder.create({
    data: {
      productionOrderId: productionOrder.id,
      warehouseId: warehouse.id,
      wipLocationId: wip.id,
      reservationStatus: "RESERVED",
    },
  });
  const componentRows = [
    { role: "ENTRY_FITTING" as const, product: entry },
    { role: "HOSE" as const, product: hose },
    { role: "EXIT_FITTING" as const, product: exit },
  ];
  const lines = [];
  for (const row of componentRows) {
    const line = await prisma.assemblyWorkOrderLine.create({
      data: {
        assemblyWorkOrderId: workOrder.id,
        componentRole: row.role,
        productId: row.product.id,
        requiredQty: 1,
        reservedQty: 1,
        perAssemblyQty: 1,
        reservationStatus: "RESERVED",
      },
    });
    await prisma.inventory.create({
      data: {
        productId: row.product.id,
        locationId: storage.id,
        quantity: 1,
        reserved: 1,
        available: 0,
      },
    });
    lines.push(line);
  }
  const pickList = await prisma.pickList.create({
    data: {
      code: "COMP-GATE-PICK",
      assemblyWorkOrderId: workOrder.id,
      status: "DRAFT",
    },
  });
  const tasks = [];
  for (const [index, line] of lines.entries()) {
    tasks.push(await prisma.pickTask.create({
      data: {
        pickListId: pickList.id,
        assemblyWorkOrderLineId: line.id,
        sourceLocationId: storage.id,
        targetWipLocationId: wip.id,
        sequence: index + 1,
        requestedQty: 1,
        reservedQty: 1,
      },
    }));
  }

  return {
    entry,
    hose,
    exit,
    substitute,
    entryHoseRule,
    hoseExitRule,
    productionOrder,
    workOrder,
    pickList,
    tasks,
    storage,
    wip,
  };
}

async function assertReleaseWasRolledBack(fixture: Fixture) {
  const [pickList, workOrder, productionOrder, auditCount] = await Promise.all([
    prisma.pickList.findUnique({ where: { id: fixture.pickList.id } }),
    prisma.assemblyWorkOrder.findUnique({ where: { id: fixture.workOrder.id } }),
    prisma.productionOrder.findUnique({ where: { id: fixture.productionOrder.id } }),
    prisma.auditLog.count({
      where: {
        entityType: "ASSEMBLY_ORDER",
        entityId: fixture.productionOrder.id,
        action: "RELEASE_PICK_LIST",
      },
    }),
  ]);
  expect(pickList?.status).toBe("DRAFT");
  expect(workOrder?.pickStatus).toBe("NOT_RELEASED");
  expect(productionOrder?.status).toBe("ABIERTA");
  expect(auditCount).toBe(0);
}

function createBarrier(parties: number) {
  let arrived = 0;
  let release!: () => void;
  const released = new Promise<void>((resolve) => { release = resolve; });
  return async () => {
    arrived += 1;
    if (arrived === parties) release();
    await released;
  };
}

function prismaWithGatedProductionOrderRead(wait: () => Promise<void>) {
  return {
    $transaction: (
      run: (tx: Prisma.TransactionClient) => Promise<unknown>,
      options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel },
    ) =>
      prisma.$transaction((tx) => {
        const productionOrder = new Proxy(tx.productionOrder, {
          get(target, property, receiver) {
            const value = Reflect.get(target, property, receiver);
            if (property !== "findUnique" || typeof value !== "function") return value;
            return async (...args: unknown[]) => {
              const result = await value.apply(target, args);
              await wait();
              return result;
            };
          },
        });
        return run(new Proxy(tx, {
          get(target, property, receiver) {
            if (property === "productionOrder") return productionOrder;
            const value = Reflect.get(target, property, receiver);
            return typeof value === "function" ? value.bind(target) : value;
          },
        }) as Prisma.TransactionClient);
      }, options),
  } as unknown as PrismaClient;
}

describePostgres("KAN-20 PostgreSQL operational compatibility gates", () => {
  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
  });

  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("blocks release atomically when an approved rule becomes explicitly blocked", async () => {
    const fixture = await createFixture();
    await prisma.productCompatibilityRule.update({
      where: { id: fixture.entryHoseRule.id },
      data: { decision: "BLOCKED", severity: "BLOCK", description: "Combinación insegura" },
    });

    await expect(releaseAssemblyPickList(prisma, fixture.productionOrder.id))
      .rejects.toMatchObject({ code: "INCOMPATIBLE_COMPONENTS" });
    await assertReleaseWasRolledBack(fixture);
  });

  it.each([
    ["absent", async (fixture: Fixture) => prisma.productCompatibilityRule.delete({ where: { id: fixture.hoseExitRule.id } })],
    ["retired", async (fixture: Fixture) => prisma.productCompatibilityRule.update({ where: { id: fixture.hoseExitRule.id }, data: { active: false } })],
  ])("fails closed on release when a governed rule is %s", async (_caseName, mutateRule) => {
    const fixture = await createFixture();
    await mutateRule(fixture);

    await expect(releaseAssemblyPickList(prisma, fixture.productionOrder.id))
      .rejects.toMatchObject({ code: "COMPATIBILITY_REVIEW_REQUIRED" });
    await assertReleaseWasRolledBack(fixture);
  });

  it("blocks a component substitution before any pick or inventory movement", async () => {
    const fixture = await createFixture();
    await releaseAssemblyPickList(prisma, fixture.productionOrder.id);
    await prisma.assemblyWorkOrderLine.update({
      where: {
        assemblyWorkOrderId_componentRole: {
          assemblyWorkOrderId: fixture.workOrder.id,
          componentRole: "EXIT_FITTING",
        },
      },
      data: { productId: fixture.substitute.id },
    });

    await expect(confirmAssemblyPickTasksBatch(prisma, {
      productionOrderId: fixture.productionOrder.id,
      operatorName: "Compatibility test operator",
      tasks: fixture.tasks.map((task) => ({ taskId: task.id, pickedQty: 1 })),
    })).rejects.toMatchObject({ code: "COMPATIBILITY_REVIEW_REQUIRED" });

    const [tasks, movements, sourceInventory] = await Promise.all([
      prisma.pickTask.findMany({ where: { pickListId: fixture.pickList.id }, orderBy: { sequence: "asc" } }),
      prisma.inventoryMovement.count({ where: { documentId: fixture.productionOrder.id } }),
      prisma.inventory.findMany({ where: { locationId: fixture.storage.id }, orderBy: { productId: "asc" } }),
    ]);
    expect(tasks.every((task) => task.status === "PENDING" && task.pickedQty === 0)).toBe(true);
    expect(movements).toBe(0);
    expect(sourceInventory.every((row) => row.quantity === 1 && row.reserved === 1)).toBe(true);
  });

  it("reuses a documented review only while its governed rule snapshot remains unchanged", async () => {
    const fixture = await createFixture();
    await prisma.productCompatibilityRule.update({
      where: { id: fixture.entryHoseRule.id },
      data: { decision: "REQUIRES_REVIEW", severity: "WARN", description: "Revisión técnica autorizable" },
    });
    const decision = await getAssemblyCompatibilityDecision(
      prisma,
      [fixture.entry.id, fixture.hose.id, fixture.exit.id],
      {
        workingPressureBar: 180,
        operatingTemperatureC: 60,
        medium: "Aceite hidráulico",
        application: "Línea de retorno",
        assemblyMethod: "Prensado",
      },
    );
    expect(decision.status).toBe("REQUIRES_REVIEW");
    expect(decision.reviewOverrideAllowed).toBe(true);
    await prisma.assemblyConfiguration.update({
      where: { productionOrderId: fixture.productionOrder.id },
      data: {
        compatibilityStatus: "REQUIRES_REVIEW",
        compatibilityReviewApproved: true,
        compatibilityReviewReason: "Revisión técnica aprobada por responsable",
        compatibilityReviewedByUserId: "manager-test",
        compatibilityReviewRules: JSON.stringify(decision.matchedRules),
      },
    });

    await releaseAssemblyPickList(prisma, fixture.productionOrder.id);
    const releaseAudit = await prisma.auditLog.findFirst({
      where: {
        entityType: "ASSEMBLY_ORDER",
        entityId: fixture.productionOrder.id,
        action: "RELEASE_PICK_LIST",
      },
    });
    expect(releaseAudit?.after).toContain('"overrideReused":true');

    await prisma.productCompatibilityRule.update({
      where: { id: fixture.entryHoseRule.id },
      data: { ruleRevision: { increment: 1 } },
    });
    await expect(confirmAssemblyPickTasksBatch(prisma, {
      productionOrderId: fixture.productionOrder.id,
      operatorName: "Compatibility test operator",
      tasks: fixture.tasks.map((task) => ({ taskId: task.id, pickedQty: 1 })),
    })).rejects.toMatchObject({ code: "COMPATIBILITY_REVIEW_REQUIRED" });
    expect(await prisma.inventoryMovement.count({ where: { documentId: fixture.productionOrder.id } })).toBe(0);
  });

  it("revalidates again at close and rolls back consumption when a rule is retired", async () => {
    const fixture = await createFixture();
    await releaseAssemblyPickList(prisma, fixture.productionOrder.id);
    await confirmAssemblyPickTasksBatch(prisma, {
      productionOrderId: fixture.productionOrder.id,
      operatorName: "Compatibility test operator",
      tasks: fixture.tasks.map((task) => ({ taskId: task.id, pickedQty: 1 })),
    });
    await prisma.productCompatibilityRule.update({
      where: { id: fixture.hoseExitRule.id },
      data: { active: false },
    });

    await expect(closeAssemblyWorkOrderConsume(prisma, fixture.productionOrder.id))
      .rejects.toMatchObject({ code: "COMPATIBILITY_REVIEW_REQUIRED" });

    const [productionOrder, workOrder, lines, wipInventory, consumptionMovements] = await Promise.all([
      prisma.productionOrder.findUnique({ where: { id: fixture.productionOrder.id } }),
      prisma.assemblyWorkOrder.findUnique({ where: { id: fixture.workOrder.id } }),
      prisma.assemblyWorkOrderLine.findMany({ where: { assemblyWorkOrderId: fixture.workOrder.id } }),
      prisma.inventory.findMany({ where: { locationId: fixture.wip.id } }),
      prisma.inventoryMovement.count({
        where: { documentId: fixture.productionOrder.id, type: "OUT" },
      }),
    ]);
    expect(productionOrder?.status).toBe("EN_PROCESO");
    expect(workOrder?.consumptionStatus).toBe("NOT_CONSUMED");
    expect(lines.every((line) => line.consumedQty === 0)).toBe(true);
    expect(wipInventory.every((row) => row.quantity === 1)).toBe(true);
    expect(consumptionMovements).toBe(0);
  });

  it("serializes cancellation against release and records the authenticated actor exactly once", async () => {
    const fixture = await createFixture();
    const actor = await prisma.user.create({
      data: {
        email: `assembly-actor-${randomUUID()}@example.test`,
        name: "Assembly actor",
        passwordHash: "test-only",
      },
    });
    const waitForBothSnapshots = createBarrier(2);
    const db = prismaWithGatedProductionOrderRead(waitForBothSnapshots);
    const auditActor = { actorUserId: actor.id, actor: actor.name };
    const attempts = await Promise.allSettled([
      releaseAssemblyPickList(db, fixture.productionOrder.id, auditActor),
      cancelAssemblyWorkOrder(db, fixture.productionOrder.id, auditActor),
    ]);
    expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((result) => result.status === "rejected")).toHaveLength(1);

    const [productionOrder, workOrder, pickList, lines, tasks, stock, movements, audits] = await Promise.all([
      prisma.productionOrder.findUniqueOrThrow({ where: { id: fixture.productionOrder.id } }),
      prisma.assemblyWorkOrder.findUniqueOrThrow({ where: { id: fixture.workOrder.id } }),
      prisma.pickList.findUniqueOrThrow({ where: { id: fixture.pickList.id } }),
      prisma.assemblyWorkOrderLine.findMany({ where: { assemblyWorkOrderId: fixture.workOrder.id } }),
      prisma.pickTask.findMany({ where: { pickListId: fixture.pickList.id } }),
      prisma.inventory.findMany({ where: { locationId: fixture.storage.id } }),
      prisma.inventoryMovement.findMany({ where: { documentId: fixture.productionOrder.id } }),
      prisma.auditLog.findMany({
        where: { entityType: "ASSEMBLY_ORDER", entityId: fixture.productionOrder.id },
      }),
    ]);

    if (productionOrder.status === "CANCELADA") {
      expect(workOrder).toMatchObject({ pickStatus: "CANCELED", reservationStatus: "RELEASED" });
      expect(pickList.status).toBe("CANCELLED");
      expect(lines.every((line) => line.reservedQty === 0)).toBe(true);
      expect(tasks.every((task) => task.status === "CANCELLED")).toBe(true);
      expect(stock.every((row) => row.reserved === 0 && row.available === 1)).toBe(true);
      expect(movements).toHaveLength(3);
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({ action: "CANCEL", actor: actor.name, actorUserId: actor.id });
    } else {
      expect(productionOrder.status).toBe("EN_PROCESO");
      expect(workOrder.pickStatus).toBe("RELEASED");
      expect(pickList.status).toBe("RELEASED");
      expect(lines.every((line) => line.reservedQty === 1)).toBe(true);
      expect(tasks.every((task) => task.status === "PENDING")).toBe(true);
      expect(stock.every((row) => row.reserved === 1 && row.available === 0)).toBe(true);
      expect(movements).toHaveLength(0);
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({ action: "RELEASE_PICK_LIST", actor: actor.name, actorUserId: actor.id });
    }
  }, 45_000);

  it("rolls back cancellation effects if its required audit record cannot be written", async () => {
    const fixture = await createFixture();
    await expect(cancelAssemblyWorkOrder(prisma, fixture.productionOrder.id, {
      actor: "missing audit user",
      actorUserId: randomUUID(),
    })).rejects.toBeDefined();

    const [productionOrder, workOrder, pickList, lines, tasks, stock, movementCount, auditCount] = await Promise.all([
      prisma.productionOrder.findUniqueOrThrow({ where: { id: fixture.productionOrder.id } }),
      prisma.assemblyWorkOrder.findUniqueOrThrow({ where: { id: fixture.workOrder.id } }),
      prisma.pickList.findUniqueOrThrow({ where: { id: fixture.pickList.id } }),
      prisma.assemblyWorkOrderLine.findMany({ where: { assemblyWorkOrderId: fixture.workOrder.id } }),
      prisma.pickTask.findMany({ where: { pickListId: fixture.pickList.id } }),
      prisma.inventory.findMany({ where: { locationId: fixture.storage.id } }),
      prisma.inventoryMovement.count({ where: { documentId: fixture.productionOrder.id } }),
      prisma.auditLog.count({ where: { entityType: "ASSEMBLY_ORDER", entityId: fixture.productionOrder.id, action: "CANCEL" } }),
    ]);
    expect(productionOrder.status).toBe("ABIERTA");
    expect(workOrder).toMatchObject({ pickStatus: "NOT_RELEASED", reservationStatus: "RESERVED", canceledAt: null });
    expect(pickList.status).toBe("DRAFT");
    expect(lines.every((line) => line.reservedQty === 1)).toBe(true);
    expect(tasks.every((task) => task.status === "PENDING")).toBe(true);
    expect(stock.every((row) => row.reserved === 1 && row.available === 0)).toBe(true);
    expect(movementCount).toBe(0);
    expect(auditCount).toBe(0);
  }, 30_000);
});
