import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { confirmAssemblyPickTask } from "@/lib/assembly/picking-service";
import { reserveInventoryInTx } from "@/lib/assembly/work-order-service";

const describePostgres = process.env.RUN_POSTGRES_TESTS === "1" ? describe : describe.skip;

let prisma: PrismaClient;

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

function gateModelFind<T extends object, K extends string>(
  model: T,
  method: K,
  wait: () => Promise<void>,
) {
  return new Proxy(model, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (property !== method || typeof value !== "function") return value;
      return async (...args: unknown[]) => {
        const result = await value.apply(target, args);
        await wait();
        return result;
      };
    },
  });
}

function gateTransactionModel(
  tx: Prisma.TransactionClient,
  modelName: "inventory" | "pickTask",
  wait: () => Promise<void>,
) {
  const gatedModel = gateModelFind(tx[modelName], "findUnique", wait);
  return new Proxy(tx, {
    get(target, property, receiver) {
      if (property === modelName) return gatedModel;
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as Prisma.TransactionClient;
}

function prismaWithGatedTaskRead(wait: () => Promise<void>) {
  return {
    $transaction: (run: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: { timeout?: number }) =>
      prisma.$transaction((tx) => run(gateTransactionModel(tx, "pickTask", wait)), options),
  } as unknown as PrismaClient;
}

async function createInventoryFixture() {
  const token = randomUUID().slice(0, 8).toUpperCase();
  const warehouse = await prisma.warehouse.create({
    data: { code: "CAS-WH-" + token, name: "CAS warehouse " + token },
  });
  const location = await prisma.location.create({
    data: {
      code: "CAS-LOC-" + token,
      name: "CAS location " + token,
      usageType: "STORAGE",
      warehouseId: warehouse.id,
    },
  });
  const product = await prisma.product.create({
    data: { sku: "CAS-SKU-" + token, name: "CAS product " + token, type: "ACCESSORY" },
  });
  const inventory = await prisma.inventory.create({
    data: { productId: product.id, locationId: location.id, quantity: 5, reserved: 0, available: 5 },
  });
  return { token, warehouse, location, product, inventory };
}

async function createPickFixture(taskCount: 1 | 2) {
  const token = randomUUID().slice(0, 8).toUpperCase();
  const warehouse = await prisma.warehouse.create({
    data: { code: "PICK-WH-" + token, name: "Pick warehouse " + token },
  });
  const [storage, wip] = await Promise.all([
    prisma.location.create({
      data: { code: "PICK-STO-" + token, name: "Pick storage " + token, usageType: "STORAGE", warehouseId: warehouse.id },
    }),
    prisma.location.create({
      data: { code: "PICK-WIP-" + token, name: "Pick WIP " + token, usageType: "WIP", warehouseId: warehouse.id },
    }),
  ]);
  const productionOrder = await prisma.productionOrder.create({
    data: {
      code: "CAS-ENS-" + token,
      kind: "ASSEMBLY_3PIECE",
      status: "EN_PROCESO",
      warehouseId: warehouse.id,
    },
  });
  const workOrder = await prisma.assemblyWorkOrder.create({
    data: {
      productionOrderId: productionOrder.id,
      warehouseId: warehouse.id,
      wipLocationId: wip.id,
      reservationStatus: "RESERVED",
      pickStatus: "RELEASED",
    },
  });
  const pickList = await prisma.pickList.create({
    data: { code: "CAS-PK-" + token, assemblyWorkOrderId: workOrder.id, status: "RELEASED" },
  });

  const rows = [];
  for (let index = 0; index < taskCount; index += 1) {
    const product = await prisma.product.create({
      data: {
        sku: "CAS-PROD-" + token + "-" + index,
        name: "CAS component " + token + " " + index,
        type: "ACCESSORY",
      },
    });
    const line = await prisma.assemblyWorkOrderLine.create({
      data: {
        assemblyWorkOrderId: workOrder.id,
        componentRole: index === 0 ? "ENTRY_FITTING" : "HOSE",
        productId: product.id,
        requiredQty: 4,
        reservedQty: 4,
        perAssemblyQty: 4,
        reservationStatus: "RESERVED",
      },
    });
    const inventory = await prisma.inventory.create({
      data: { productId: product.id, locationId: storage.id, quantity: 5, reserved: 4, available: 1 },
    });
    const task = await prisma.pickTask.create({
      data: {
        pickListId: pickList.id,
        assemblyWorkOrderLineId: line.id,
        sourceLocationId: storage.id,
        targetWipLocationId: wip.id,
        sequence: index + 1,
        requestedQty: 4,
        reservedQty: 4,
        status: "PENDING",
      },
    });
    rows.push({ product, line, inventory, task });
  }

  return { token, warehouse, storage, wip, productionOrder, workOrder, pickList, rows };
}

beforeAll(async () => {
  prisma = new PrismaClient();
  await prisma.$connect();
}, 60_000);

afterAll(async () => {
  await prisma.$disconnect();
}, 60_000);

describePostgres("assembly inventory concurrency (PostgreSQL)", () => {
  it("allows only one reservation from two transactions that read the same stock snapshot", async () => {
    const fixture = await createInventoryFixture();
    const waitForBothReads = createBarrier(2);
    const attempts = await Promise.allSettled([1, 2].map(() =>
      prisma.$transaction((tx) => reserveInventoryInTx({
        tx: gateTransactionModel(tx, "inventory", waitForBothReads),
        productId: fixture.product.id,
        locationId: fixture.location.id,
        qty: 4,
        reference: "CAS-" + fixture.token,
        documentType: "ASSEMBLY_ORDER",
        documentId: "CAS-" + fixture.token,
        documentLineId: "CAS-LINE-" + fixture.token,
      })),
    ));

    expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((result) => result.status === "rejected")).toHaveLength(1);
    const rejected = attempts.find((result) => result.status === "rejected");
    expect(rejected?.status === "rejected" ? rejected.reason : null)
      .toMatchObject({ code: "CONCURRENT_MODIFICATION" });
    const [inventory, movementCount] = await Promise.all([
      prisma.inventory.findUniqueOrThrow({ where: { id: fixture.inventory.id } }),
      prisma.inventoryMovement.count({ where: { documentId: "CAS-" + fixture.token, documentType: "ASSEMBLY_ORDER" } }),
    ]);
    expect(inventory).toMatchObject({ quantity: 5, reserved: 4, available: 1 });
    expect(movementCount).toBe(1);
  }, 30_000);

  it("commits one pick and one transfer when two requests confirm the same task", async () => {
    const fixture = await createPickFixture(1);
    const task = fixture.rows[0].task;
    const waitForBothReads = createBarrier(2);

    const attempts = await Promise.allSettled([
      confirmAssemblyPickTask(prismaWithGatedTaskRead(waitForBothReads), { taskId: task.id, pickedQty: 4 }),
      confirmAssemblyPickTask(prismaWithGatedTaskRead(waitForBothReads), { taskId: task.id, pickedQty: 4 }),
    ]);
    expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((result) => result.status === "rejected")).toHaveLength(1);
    const rejected = attempts.find((result) => result.status === "rejected");
    expect(rejected?.status === "rejected" ? rejected.reason : null)
      .toMatchObject({ code: "CONCURRENT_PICK_CONFIRMATION" });

    const [inventory, wipInventory, persistedTask, line, pickList, workOrder, movements] = await Promise.all([
      prisma.inventory.findUniqueOrThrow({ where: { id: fixture.rows[0].inventory.id } }),
      prisma.inventory.findUniqueOrThrow({ where: { productId_locationId: { productId: fixture.rows[0].product.id, locationId: fixture.wip.id } } }),
      prisma.pickTask.findUniqueOrThrow({ where: { id: task.id } }),
      prisma.assemblyWorkOrderLine.findUniqueOrThrow({ where: { id: fixture.rows[0].line.id } }),
      prisma.pickList.findUniqueOrThrow({ where: { id: fixture.pickList.id } }),
      prisma.assemblyWorkOrder.findUniqueOrThrow({ where: { id: fixture.workOrder.id } }),
      prisma.inventoryMovement.findMany({ where: { documentId: fixture.productionOrder.id, type: "TRANSFER" } }),
    ]);
    expect(inventory).toMatchObject({ quantity: 1, reserved: 0, available: 1 });
    expect(wipInventory).toMatchObject({ quantity: 4, reserved: 0, available: 4 });
    expect(persistedTask).toMatchObject({ pickedQty: 4, shortQty: 0, status: "COMPLETED" });
    expect(line).toMatchObject({ pickedQty: 4, wipQty: 4, shortQty: 0, pickStatus: "COMPLETED", wipStatus: "IN_WIP" });
    expect(pickList).toMatchObject({ status: "COMPLETED" });
    expect(workOrder).toMatchObject({ pickStatus: "COMPLETED", wipStatus: "IN_WIP" });
    expect(workOrder.updatedAt.getTime()).toBeGreaterThan(fixture.workOrder.updatedAt.getTime());
    expect(movements).toHaveLength(1);
  }, 45_000);

  it("serializes different task confirmations in one work order and preserves aggregate state", async () => {
    const fixture = await createPickFixture(2);
    const waitForBothReads = createBarrier(2);
    const db = prismaWithGatedTaskRead(waitForBothReads);

    const attempts = await Promise.allSettled(fixture.rows.map(({ task }) =>
      confirmAssemblyPickTask(db, { taskId: task.id, pickedQty: 4 }),
    ));
    expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((result) => result.status === "rejected")).toHaveLength(1);
    const rejected = attempts.find((result) => result.status === "rejected");
    expect(rejected?.status === "rejected" ? rejected.reason : null)
      .toMatchObject({ code: "CONCURRENT_PICK_CONFIRMATION" });

    const [tasks, lines, inventories, pickList, workOrder, movements] = await Promise.all([
      prisma.pickTask.findMany({ where: { pickListId: fixture.pickList.id }, orderBy: { sequence: "asc" } }),
      prisma.assemblyWorkOrderLine.findMany({ where: { assemblyWorkOrderId: fixture.workOrder.id }, orderBy: { createdAt: "asc" } }),
      prisma.inventory.findMany({ where: { locationId: fixture.storage.id, productId: { in: fixture.rows.map((row) => row.product.id) } } }),
      prisma.pickList.findUniqueOrThrow({ where: { id: fixture.pickList.id } }),
      prisma.assemblyWorkOrder.findUniqueOrThrow({ where: { id: fixture.workOrder.id } }),
      prisma.inventoryMovement.findMany({ where: { documentId: fixture.productionOrder.id, type: "TRANSFER" } }),
    ]);

    expect(tasks.filter((row) => row.status === "COMPLETED")).toHaveLength(1);
    expect(tasks.filter((row) => row.status === "PENDING")).toHaveLength(1);
    expect(lines.filter((row) => row.pickedQty === 4 && row.wipQty === 4)).toHaveLength(1);
    expect(lines.filter((row) => row.pickedQty === 0 && row.wipQty === 0)).toHaveLength(1);
    expect(inventories.filter((row) => row.quantity === 1 && row.reserved === 0 && row.available === 1)).toHaveLength(1);
    expect(inventories.filter((row) => row.quantity === 5 && row.reserved === 4 && row.available === 1)).toHaveLength(1);
    expect(pickList.status).toBe("IN_PROGRESS");
    expect(workOrder).toMatchObject({ pickStatus: "IN_PROGRESS", wipStatus: "PARTIAL" });
    expect(workOrder.updatedAt.getTime()).toBeGreaterThan(fixture.workOrder.updatedAt.getTime());
    expect(movements).toHaveLength(1);
  }, 45_000);
});
