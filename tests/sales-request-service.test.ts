import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { InventoryService } from "@/lib/inventory-service";
import { releaseAssemblyPickList } from "@/lib/assembly/picking-service";
import { buildSalesRequestVisibilityWhere } from "@/lib/sales/visibility";
import {
  addSalesRequestProductLine,
  confirmSalesRequestOrder,
  confirmSalesRequestPickTasksBatch,
  createSalesRequestDraftHeader,
  markSalesRequestDelivered,
  pullSalesRequestOrder,
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

async function ensureRole(code: string) {
  return prisma.role.upsert({
    where: { code },
    update: { isActive: true, name: code },
    create: { code, name: code, isActive: true },
    select: { id: true },
  });
}

async function createUserWithRole(args: { email: string; name: string; roleCode: "MANAGER" | "SALES_EXECUTIVE" }) {
  const role = await ensureRole(args.roleCode);
  const user = await prisma.user.upsert({
    where: { email: args.email },
    update: {
      name: args.name,
      isActive: true,
      userRoles: {
        deleteMany: {},
        create: [{ roleId: role.id }],
      },
    },
    create: {
      email: args.email,
      name: args.name,
      passwordHash: "test-hash",
      isActive: true,
      userRoles: { create: [{ roleId: role.id }] },
    },
    select: { id: true, email: true, name: true },
  });
  return user;
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

  it("filters orders by customer and visibility for sales executive", async () => {
    const manager = await createUserWithRole({
      email: "manager-visibility@scmayher.com",
      name: "Manager Visibility",
      roleCode: "MANAGER",
    });
    const salesA = await createUserWithRole({
      email: "sales-a-visibility@scmayher.com",
      name: "Sales A Visibility",
      roleCode: "SALES_EXECUTIVE",
    });

    const { warehouse } = await createRequestFixture();
    const ownOrder = await createSalesRequestDraftHeader(prisma, {
      customerName: "ACME INDUSTRIAL",
      warehouseId: warehouse.id,
      dueDate: new Date("2026-04-30T00:00:00.000Z"),
      requestedByUserId: salesA.id,
      requestedByRoles: ["SALES_EXECUTIVE"],
    });
    await createSalesRequestDraftHeader(prisma, {
      customerName: "BETA SERVICES",
      warehouseId: warehouse.id,
      dueDate: new Date("2026-04-30T00:00:00.000Z"),
      requestedByUserId: manager.id,
      requestedByRoles: ["MANAGER"],
    });

    const visibleWhere = buildSalesRequestVisibilityWhere({
      roles: ["SALES_EXECUTIVE"],
      userId: salesA.id,
      baseWhere: { customerName: { contains: "ACME" } },
    });

    const visibleOrders = await prisma.salesInternalOrder.findMany({
      where: visibleWhere,
      select: { id: true, customerName: true },
    });

    expect(visibleOrders).toHaveLength(1);
    expect(visibleOrders[0]?.id).toBe(ownOrder.id);
    expect(visibleOrders[0]?.customerName).toBe("ACME INDUSTRIAL");
  });

  it("allows sales executive to pull an unassigned manager order", async () => {
    const manager = await createUserWithRole({
      email: "manager-pull@scmayher.com",
      name: "Manager Pull",
      roleCode: "MANAGER",
    });
    const sales = await createUserWithRole({
      email: "sales-pull@scmayher.com",
      name: "Sales Pull",
      roleCode: "SALES_EXECUTIVE",
    });
    const { warehouse } = await createRequestFixture();

    const order = await createSalesRequestDraftHeader(prisma, {
      customerName: "Cliente Pull",
      warehouseId: warehouse.id,
      dueDate: new Date("2026-05-01T00:00:00.000Z"),
      requestedByUserId: manager.id,
      requestedByRoles: ["MANAGER"],
    });

    await pullSalesRequestOrder(prisma, {
      orderId: order.id,
      assignedToUserId: sales.id,
    });

    const pulled = await prisma.salesInternalOrder.findUnique({
      where: { id: order.id },
      select: { assignedToUserId: true, assignedAt: true, pulledAt: true },
    });

    expect(pulled?.assignedToUserId).toBe(sales.id);
    expect(pulled?.assignedAt).toBeTruthy();
    expect(pulled?.pulledAt).toBeTruthy();
  });

  it("hides orders assigned to another sales executive", async () => {
    const manager = await createUserWithRole({
      email: "manager-hide@scmayher.com",
      name: "Manager Hide",
      roleCode: "MANAGER",
    });
    const salesA = await createUserWithRole({
      email: "sales-a-hide@scmayher.com",
      name: "Sales A Hide",
      roleCode: "SALES_EXECUTIVE",
    });
    const salesB = await createUserWithRole({
      email: "sales-b-hide@scmayher.com",
      name: "Sales B Hide",
      roleCode: "SALES_EXECUTIVE",
    });
    const { warehouse } = await createRequestFixture();

    const order = await createSalesRequestDraftHeader(prisma, {
      customerName: "Cliente Oculto",
      warehouseId: warehouse.id,
      dueDate: new Date("2026-05-01T00:00:00.000Z"),
      requestedByUserId: manager.id,
      requestedByRoles: ["MANAGER"],
    });

    await pullSalesRequestOrder(prisma, {
      orderId: order.id,
      assignedToUserId: salesA.id,
    });

    const visibleWhereSalesB = buildSalesRequestVisibilityWhere({
      roles: ["SALES_EXECUTIVE"],
      userId: salesB.id,
      baseWhere: { id: order.id },
    });

    const visibleForSalesB = await prisma.salesInternalOrder.findMany({
      where: visibleWhereSalesB,
      select: { id: true },
    });

    expect(visibleForSalesB).toHaveLength(0);
  });

  it("allows releasing assembly pick list when source sales order is confirmed", async () => {
    const { warehouse, staging, productA } = await createRequestFixture();
    const source = await createSalesRequestDraftHeader(prisma, {
      customerName: "Cliente Ensamble",
      warehouseId: warehouse.id,
      dueDate: new Date("2026-05-05T00:00:00.000Z"),
    });
    await addSalesRequestProductLine(prisma, {
      orderId: source.id,
      productId: productA.id,
      requestedQty: 1,
    });
    await confirmSalesRequestOrder(prisma, { orderId: source.id });

    const production = await prisma.productionOrder.create({
      data: {
        code: "SOE-TEST-RELEASE-01",
        kind: "ASSEMBLY_3PIECE",
        status: "ABIERTA",
        warehouseId: warehouse.id,
        sourceDocumentType: "SalesInternalOrder",
        sourceDocumentId: source.id,
      },
      select: { id: true },
    });

    const workOrder = await prisma.assemblyWorkOrder.create({
      data: {
        productionOrderId: production.id,
        warehouseId: warehouse.id,
        wipLocationId: staging.id,
      },
      select: { id: true },
    });

    const pickList = await prisma.pickList.create({
      data: {
        code: "PK-ASM-REL-01",
        assemblyWorkOrderId: workOrder.id,
        status: "DRAFT",
      },
      select: { id: true },
    });

    await releaseAssemblyPickList(prisma, production.id);

    const releasedPickList = await prisma.pickList.findUnique({
      where: { id: pickList.id },
      select: { status: true },
    });

    expect(releasedPickList?.status).toBe("RELEASED");
  });

  it("rejects delivered mark before direct pick is completed", async () => {
    const { order, productA } = await createRequestFixture();
    const sales = await createUserWithRole({
      email: "sales-deliver-block@scmayher.com",
      name: "Sales Deliver Block",
      roleCode: "SALES_EXECUTIVE",
    });

    await addSalesRequestProductLine(prisma, {
      orderId: order.id,
      productId: productA.id,
      requestedQty: 4,
      notes: "Entrega no permitida",
    });

    await confirmSalesRequestOrder(prisma, { orderId: order.id });
    await releaseSalesRequestPickList(prisma, order.id);

    await expect(
      markSalesRequestDelivered(prisma, {
        orderId: order.id,
        deliveredByUserId: sales.id,
      })
    ).rejects.toMatchObject({ code: "INVALID_ORDER_STATE" });
  });

  it("marks order delivered when direct fulfillment is completed", async () => {
    const { order, productA } = await createRequestFixture();
    const sales = await createUserWithRole({
      email: "sales-deliver-ok@scmayher.com",
      name: "Sales Deliver OK",
      roleCode: "SALES_EXECUTIVE",
    });

    await addSalesRequestProductLine(prisma, {
      orderId: order.id,
      productId: productA.id,
      requestedQty: 4,
      notes: "Entrega permitida",
    });

    await confirmSalesRequestOrder(prisma, { orderId: order.id });
    await releaseSalesRequestPickList(prisma, order.id);

    const pickList = await prisma.salesInternalOrderPickList.findFirst({
      where: { orderId: order.id },
      include: { tasks: true },
    });
    expect(pickList?.tasks.length).toBe(1);

    await confirmSalesRequestPickTasksBatch(prisma, {
      orderId: order.id,
      operatorName: "Operador entrega",
      tasks: [{ taskId: pickList!.tasks[0].id, pickedQty: 4 }],
    });

    await markSalesRequestDelivered(prisma, {
      orderId: order.id,
      deliveredByUserId: sales.id,
    });

    const delivered = await prisma.salesInternalOrder.findUnique({
      where: { id: order.id },
      select: { deliveredToCustomerAt: true, deliveredByUserId: true },
    });

    expect(delivered?.deliveredToCustomerAt).toBeTruthy();
    expect(delivered?.deliveredByUserId).toBe(sales.id);
  });
});
