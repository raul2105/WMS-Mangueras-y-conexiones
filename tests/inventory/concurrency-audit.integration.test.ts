import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { InventoryService, InventoryServiceError } from "@/lib/inventory-service";
import { lockAndAssertActiveInventoryLocations } from "@/lib/inventory-active-location";

const describePostgres = process.env.RUN_POSTGRES_TESTS === "1" ? describe : describe.skip;
let prisma: PrismaClient;

function barrier(parties: number) {
  let arrived = 0;
  let release!: () => void;
  const opened = new Promise<void>((resolve) => { release = resolve; });
  return async () => { arrived += 1; if (arrived === parties) release(); await opened; };
}

function gatedTx(tx: Prisma.TransactionClient, wait: () => Promise<void>) {
  let firstRead = true;
  const inventory = new Proxy(tx.inventory, {
    get(target, property, receiver) {
      const method = Reflect.get(target, property, receiver);
      if (property !== "findUnique" || typeof method !== "function") return method;
      return async (...args: Parameters<typeof method>) => {
        const value = await method.apply(target, args);
        if (firstRead) { firstRead = false; await wait(); }
        return value;
      };
    },
  });
  return new Proxy(tx, {
    get(target, property, receiver) {
      if (property === "inventory") return inventory;
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as Prisma.TransactionClient;
}

function gatedPrisma(wait: () => Promise<void>) {
  return {
    $transaction: (run: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel }) =>
      prisma.$transaction((tx) => run(gatedTx(tx, wait)), options),
  } as unknown as PrismaClient;
}

function failingAuditPrisma() {
  return {
    $transaction: (run: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel }) =>
      prisma.$transaction((tx) => {
        const auditLog = new Proxy(tx.auditLog, {
          get(target, property, receiver) {
            if (property === "create") return async () => { throw new Error("audit unavailable"); };
            const value = Reflect.get(target, property, receiver);
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
        return run(new Proxy(tx, {
          get(target, property, receiver) {
            if (property === "auditLog") return auditLog;
            const value = Reflect.get(target, property, receiver);
            return typeof value === "function" ? value.bind(target) : value;
          },
        }) as Prisma.TransactionClient);
      }, options),
  } as unknown as PrismaClient;
}

async function fixture(options: { seed?: boolean; quantity?: number; reserved?: number; destination?: boolean } = {}) {
  const token = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
  const warehouse = await prisma.warehouse.create({ data: { code: `IC-WH-${token}`, name: `Inventory CAS ${token}` } });
  const [source, destination] = await Promise.all([
    prisma.location.create({ data: { code: `IC-S-${token}`, name: "CAS origin", usageType: "STORAGE", warehouseId: warehouse.id } }),
    prisma.location.create({ data: { code: `IC-D-${token}`, name: "CAS destination", usageType: "STORAGE", warehouseId: warehouse.id } }),
  ]);
  const product = await prisma.product.create({ data: { sku: `IC-SKU-${token}`, name: "Inventory CAS product", type: "ACCESSORY" } });
  const quantity = options.quantity ?? 5;
  const reserved = options.reserved ?? 0;
  const sourceInventory = options.seed === false ? null : await prisma.inventory.create({
    data: { productId: product.id, locationId: source.id, quantity, reserved, available: quantity - reserved },
  });
  if (options.destination) {
    await prisma.inventory.create({ data: { productId: product.id, locationId: destination.id, quantity: 0, reserved: 0, available: 0 } });
  }
  const user = await prisma.user.create({
    data: { email: `inventory-cas-${token.toLowerCase()}@example.invalid`, name: `Inventory Operator ${token}`, passwordHash: "unused-in-test" },
  });
  return { token, warehouse, source, destination, product, sourceInventory, user };
}

async function cleanup(input: Awaited<ReturnType<typeof fixture>>) {
  const ids = [
    `${input.product.id}:${input.source.id}`,
    `${input.product.id}:${input.destination.id}`,
    `${input.product.id}:${input.source.id}->${input.destination.id}`,
  ];
  await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
  await prisma.syncEvent.deleteMany({ where: { entityId: { in: ids } } });
  await prisma.inventoryMovement.deleteMany({ where: { productId: input.product.id } });
  await prisma.inventory.deleteMany({ where: { productId: input.product.id } });
  await prisma.user.delete({ where: { id: input.user.id } });
  await prisma.product.delete({ where: { id: input.product.id } });
  await prisma.location.deleteMany({ where: { id: { in: [input.source.id, input.destination.id] } } });
  await prisma.warehouse.delete({ where: { id: input.warehouse.id } });
}

function auditActor(input: Awaited<ReturnType<typeof fixture>>) {
  return { actor: input.user.name ?? input.user.email, actorUserId: input.user.id, operatorName: input.user.name, operatorUserId: input.user.id };
}

async function expectOneCasWinner(work: (client: PrismaClient) => Promise<unknown>) {
  const wait = barrier(2);
  const client = gatedPrisma(wait);
  const results = await Promise.allSettled([work(client), work(client)]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  const rejection = results.find((result) => result.status === "rejected");
  expect(rejection?.status === "rejected" ? rejection.reason : null).toBeInstanceOf(InventoryServiceError);
  expect(rejection?.status === "rejected" ? rejection.reason.code : null).toBe("CONCURRENT_MODIFICATION");
}

beforeAll(async () => { prisma = new PrismaClient(); await prisma.$connect(); }, 60_000);
afterAll(async () => { await prisma.$disconnect(); }, 60_000);

describePostgres("inventory concurrency, CAS and audit atomicity (PostgreSQL)", () => {
  it("rejects receive into inactive locations or warehouses without changing stock or audit", async () => {
    for (const inactiveTarget of ["location", "warehouse"] as const) {
      const input = await fixture();
      try {
        if (inactiveTarget === "location") {
          await prisma.location.update({ where: { id: input.source.id }, data: { isActive: false } });
        } else {
          await prisma.warehouse.update({ where: { id: input.warehouse.id }, data: { isActive: false } });
        }

        const inactiveCode = inactiveTarget === "location" ? "LOCATION_INACTIVE" : "WAREHOUSE_INACTIVE";
        await expect(prisma.$transaction(async (tx) => {
          await lockAndAssertActiveInventoryLocations(tx, [input.source.id]);
          await new InventoryService(prisma).receiveStock(input.product.id, input.source.id, 2, input.token, {
            ...auditActor(input),
            tx,
          });
        })).rejects.toMatchObject({ code: inactiveCode });

        expect(await prisma.inventory.findUniqueOrThrow({
          where: { productId_locationId: { productId: input.product.id, locationId: input.source.id } },
        })).toMatchObject({ quantity: 5, reserved: 0, available: 5 });
        expect(await prisma.inventoryMovement.count({ where: { productId: input.product.id } })).toBe(0);
        expect(await prisma.auditLog.count({ where: { actorUserId: input.user.id } })).toBe(0);
      } finally { await cleanup(input); }
    }
  }, 30_000);

  it("serializes concurrent receives and preserves before/after actor evidence", async () => {
    const input = await fixture();
    try {
      const wait = barrier(2);
      const client = new InventoryService(gatedPrisma(wait));
      const results = await Promise.allSettled([1, 2].map(() => client.receiveStock(input.product.id, input.source.id, 4, input.token, auditActor(input))));
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
      expect(rejected.reason.code).toBe("CONCURRENT_MODIFICATION");
      expect(await prisma.inventory.findUniqueOrThrow({ where: { productId_locationId: { productId: input.product.id, locationId: input.source.id } } }))
        .toMatchObject({ quantity: 9, reserved: 0, available: 9 });
      expect(await prisma.inventoryMovement.count({ where: { productId: input.product.id, type: "IN" } })).toBe(1);
      const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: `${input.product.id}:${input.source.id}`, action: "RECEIVE_STOCK" } });
      expect(audit.actorUserId).toBe(input.user.id);
      expect(audit.before).toContain('"quantity":5');
      expect(audit.after).toContain('"quantity":9');
    } finally { await cleanup(input); }
  }, 30_000);

  it("maps concurrent creation of a missing inventory row to one domain conflict", async () => {
    const input = await fixture({ seed: false });
    try {
      await expectOneCasWinner((client) => new InventoryService(client).receiveStock(input.product.id, input.source.id, 4, input.token, auditActor(input)));
      expect(await prisma.inventory.findMany({ where: { productId: input.product.id, locationId: input.source.id } })).toMatchObject([{ quantity: 4, available: 4 }]);
      expect(await prisma.inventoryMovement.count({ where: { productId: input.product.id, type: "IN" } })).toBe(1);
    } finally { await cleanup(input); }
  }, 30_000);

  it("prevents stale pick and adjustment snapshots from overwriting each other", async () => {
    const pick = await fixture();
    try {
      await expectOneCasWinner((client) => new InventoryService(client).pickStock(pick.product.id, pick.source.id, 4, pick.token, auditActor(pick)));
      expect(await prisma.inventory.findUniqueOrThrow({ where: { productId_locationId: { productId: pick.product.id, locationId: pick.source.id } } }))
        .toMatchObject({ quantity: 1, available: 1 });
      expect(await prisma.inventoryMovement.count({ where: { productId: pick.product.id, type: "OUT" } })).toBe(1);
    } finally { await cleanup(pick); }

    const adjustment = await fixture();
    try {
      await expectOneCasWinner((client) => new InventoryService(client).adjustStock(adjustment.product.id, adjustment.source.id, 4, "CAS concurrente", auditActor(adjustment)));
      expect(await prisma.inventory.findUniqueOrThrow({ where: { productId_locationId: { productId: adjustment.product.id, locationId: adjustment.source.id } } }))
        .toMatchObject({ quantity: 9, available: 9 });
      expect(await prisma.inventoryMovement.count({ where: { productId: adjustment.product.id, type: "ADJUSTMENT" } })).toBe(1);
    } finally { await cleanup(adjustment); }
  }, 30_000);

  it("prevents competing transfers, reservations, releases, reserved moves and consumption", async () => {
    const input = await fixture({ destination: true });
    try {
      await expectOneCasWinner((client) => new InventoryService(client).transferStock(input.product.id, input.source.id, input.destination.id, 4, input.token, auditActor(input)));
      expect(await prisma.inventory.findUniqueOrThrow({ where: { productId_locationId: { productId: input.product.id, locationId: input.source.id } } })).toMatchObject({ quantity: 1 });
      expect(await prisma.inventory.findUniqueOrThrow({ where: { productId_locationId: { productId: input.product.id, locationId: input.destination.id } } })).toMatchObject({ quantity: 4 });
      const transfer = await prisma.inventoryMovement.findFirstOrThrow({ where: { productId: input.product.id, type: "TRANSFER" } });
      expect(transfer.operatorUserId).toBe(input.user.id);
      const transferAudit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: `${input.product.id}:${input.source.id}->${input.destination.id}`, action: "TRANSFER_STOCK" } });
      expect(transferAudit.actorUserId).toBe(input.user.id);
      expect(transferAudit.before).toContain('"from"');
      expect(transferAudit.after).toContain('"to"');
      await prisma.inventory.update({ where: { id: input.sourceInventory!.id }, data: { quantity: 5, available: 5 } });
      await expectOneCasWinner((client) => new InventoryService(client).reserveStock(input.product.id, input.source.id, 4, auditActor(input)));
      await prisma.inventory.update({ where: { id: input.sourceInventory!.id }, data: { reserved: 5, available: 0 } });
      await expectOneCasWinner((client) => new InventoryService(client).releaseReservedStock(input.product.id, input.source.id, 4, auditActor(input)));
      await prisma.inventory.update({ where: { id: input.sourceInventory!.id }, data: { reserved: 5, available: 0 } });
      await expectOneCasWinner((client) => new InventoryService(client).moveReservedStockToLocation(input.product.id, input.source.id, input.destination.id, 4, auditActor(input)));
      await prisma.inventory.update({ where: { id: input.sourceInventory!.id }, data: { quantity: 5, reserved: 0, available: 5 } });
      await expectOneCasWinner((client) => new InventoryService(client).consumeFromLocation(input.product.id, input.source.id, 4, input.token, auditActor(input)));
    } finally { await cleanup(input); }
  }, 30_000);

  it("rolls back both transfer legs, movement and audit on audit or caller job failure", async () => {
    const input = await fixture({ destination: true });
    const service = new InventoryService(prisma);
    try {
      await expect(new InventoryService(failingAuditPrisma()).transferStock(input.product.id, input.source.id, input.destination.id, 2, input.token, auditActor(input)))
        .rejects.toThrow("audit unavailable");
      await expect(prisma.$transaction(async (tx) => {
        await service.transferStock(input.product.id, input.source.id, input.destination.id, 2, input.token, { ...auditActor(input), tx });
        throw new Error("label job failed");
      })).rejects.toThrow("label job failed");
      expect(await prisma.inventory.findUniqueOrThrow({ where: { productId_locationId: { productId: input.product.id, locationId: input.source.id } } })).toMatchObject({ quantity: 5, available: 5 });
      expect(await prisma.inventory.findUniqueOrThrow({ where: { productId_locationId: { productId: input.product.id, locationId: input.destination.id } } })).toMatchObject({ quantity: 0, available: 0 });
      expect(await prisma.inventoryMovement.count({ where: { productId: input.product.id, type: "TRANSFER" } })).toBe(0);
      expect(await prisma.auditLog.count({ where: { entityId: `${input.product.id}:${input.source.id}->${input.destination.id}`, action: "TRANSFER_STOCK" } })).toBe(0);
    } finally { await cleanup(input); }
  }, 30_000);
});
