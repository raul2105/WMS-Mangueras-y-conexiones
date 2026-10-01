import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import {
  markSalesRequestPreparedForDelivery,
  finalizeSalesRequestCancellationAfterReversal,
  requestSalesRequestCustomerReturn,
  receiveSalesRequestReturn,
  resolveSalesRequestOperationalException,
} from "@/lib/sales/request-service";

const describePostgres = process.env.RUN_POSTGRES_TESTS === "1" ? describe : describe.skip;
let prisma: PrismaClient;

function barrier(parties: number) {
  let arrived = 0;
  let release!: () => void;
  const released = new Promise<void>((resolve) => { release = resolve; });
  return async () => {
    arrived += 1;
    if (arrived === parties) release();
    await released;
  };
}

function prismaWithExceptionClaimBarrier(wait: () => Promise<void>) {
  return {
    $transaction: (run: (tx: Prisma.TransactionClient) => Promise<unknown>) => prisma.$transaction((tx) => {
      const exceptionModel = new Proxy(tx.salesInternalOrderException, {
        get(target, property, receiver) {
          const value = Reflect.get(target, property, receiver);
          if (property !== "updateMany" || typeof value !== "function") return value;
          return async (...args: Parameters<typeof value>) => {
            await wait();
            return value.apply(target, args);
          };
        },
      });
      return run(new Proxy(tx, {
        get(target, property, receiver) {
          if (property === "salesInternalOrderException") return exceptionModel;
          const value = Reflect.get(target, property, receiver);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }) as Prisma.TransactionClient);
    }),
  } as unknown as PrismaClient;
}

function prismaWithReturnClaimBarrier(wait: () => Promise<void>) {
  return {
    $transaction: (run: (tx: Prisma.TransactionClient) => Promise<unknown>) => prisma.$transaction((tx) => {
      const returnModel = new Proxy(tx.salesInternalOrderReturn, {
        get(target, property, receiver) {
          const value = Reflect.get(target, property, receiver);
          if (property !== "updateMany" || typeof value !== "function") return value;
          return async (...args: Parameters<typeof value>) => {
            await wait();
            return value.apply(target, args);
          };
        },
      });
      return run(new Proxy(tx, {
        get(target, property, receiver) {
          if (property === "salesInternalOrderReturn") return returnModel;
          const value = Reflect.get(target, property, receiver);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }) as Prisma.TransactionClient);
    }),
  } as unknown as PrismaClient;
}

function prismaWithFailingAudit() {
  return {
    $transaction: (run: (tx: Prisma.TransactionClient) => Promise<unknown>) => prisma.$transaction((tx) => {
      const auditModel = new Proxy(tx.auditLog, {
        get(target, property, receiver) {
          if (property === "create") return async () => { throw new Error("audit unavailable"); };
          const value = Reflect.get(target, property, receiver);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      return run(new Proxy(tx, {
        get(target, property, receiver) {
          if (property === "auditLog") return auditModel;
          const value = Reflect.get(target, property, receiver);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }) as Prisma.TransactionClient);
    }),
  } as unknown as PrismaClient;
}

function prismaWithOrderClaimBarrier(wait: () => Promise<void>) {
  return {
    $transaction: (run: (tx: Prisma.TransactionClient) => Promise<unknown>) => prisma.$transaction((tx) => {
      const orderModel = new Proxy(tx.salesInternalOrder, {
        get(target, property, receiver) {
          const value = Reflect.get(target, property, receiver);
          if (property !== "updateMany" || typeof value !== "function") return value;
          return async (...args: Parameters<typeof value>) => {
            await wait();
            return value.apply(target, args);
          };
        },
      });
      return run(new Proxy(tx, {
        get(target, property, receiver) {
          if (property === "salesInternalOrder") return orderModel;
          const value = Reflect.get(target, property, receiver);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }) as Prisma.TransactionClient);
    }),
  } as unknown as PrismaClient;
}

async function createUser(roleCode: "WAREHOUSE_OPERATOR" | "MANAGER" | "SYSTEM_ADMIN", token: string) {
  const role = await prisma.role.upsert({
    where: { code: roleCode },
    update: { isActive: true, name: roleCode },
    create: { code: roleCode, name: roleCode, isActive: true },
    select: { id: true },
  });
  return prisma.user.create({
    data: {
      email: `ownership-${roleCode.toLowerCase()}-${token}@example.invalid`,
      name: `Ownership ${roleCode} ${token}`,
      passwordHash: "unused-in-integration-test",
      userRoles: { create: [{ roleId: role.id }] },
    },
  });
}

async function createPreparationFixture() {
  const token = randomUUID().replaceAll("-", "").slice(0, 12);
  const warehouse = await prisma.warehouse.create({ data: { code: `OWN-WH-${token}`, name: `Ownership warehouse ${token}` } });
  const location = await prisma.location.create({
    data: { code: `OWN-SHIP-${token}`, name: "Ownership staging", usageType: "SHIPPING", warehouseId: warehouse.id },
  });
  const order = await prisma.salesInternalOrder.create({
    data: { code: `OWN-ORDER-${token}`, status: "CONFIRMADA", warehouseId: warehouse.id },
  });
  return { token, warehouse, location, order };
}

async function cleanupPreparationFixture(input: Awaited<ReturnType<typeof createPreparationFixture>>) {
  await prisma.auditLog.deleteMany({ where: { entityId: input.order.id } });
  await prisma.salesInternalOrderException.deleteMany({ where: { orderId: input.order.id } });
  await prisma.salesInternalOrder.deleteMany({ where: { id: input.order.id } });
  await prisma.location.deleteMany({ where: { id: input.location.id } });
  await prisma.warehouse.deleteMany({ where: { id: input.warehouse.id } });
}

beforeAll(async () => {
  prisma = new PrismaClient();
  await prisma.$connect();
}, 60_000);

afterAll(async () => { await prisma.$disconnect(); }, 60_000);

describePostgres("sales physical preparation ownership and exception CAS (PostgreSQL)", () => {
  it("rejects a warehouse operator who does not own the physical assignment", async () => {
    const fixture = await createPreparationFixture();
    const [owner, otherOperator] = await Promise.all([
      createUser("WAREHOUSE_OPERATOR", fixture.token + "a"),
      createUser("WAREHOUSE_OPERATOR", fixture.token + "b"),
    ]);
    try {
      await prisma.salesInternalOrder.update({
        where: { id: fixture.order.id },
        data: { warehouseAssigneeUserId: owner.id, warehouseAssignmentMode: "MANUAL" },
      });
      await expect(markSalesRequestPreparedForDelivery(prisma, {
        orderId: fixture.order.id,
        preparedByUserId: otherOperator.id,
        preparedLocationId: fixture.location.id,
      })).rejects.toMatchObject({ code: "PREPARATION_NOT_AUTHORIZED" });
      expect(await prisma.salesInternalOrder.findUniqueOrThrow({ where: { id: fixture.order.id } }))
        .toMatchObject({ preparedForDeliveryAt: null, preparedForDeliveryByUserId: null });
      expect(await prisma.auditLog.count({ where: { entityId: fixture.order.id, action: "MARK_PREPARED_FOR_DELIVERY" } })).toBe(0);
    } finally {
      await cleanupPreparationFixture(fixture);
      await prisma.user.deleteMany({ where: { id: { in: [owner.id, otherOperator.id] } } });
    }
  }, 30_000);

  it("allows a Manager override only with a reason and audits that override", async () => {
    const fixture = await createPreparationFixture();
    const manager = await createUser("MANAGER", fixture.token);
    try {
      await expect(markSalesRequestPreparedForDelivery(prisma, {
        orderId: fixture.order.id,
        preparedByUserId: manager.id,
        preparedLocationId: fixture.location.id,
      })).rejects.toMatchObject({ code: "PREPARATION_OVERRIDE_REASON_REQUIRED" });
      const result = await markSalesRequestPreparedForDelivery(prisma, {
        orderId: fixture.order.id,
        preparedByUserId: manager.id,
        preparedLocationId: fixture.location.id,
        notes: "Supervisión cubre ausencia del responsable de almacén",
      });
      expect(result).toMatchObject({ prepared: true, alreadyPrepared: false });
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { entityId: fixture.order.id, action: "MARK_PREPARED_FOR_DELIVERY" },
      });
      expect(audit.actorUserId).toBe(manager.id);
      expect(audit.after).toContain("supervisorOverrideReason");
      expect(audit.after).toContain("Supervisión cubre ausencia del responsable de almacén");
    } finally {
      await cleanupPreparationFixture(fixture);
      await prisma.user.delete({ where: { id: manager.id } });
    }
  }, 30_000);

  it("lets one concurrent OPEN-exception decision commit one audit", async () => {
    const token = randomUUID().replaceAll("-", "").slice(0, 12);
    const order = await prisma.salesInternalOrder.create({ data: { code: `EXC-ORDER-${token}` } });
    const exception = await prisma.salesInternalOrderException.create({
      data: { orderId: order.id, type: "SHORTAGE", reason: "Faltante concurrente QA" },
    });
    const manager = await createUser("MANAGER", token);
    try {
      const gatedPrisma = prismaWithExceptionClaimBarrier(barrier(2));
      const decisions = await Promise.allSettled([1, 2].map(() => resolveSalesRequestOperationalException(gatedPrisma, {
        exceptionId: exception.id,
        decidedByUserId: manager.id,
        resolution: "WAIT_REPLENISHMENT",
        notes: "Decisión concurrente de prueba",
      })));
      expect(decisions.filter((decision) => decision.status === "fulfilled")).toHaveLength(1);
      const rejected = decisions.find((decision) => decision.status === "rejected");
      expect(rejected?.status === "rejected" ? rejected.reason : null).toMatchObject({ code: "EXCEPTION_CLOSED" });
      expect(await prisma.salesInternalOrderException.findUniqueOrThrow({ where: { id: exception.id } }))
        .toMatchObject({ status: "RESOLVED", resolution: "WAIT_REPLENISHMENT", decidedByUserId: manager.id });
      const audits = await prisma.auditLog.findMany({ where: { entityId: order.id, action: "RESOLVE_OPERATIONAL_EXCEPTION" } });
      expect(audits).toHaveLength(1);
      expect(audits[0]?.actorUserId).toBe(manager.id);
    } finally {
      await prisma.auditLog.deleteMany({ where: { entityId: order.id } });
      await prisma.salesInternalOrderException.deleteMany({ where: { id: exception.id } });
      await prisma.salesInternalOrder.deleteMany({ where: { id: order.id } });
      await prisma.user.delete({ where: { id: manager.id } });
    }
  }, 30_000);

  it("serializes concurrent physical return receipt and emits one audit", async () => {
    const token = randomUUID().replaceAll("-", "").slice(0, 12);
    const order = await prisma.salesInternalOrder.create({ data: { code: `RET-ORDER-${token}` } });
    const record = await prisma.salesInternalOrderReturn.create({
      data: { orderId: order.id, kind: "CUSTOMER_RETURN", reason: "Concurrent receipt QA", requestedByUserId: null },
    });
    const operator = await createUser("WAREHOUSE_OPERATOR", token);
    try {
      const gatedPrisma = prismaWithReturnClaimBarrier(barrier(2));
      const receipts = await Promise.allSettled([1, 2].map(() => receiveSalesRequestReturn(gatedPrisma, {
        returnId: record.id,
        receivedByUserId: operator.id,
        auditActor: { actorUserId: operator.id, actor: operator.name ?? operator.email },
        items: [],
      })));
      expect(receipts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(receipts.filter((result) => result.status === "rejected")).toHaveLength(1);
      expect(await prisma.salesInternalOrderReturn.findUniqueOrThrow({ where: { id: record.id } }))
        .toMatchObject({ status: "COMPLETED", receivedByUserId: operator.id, completedByUserId: operator.id });
      const audits = await prisma.auditLog.findMany({ where: { entityId: order.id, action: "COMPLETE_SALES_ORDER_RETURN" } });
      expect(audits).toHaveLength(1);
      expect(audits[0]?.actorUserId).toBe(operator.id);
    } finally {
      await prisma.auditLog.deleteMany({ where: { entityId: order.id } });
      await prisma.salesInternalOrderReturn.delete({ where: { id: record.id } });
      await prisma.salesInternalOrder.delete({ where: { id: order.id } });
      await prisma.user.delete({ where: { id: operator.id } });
    }
  }, 30_000);

  it("creates one customer return when two requests race on the delivered order CAS", async () => {
    const token = randomUUID().replaceAll("-", "").slice(0, 12);
    const manager = await createUser("MANAGER", token);
    const warehouse = await prisma.warehouse.create({ data: { code: `RET-WH-${token}`, name: `Return warehouse ${token}` } });
    const location = await prisma.location.create({ data: { code: `RET-LOC-${token}`, name: "Return staging", usageType: "STORAGE", warehouseId: warehouse.id } });
    const product = await prisma.product.create({ data: { sku: `RET-SKU-${token}`, name: "Return item", type: "ACCESSORY" } });
    const order = await prisma.salesInternalOrder.create({ data: { code: `RET-REQUEST-${token}`, deliveredToCustomerAt: new Date() } });
    await prisma.inventoryMovement.create({
      data: { productId: product.id, locationId: location.id, type: "OUT", quantity: 2, documentType: "SALES_INTERNAL_ORDER_DELIVERY", documentId: order.id },
    });
    try {
      const gatedPrisma = prismaWithOrderClaimBarrier(barrier(2));
      const requests = await Promise.all([1, 2].map(() => requestSalesRequestCustomerReturn(gatedPrisma, {
        orderId: order.id,
        requestedByUserId: manager.id,
        reason: "Producto recibido con daño QA",
        auditActor: { actorUserId: manager.id, actor: manager.name ?? manager.email },
      })));
      expect(requests.filter((result) => !result.alreadyRequested)).toHaveLength(1);
      expect(requests.filter((result) => result.alreadyRequested)).toHaveLength(1);
      expect(requests[0]?.returnId).toBe(requests[1]?.returnId);
      expect(await prisma.salesInternalOrderReturn.count({ where: { orderId: order.id, kind: "CUSTOMER_RETURN" } })).toBe(1);
      const audits = await prisma.auditLog.findMany({ where: { entityId: order.id, action: "REQUEST_CUSTOMER_RETURN" } });
      expect(audits).toHaveLength(1);
      expect(audits[0]?.actorUserId).toBe(manager.id);
    } finally {
      await prisma.auditLog.deleteMany({ where: { entityId: order.id } });
      await prisma.salesInternalOrderReturn.deleteMany({ where: { orderId: order.id } });
      await prisma.inventoryMovement.deleteMany({ where: { documentId: order.id } });
      await prisma.salesInternalOrder.delete({ where: { id: order.id } });
      await prisma.product.delete({ where: { id: product.id } });
      await prisma.location.delete({ where: { id: location.id } });
      await prisma.warehouse.delete({ where: { id: warehouse.id } });
      await prisma.user.delete({ where: { id: manager.id } });
    }
  }, 30_000);

  it("rolls back return receipt state when its required audit write fails", async () => {
    const token = randomUUID().replaceAll("-", "").slice(0, 12);
    const order = await prisma.salesInternalOrder.create({ data: { code: `RET-AUDIT-${token}` } });
    const record = await prisma.salesInternalOrderReturn.create({
      data: { orderId: order.id, kind: "CUSTOMER_RETURN", reason: "Audit rollback QA", requestedByUserId: null },
    });
    const operator = await createUser("WAREHOUSE_OPERATOR", token);
    try {
      await expect(receiveSalesRequestReturn(prismaWithFailingAudit(), {
        returnId: record.id,
        receivedByUserId: operator.id,
        auditActor: { actorUserId: operator.id, actor: operator.name ?? operator.email },
        items: [],
      })).rejects.toThrow("audit unavailable");
      expect(await prisma.salesInternalOrderReturn.findUniqueOrThrow({ where: { id: record.id } }))
        .toMatchObject({ status: "REQUESTED", receivedByUserId: null, completedByUserId: null });
    } finally {
      await prisma.auditLog.deleteMany({ where: { entityId: order.id } });
      await prisma.salesInternalOrderReturn.delete({ where: { id: record.id } });
      await prisma.salesInternalOrder.delete({ where: { id: order.id } });
      await prisma.user.delete({ where: { id: operator.id } });
    }
  }, 30_000);

  it("serializes final cancellation after physical reversal and rolls back on audit failure", async () => {
    const token = randomUUID().replaceAll("-", "").slice(0, 12);
    const manager = await createUser("MANAGER", token);
    const order = await prisma.salesInternalOrder.create({ data: { code: `REV-CANCEL-${token}`, status: "CONFIRMADA" } });
    const exception = await prisma.salesInternalOrderException.create({
      data: { orderId: order.id, type: "CANCELLATION_REQUEST", status: "RESOLVED", resolution: "CANCEL_ORDER", reason: "QA reversal", decidedByUserId: manager.id },
    });
    const record = await prisma.salesInternalOrderReturn.create({
      data: { orderId: order.id, exceptionId: exception.id, kind: "CANCELLATION_REVERSAL", status: "COMPLETED", reason: "QA reversal", requestedByUserId: manager.id },
    });
    const actor = { actorUserId: manager.id, actor: manager.name ?? manager.email };
    let rollbackOrderId: string | null = null;
    try {
      const gatedPrisma = prismaWithOrderClaimBarrier(barrier(2));
      const cancellations = await Promise.all([1, 2].map(() => finalizeSalesRequestCancellationAfterReversal(gatedPrisma, {
        orderId: order.id, cancelledByUserId: manager.id, auditActor: actor,
      })));
      expect(cancellations.filter((result) => !result.alreadyCancelled)).toHaveLength(1);
      expect(cancellations.filter((result) => result.alreadyCancelled)).toHaveLength(1);
      expect(await prisma.auditLog.count({ where: { entityId: order.id, action: "CONFIRM_CANCELLATION_AFTER_PHYSICAL_REVERSAL" } })).toBe(1);

      const rollbackOrder = await prisma.salesInternalOrder.create({ data: { code: `REV-ROLLBACK-${token}`, status: "CONFIRMADA" } });
      rollbackOrderId = rollbackOrder.id;
      const rollbackException = await prisma.salesInternalOrderException.create({
        data: { orderId: rollbackOrder.id, type: "CANCELLATION_REQUEST", status: "RESOLVED", resolution: "CANCEL_ORDER", reason: "QA rollback", decidedByUserId: manager.id },
      });
      await prisma.salesInternalOrderReturn.create({
        data: { orderId: rollbackOrder.id, exceptionId: rollbackException.id, kind: "CANCELLATION_REVERSAL", status: "COMPLETED", reason: "QA rollback", requestedByUserId: manager.id },
      });
      await expect(finalizeSalesRequestCancellationAfterReversal(prismaWithFailingAudit(), {
        orderId: rollbackOrder.id, cancelledByUserId: manager.id, auditActor: actor,
      })).rejects.toThrow("audit unavailable");
      expect(await prisma.salesInternalOrder.findUniqueOrThrow({ where: { id: rollbackOrder.id } })).toMatchObject({ status: "CONFIRMADA", cancelledAt: null });
    } finally {
      if (rollbackOrderId) {
        await prisma.auditLog.deleteMany({ where: { entityId: rollbackOrderId } });
        await prisma.salesInternalOrderReturn.deleteMany({ where: { orderId: rollbackOrderId } });
        await prisma.salesInternalOrderException.deleteMany({ where: { orderId: rollbackOrderId } });
        await prisma.salesInternalOrder.delete({ where: { id: rollbackOrderId } });
      }
      await prisma.auditLog.deleteMany({ where: { entityId: order.id } });
      await prisma.salesInternalOrderReturn.delete({ where: { id: record.id } });
      await prisma.salesInternalOrderException.delete({ where: { id: exception.id } });
      await prisma.salesInternalOrder.delete({ where: { id: order.id } });
      await prisma.user.delete({ where: { id: manager.id } });
    }
  }, 30_000);
});
