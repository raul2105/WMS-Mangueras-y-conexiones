import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { changeSalesRequestCommitmentDate } from "@/lib/sales/request-service";

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

function prismaWithCommitmentClaimBarrier(wait: () => Promise<void>) {
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

async function createFixture(roleCode: "MANAGER" | "SYSTEM_ADMIN" | "WAREHOUSE_OPERATOR" = "MANAGER") {
  const token = randomUUID().replaceAll("-", "").slice(0, 12);
  const role = await prisma.role.upsert({
    where: { code: roleCode },
    update: { isActive: true, name: roleCode },
    create: { code: roleCode, name: roleCode, isActive: true },
    select: { id: true },
  });
  const actor = await prisma.user.create({
    data: {
      email: `commitment-${roleCode.toLowerCase()}-${token}@example.invalid`,
      name: `Commitment ${roleCode} ${token}`,
      passwordHash: "unused-in-integration-test",
      userRoles: { create: [{ roleId: role.id }] },
    },
    select: { id: true, name: true },
  });
  const originalDueDate = new Date("2026-11-10T00:00:00.000Z");
  const order = await prisma.salesInternalOrder.create({
    data: {
      code: `COMMIT-${token}`,
      status: "CONFIRMADA",
      dueDate: originalDueDate,
    },
    select: { id: true, code: true, dueDate: true },
  });
  return { actor, order, originalDueDate };
}

async function cleanupFixture(fixture: Awaited<ReturnType<typeof createFixture>>) {
  await prisma.auditLog.deleteMany({ where: { entityId: fixture.order.id } });
  await prisma.salesInternalOrder.deleteMany({ where: { id: fixture.order.id } });
  await prisma.userRole.deleteMany({ where: { userId: fixture.actor.id } });
  await prisma.user.deleteMany({ where: { id: fixture.actor.id } });
}

function changeInput(fixture: Awaited<ReturnType<typeof createFixture>>, dueDate: Date) {
  return {
    orderId: fixture.order.id,
    expectedDueDate: fixture.originalDueDate,
    dueDate,
    reason: "Cambio de disponibilidad confirmado con el cliente",
    auditActor: { actorUserId: fixture.actor.id, actor: fixture.actor.name },
  };
}

beforeAll(async () => {
  prisma = new PrismaClient();
  await prisma.$connect();
}, 60_000);

afterAll(async () => { await prisma.$disconnect(); }, 60_000);

describePostgres("sales commitment date change and audit (PostgreSQL)", () => {
  it("persists the manager actor and useful before/after/source/reason in one audit", async () => {
    const fixture = await createFixture();
    const dueDate = new Date("2026-11-18T00:00:00.000Z");
    try {
      await changeSalesRequestCommitmentDate(prisma, changeInput(fixture, dueDate));

      const [order, audit] = await Promise.all([
        prisma.salesInternalOrder.findUniqueOrThrow({ where: { id: fixture.order.id }, select: { dueDate: true } }),
        prisma.auditLog.findFirstOrThrow({ where: { entityId: fixture.order.id, action: "CHANGE_COMMITMENT_DATE" } }),
      ]);
      expect(order.dueDate).toEqual(dueDate);
      expect(audit).toMatchObject({
        entityType: "SALES_INTERNAL_ORDER",
        entityId: fixture.order.id,
        actorUserId: fixture.actor.id,
        actor: fixture.actor.name,
        source: "sales/request-service/commitment-date",
      });
      expect(JSON.parse(audit.before ?? "{}")).toEqual({ dueDate: fixture.originalDueDate.toISOString() });
      expect(JSON.parse(audit.after ?? "{}")).toEqual({
        dueDate: dueDate.toISOString(),
        reason: "Cambio de disponibilidad confirmado con el cliente",
      });
    } finally {
      await cleanupFixture(fixture);
    }
  });

  it("uses compare-and-set so two stale updates cannot overwrite or double-audit", async () => {
    const fixture = await createFixture();
    const wait = barrier(2);
    const txPrisma = prismaWithCommitmentClaimBarrier(wait);
    const candidates = [new Date("2026-11-18T00:00:00.000Z"), new Date("2026-11-20T00:00:00.000Z")];
    try {
      const results = await Promise.allSettled(candidates.map((dueDate) =>
        changeSalesRequestCommitmentDate(txPrisma, changeInput(fixture, dueDate)),
      ));

      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
      const finalOrder = await prisma.salesInternalOrder.findUniqueOrThrow({ where: { id: fixture.order.id }, select: { dueDate: true } });
      expect(candidates).toContainEqual(finalOrder.dueDate);
      expect(await prisma.auditLog.count({ where: { entityId: fixture.order.id, action: "CHANGE_COMMITMENT_DATE" } })).toBe(1);
    } finally {
      await cleanupFixture(fixture);
    }
  });

  it("rejects invalid dates, blank reasons, non-supervisor actors, cancelled and delivered orders without writes", async () => {
    const fixture = await createFixture();
    const dueDate = new Date("2026-11-18T00:00:00.000Z");
    try {
      await expect(changeSalesRequestCommitmentDate(prisma, { ...changeInput(fixture, new Date(Number.NaN)) }))
        .rejects.toMatchObject({ code: "INVALID_COMMITMENT_DATE" });
      await expect(changeSalesRequestCommitmentDate(prisma, { ...changeInput(fixture, dueDate), reason: "  " }))
        .rejects.toMatchObject({ code: "COMMITMENT_REASON_REQUIRED" });
      const nonSupervisor = await createFixture("WAREHOUSE_OPERATOR");
      try {
        await expect(changeSalesRequestCommitmentDate(prisma, changeInput(nonSupervisor, dueDate)))
          .rejects.toMatchObject({ code: "FORBIDDEN" });
      } finally {
        await cleanupFixture(nonSupervisor);
      }

      await prisma.salesInternalOrder.update({ where: { id: fixture.order.id }, data: { status: "CANCELADA" } });
      await expect(changeSalesRequestCommitmentDate(prisma, changeInput(fixture, dueDate)))
        .rejects.toMatchObject({ code: "INVALID_ORDER_STATE" });
      await prisma.salesInternalOrder.update({
        where: { id: fixture.order.id },
        data: { status: "CONFIRMADA", deliveredToCustomerAt: new Date("2026-11-12T18:00:00.000Z") },
      });
      await expect(changeSalesRequestCommitmentDate(prisma, changeInput(fixture, dueDate)))
        .rejects.toMatchObject({ code: "INVALID_ORDER_STATE" });
      expect(await prisma.auditLog.count({ where: { entityId: fixture.order.id, action: "CHANGE_COMMITMENT_DATE" } })).toBe(0);
      expect((await prisma.salesInternalOrder.findUniqueOrThrow({ where: { id: fixture.order.id }, select: { dueDate: true } })).dueDate)
        .toEqual(fixture.originalDueDate);
    } finally {
      await cleanupFixture(fixture);
    }
  });

  it("rolls back the due date when required audit persistence fails", async () => {
    const fixture = await createFixture();
    try {
      await expect(changeSalesRequestCommitmentDate(
        prismaWithFailingAudit(),
        changeInput(fixture, new Date("2026-11-18T00:00:00.000Z")),
      )).rejects.toThrow("audit unavailable");

      expect((await prisma.salesInternalOrder.findUniqueOrThrow({ where: { id: fixture.order.id }, select: { dueDate: true } })).dueDate)
        .toEqual(fixture.originalDueDate);
      expect(await prisma.auditLog.count({ where: { entityId: fixture.order.id, action: "CHANGE_COMMITMENT_DATE" } })).toBe(0);
    } finally {
      await cleanupFixture(fixture);
    }
  });
});
