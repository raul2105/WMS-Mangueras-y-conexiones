import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { InventoryService } from "@/lib/inventory-service";
import {
  addSalesRequestProductLine,
  confirmSalesRequestOrder,
  confirmSalesRequestPickTasksBatch,
  createSalesRequestDraftHeader,
  releaseSalesRequestPickList,
} from "@/lib/sales/request-service";

const TEST_DB_FILE = path.join(process.cwd(), "prisma", "sales-request-service.test.db");
const TEST_DB_SHM = `${TEST_DB_FILE}-shm`;
const TEST_DB_WAL = `${TEST_DB_FILE}-wal`;
const TEST_DB_URL = `file:${TEST_DB_FILE.replace(/\\/g, "/")}`;
const SOURCE_DB_FILE = path.join(process.cwd(), "prisma", "dev.db");

let prisma: PrismaClient;

async function resetDb() {
  await prisma.purchaseReceiptLine.deleteMany();
  await prisma.purchaseReceipt.deleteMany();
  await prisma.purchaseOrderLine.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.supplierProduct.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.salesInternalOrderPickTask.deleteMany();
  await prisma.salesInternalOrderPickList.deleteMany();
  await prisma.salesInternalOrderAssemblyConfig.deleteMany();
  await prisma.salesInternalOrderLine.deleteMany();
  await prisma.salesInternalOrder.deleteMany();
  await prisma.pickTask.deleteMany();
  await prisma.pickList.deleteMany();
  await prisma.assemblyWorkOrderLine.deleteMany();
  await prisma.assemblyWorkOrder.deleteMany();
  await prisma.assemblyConfiguration.deleteMany();
  await prisma.inventoryMovement.deleteMany();
  await prisma.productionOrderItem.deleteMany();
  await prisma.productionOrder.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.location.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
}

async function createRequestFixture() {
  const warehouse = await prisma.warehouse.create({
    data: {
      code: "SURT",
      name: "Surtido Test",
      isActive: true,
    },
  });

  const [storageA, storageB, staging] = await Promise.all([
    prisma.location.create({
      data: {
        code: "STO-SURT-01",
        name: "Storage 01",
        zone: "A",
        usageType: "STORAGE",
        isActive: true,
        warehouseId: warehouse.id,
      },
    }),
    prisma.location.create({
      data: {
        code: "STO-SURT-02",
        name: "Storage 02",
        zone: "B",
        usageType: "STORAGE",
        isActive: true,
        warehouseId: warehouse.id,
      },
    }),
    prisma.location.create({
      data: {
        code: "STAGING-SURT",
        name: "Staging surtido",
        zone: "STG",
        usageType: "STAGING",
        isActive: true,
        warehouseId: warehouse.id,
      },
    }),
  ]);

  const [productA, productB] = await Promise.all([
    prisma.product.create({
      data: {
        sku: "SKU-SURT-01",
        name: "Producto surtido 01",
        type: "ACCESSORY",
      },
    }),
    prisma.product.create({
      data: {
        sku: "SKU-SURT-02",
        name: "Producto surtido 02",
        type: "ACCESSORY",
      },
    }),
  ]);

  const inventoryService = new InventoryService(prisma);
  await inventoryService.receiveStock(productA.id, storageA.id, 10, "RCV-SURT-01");
  await inventoryService.receiveStock(productB.id, storageB.id, 8, "RCV-SURT-02");

  const order = await createSalesRequestDraftHeader(prisma, {
    customerName: "Cliente surtido",
    warehouseId: warehouse.id,
    dueDate: new Date("2026-04-30T00:00:00.000Z"),
    notes: "Pedido mixto de prueba",
  });

  return { warehouse, storageA, storageB, staging, productA, productB, order };
}

beforeAll(async () => {
  for (const file of [TEST_DB_FILE, TEST_DB_SHM, TEST_DB_WAL]) {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  }

  fs.copyFileSync(SOURCE_DB_FILE, TEST_DB_FILE);

  prisma = new PrismaClient({
    datasources: {
      db: {
        url: TEST_DB_URL,
      },
    },
  });
});

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await resetDb();
  await prisma.$disconnect();
  for (const file of [TEST_DB_FILE, TEST_DB_SHM, TEST_DB_WAL]) {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  }
});

describe("sales request service", () => {
  it("creates and rebuilds the direct draft pick list without double-reserving stock", async () => {
    const { order, productA, productB, storageA, storageB, staging } = await createRequestFixture();

    await addSalesRequestProductLine(prisma, {
      orderId: order.id,
      productId: productA.id,
      requestedQty: 4,
      notes: "Primer producto",
    });

    await addSalesRequestProductLine(prisma, {
      orderId: order.id,
      productId: productB.id,
      requestedQty: 3,
      notes: "Segundo producto",
    });

    const pickLists = await prisma.salesInternalOrderPickList.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: "asc" },
      include: {
        tasks: {
          orderBy: { sequence: "asc" },
          include: {
            sourceLocation: true,
            targetLocation: true,
            orderLine: { include: { product: true } },
          },
        },
      },
    });

    expect(pickLists).toHaveLength(1);
    expect(pickLists[0].status).toBe("DRAFT");
    expect(pickLists[0].targetLocationId).toBe(staging.id);
    expect(pickLists[0].tasks).toHaveLength(2);
    expect(pickLists[0].tasks.map((task) => task.sourceLocationId)).toEqual([storageA.id, storageB.id]);
    expect(pickLists[0].tasks.map((task) => task.targetLocationId)).toEqual([staging.id, staging.id]);
    expect(pickLists[0].tasks.map((task) => task.orderLine.product?.sku)).toEqual(["SKU-SURT-01", "SKU-SURT-02"]);

    const [inventoryA, inventoryB] = await Promise.all([
      prisma.inventory.findUnique({
        where: { productId_locationId: { productId: productA.id, locationId: storageA.id } },
      }),
      prisma.inventory.findUnique({
        where: { productId_locationId: { productId: productB.id, locationId: storageB.id } },
      }),
    ]);

    expect(inventoryA?.quantity).toBe(10);
    expect(inventoryA?.reserved).toBe(4);
    expect(inventoryA?.available).toBe(6);
    expect(inventoryB?.quantity).toBe(8);
    expect(inventoryB?.reserved).toBe(3);
    expect(inventoryB?.available).toBe(5);
  });

  it("releases reserved shortfall when a direct pick task is confirmed as partial", async () => {
    const { order, productA, storageA, staging } = await createRequestFixture();

    await addSalesRequestProductLine(prisma, {
      orderId: order.id,
      productId: productA.id,
      requestedQty: 4,
      notes: "Parcial",
    });

    await confirmSalesRequestOrder(prisma, { orderId: order.id });
    await releaseSalesRequestPickList(prisma, order.id);

    const pickList = await prisma.salesInternalOrderPickList.findFirst({
      where: { orderId: order.id },
      include: { tasks: true },
    });

    expect(pickList).toBeTruthy();
    expect(pickList?.status).toBe("RELEASED");
    expect(pickList?.tasks).toHaveLength(1);

    await confirmSalesRequestPickTasksBatch(prisma, {
      orderId: order.id,
      operatorName: "Operador surtido",
      tasks: [
        {
          taskId: pickList!.tasks[0].id,
          pickedQty: 2,
          shortReason: "FALTANTE_REAL",
        },
      ],
    });

    const [sourceInventory, targetInventory, taskAfter, pickListAfter] = await Promise.all([
      prisma.inventory.findUnique({
        where: { productId_locationId: { productId: productA.id, locationId: storageA.id } },
      }),
      prisma.inventory.findUnique({
        where: { productId_locationId: { productId: productA.id, locationId: staging.id } },
      }),
      prisma.salesInternalOrderPickTask.findUnique({
        where: { id: pickList!.tasks[0].id },
      }),
      prisma.salesInternalOrderPickList.findUnique({
        where: { id: pickList!.id },
      }),
    ]);

    expect(sourceInventory?.quantity).toBe(8);
    expect(sourceInventory?.reserved).toBe(0);
    expect(sourceInventory?.available).toBe(8);
    expect(targetInventory?.quantity).toBe(2);
    expect(targetInventory?.reserved).toBe(0);
    expect(targetInventory?.available).toBe(2);
    expect(taskAfter?.pickedQty).toBe(2);
    expect(taskAfter?.shortQty).toBe(2);
    expect(taskAfter?.status).toBe("PARTIAL");
    expect(pickListAfter?.status).toBe("PARTIAL");
  });
});
