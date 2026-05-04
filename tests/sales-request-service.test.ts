import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { InventoryService } from "@/lib/inventory-service";
import { confirmAssemblyPickTasksBatch, releaseAssemblyPickList } from "@/lib/assembly/picking-service";
import { closeAssemblyWorkOrderConsume } from "@/lib/assembly/work-order-service";
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

let prisma: PrismaClient;

async function resetDb() {
  await prisma.$executeRawUnsafe('DELETE FROM "SalesInternalOrderDeliveryLine"');
  await prisma.$executeRawUnsafe('DELETE FROM "SalesInternalOrderDelivery"');
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

async function createUserWithRole(args: { email: string; name: string; roleCode: "MANAGER" | "SALES_EXECUTIVE" | "WAREHOUSE_OPERATOR" }) {
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
  prisma = new PrismaClient();
});

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await resetDb();
  await prisma.$disconnect();
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

    const pullAudit = await prisma.auditLog.findFirst({
      where: {
        entityType: "SALES_INTERNAL_ORDER",
        entityId: order.id,
        action: "PULL_REQUEST",
      },
      orderBy: { createdAt: "desc" },
      select: { actorUserId: true, after: true },
    });

    expect(pullAudit?.actorUserId).toBe(sales.id);
    const afterPayload = pullAudit?.after ? JSON.parse(String(pullAudit.after)) : null;
    expect(afterPayload?.assignedToUserId).toBe(sales.id);
    expect(afterPayload?.assignedAt).toBeTruthy();
  });

  it("rejects pull when assignee is not SALES_EXECUTIVE", async () => {
    const manager = await createUserWithRole({
      email: "manager-no-sales-pull@scmayher.com",
      name: "Manager No Sales Pull",
      roleCode: "MANAGER",
    });
    const warehouseOperator = await createUserWithRole({
      email: "warehouse-no-sales-pull@scmayher.com",
      name: "Warehouse No Sales Pull",
      roleCode: "WAREHOUSE_OPERATOR",
    });
    const { warehouse } = await createRequestFixture();

    const order = await createSalesRequestDraftHeader(prisma, {
      customerName: "Cliente Pull Invalido",
      warehouseId: warehouse.id,
      dueDate: new Date("2026-05-01T00:00:00.000Z"),
      requestedByUserId: manager.id,
      requestedByRoles: ["MANAGER"],
    });

    await expect(
      pullSalesRequestOrder(prisma, {
        orderId: order.id,
        assignedToUserId: warehouseOperator.id,
      })
    ).rejects.toMatchObject({ code: "INVALID_ASSIGNEE" });
  });

  it("rejects double assignment when a second sales user tries to pull", async () => {
    const manager = await createUserWithRole({
      email: "manager-double-pull@scmayher.com",
      name: "Manager Double Pull",
      roleCode: "MANAGER",
    });
    const salesA = await createUserWithRole({
      email: "sales-a-double-pull@scmayher.com",
      name: "Sales A Double Pull",
      roleCode: "SALES_EXECUTIVE",
    });
    const salesB = await createUserWithRole({
      email: "sales-b-double-pull@scmayher.com",
      name: "Sales B Double Pull",
      roleCode: "SALES_EXECUTIVE",
    });
    const { warehouse } = await createRequestFixture();

    const order = await createSalesRequestDraftHeader(prisma, {
      customerName: "Cliente Doble Pull",
      warehouseId: warehouse.id,
      dueDate: new Date("2026-05-01T00:00:00.000Z"),
      requestedByUserId: manager.id,
      requestedByRoles: ["MANAGER"],
    });

    await pullSalesRequestOrder(prisma, {
      orderId: order.id,
      assignedToUserId: salesA.id,
    });

    await expect(
      pullSalesRequestOrder(prisma, {
        orderId: order.id,
        assignedToUserId: salesB.id,
      })
    ).rejects.toMatchObject({ code: "ORDER_ALREADY_ASSIGNED" });
  });

  it("rejects taking an already assigned order by the same actor", async () => {
    const manager = await createUserWithRole({
      email: "manager-repeat-pull@scmayher.com",
      name: "Manager Repeat Pull",
      roleCode: "MANAGER",
    });
    const sales = await createUserWithRole({
      email: "sales-repeat-pull@scmayher.com",
      name: "Sales Repeat Pull",
      roleCode: "SALES_EXECUTIVE",
    });
    const { warehouse } = await createRequestFixture();

    const order = await createSalesRequestDraftHeader(prisma, {
      customerName: "Cliente Repeat Pull",
      warehouseId: warehouse.id,
      dueDate: new Date("2026-05-01T00:00:00.000Z"),
      requestedByUserId: manager.id,
      requestedByRoles: ["MANAGER"],
    });

    await pullSalesRequestOrder(prisma, {
      orderId: order.id,
      assignedToUserId: sales.id,
    });

    await expect(
      pullSalesRequestOrder(prisma, {
        orderId: order.id,
        assignedToUserId: sales.id,
      })
    ).rejects.toMatchObject({ code: "ORDER_ALREADY_ASSIGNED" });
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

  it("does not expose unassigned orders created by non-manager to sales executive", async () => {
    const warehouseOperator = await createUserWithRole({
      email: "sales-source-no-manager@scmayher.com",
      name: "Sales Source No Manager",
      roleCode: "SALES_EXECUTIVE",
    });
    const sales = await createUserWithRole({
      email: "sales-visibility-no-manager@scmayher.com",
      name: "Sales Visibility No Manager",
      roleCode: "SALES_EXECUTIVE",
    });

    const { warehouse } = await createRequestFixture();
    const hiddenOrder = await createSalesRequestDraftHeader(prisma, {
      customerName: "Cliente No Manager",
      warehouseId: warehouse.id,
      dueDate: new Date("2026-05-02T00:00:00.000Z"),
      requestedByUserId: warehouseOperator.id,
      requestedByRoles: ["SALES_EXECUTIVE"],
    });

    const visibleWhere = buildSalesRequestVisibilityWhere({
      roles: ["SALES_EXECUTIVE"],
      userId: sales.id,
      baseWhere: { id: hiddenOrder.id },
    });

    const visibleForSales = await prisma.salesInternalOrder.findMany({
      where: visibleWhere,
      select: { id: true },
    });

    expect(visibleForSales).toHaveLength(0);
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

  it("rejects delivered mark when request was not pulled before fulfillment completion", async () => {
    const { order, productA } = await createRequestFixture();
    const sales = await createUserWithRole({
      email: "sales-deliver-no-pull@scmayher.com",
      name: "Sales Deliver No Pull",
      roleCode: "SALES_EXECUTIVE",
    });

    await addSalesRequestProductLine(prisma, {
      orderId: order.id,
      productId: productA.id,
      requestedQty: 2,
      notes: "Entrega sin toma previa",
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
      operatorName: "Operador sin toma previa",
      tasks: [{ taskId: pickList!.tasks[0].id, pickedQty: 2 }],
    });

    await expect(
      markSalesRequestDelivered(prisma, {
        orderId: order.id,
        deliveredByUserId: sales.id,
      }),
    ).rejects.toMatchObject({ code: "INVALID_ORDER_STATE" });
  });

  it("marks order delivered when direct fulfillment is completed", async () => {
    const manager = await createUserWithRole({
      email: "manager-deliver-ok@scmayher.com",
      name: "Manager Deliver OK",
      roleCode: "MANAGER",
    });
    const { warehouse, productA } = await createRequestFixture();
    const order = await createSalesRequestDraftHeader(prisma, {
      customerName: "Cliente Entrega OK",
      warehouseId: warehouse.id,
      dueDate: new Date("2026-05-03T00:00:00.000Z"),
      requestedByUserId: manager.id,
      requestedByRoles: ["MANAGER"],
    });
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

    await pullSalesRequestOrder(prisma, {
      orderId: order.id,
      assignedToUserId: sales.id,
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

    const deliveredAudit = await prisma.auditLog.findFirst({
      where: {
        entityType: "SALES_INTERNAL_ORDER",
        entityId: order.id,
        action: "MARK_DELIVERED_TO_CUSTOMER",
      },
      orderBy: { createdAt: "desc" },
      select: { actorUserId: true, after: true },
    });

    expect(deliveredAudit?.actorUserId).toBe(sales.id);
    const afterPayload = deliveredAudit?.after ? JSON.parse(String(deliveredAudit.after)) : null;
    expect(afterPayload?.deliveredByUserId).toBe(sales.id);
    expect(afterPayload?.deliveredToCustomerAt).toBeTruthy();
  });

  it("runs full operational flow: manager request -> sales pull -> direct pick + assembly -> delivered", async () => {
    const manager = await createUserWithRole({
      email: "manager-full-flow@scmayher.com",
      name: "Manager Full Flow",
      roleCode: "MANAGER",
    });
    const sales = await createUserWithRole({
      email: "sales-full-flow@scmayher.com",
      name: "Sales Full Flow",
      roleCode: "SALES_EXECUTIVE",
    });

    const { warehouse, storageA, staging, productA } = await createRequestFixture();
    const order = await createSalesRequestDraftHeader(prisma, {
      customerName: "Cliente Full Flow",
      warehouseId: warehouse.id,
      dueDate: new Date("2026-05-06T00:00:00.000Z"),
      requestedByUserId: manager.id,
      requestedByRoles: ["MANAGER"],
    });

    await addSalesRequestProductLine(prisma, {
      orderId: order.id,
      productId: productA.id,
      requestedQty: 1,
    });

    const assemblyLine = await prisma.salesInternalOrderLine.create({
      data: {
        orderId: order.id,
        lineKind: "CONFIGURED_ASSEMBLY",
        requestedQty: 1,
        notes: "Línea ensamble full flow",
      },
      select: { id: true },
    });

    const assemblyProduct = await prisma.product.create({
      data: {
        sku: "SKU-ASM-FLOW-01",
        name: "Componente Ensamble Full Flow",
        type: "FITTING",
      },
      select: { id: true },
    });

    await prisma.inventory.create({
      data: {
        productId: assemblyProduct.id,
        locationId: storageA.id,
        quantity: 1,
        reserved: 1,
        available: 0,
      },
    });

    const production = await prisma.productionOrder.create({
      data: {
        code: "SOE-FULL-FLOW-01",
        kind: "ASSEMBLY_3PIECE",
        status: "ABIERTA",
        warehouseId: warehouse.id,
        sourceDocumentType: "SalesInternalOrder",
        sourceDocumentId: order.id,
        sourceDocumentLineId: assemblyLine.id,
      },
      select: { id: true },
    });

    const workOrder = await prisma.assemblyWorkOrder.create({
      data: {
        productionOrderId: production.id,
        warehouseId: warehouse.id,
        wipLocationId: staging.id,
        reservationStatus: "RESERVED",
        pickStatus: "NOT_RELEASED",
        wipStatus: "NOT_IN_WIP",
        consumptionStatus: "NOT_CONSUMED",
        hasShortage: false,
      },
      select: { id: true },
    });

    const workOrderLine = await prisma.assemblyWorkOrderLine.create({
      data: {
        assemblyWorkOrderId: workOrder.id,
        componentRole: "ENTRY_FITTING",
        productId: assemblyProduct.id,
        unitLabel: "pieza",
        perAssemblyQty: 1,
        requiredQty: 1,
        reservedQty: 1,
        pickedQty: 0,
        wipQty: 0,
        consumedQty: 0,
        shortQty: 0,
        reservationStatus: "RESERVED",
        pickStatus: "NOT_RELEASED",
        wipStatus: "NOT_IN_WIP",
        consumptionStatus: "NOT_CONSUMED",
      },
      select: { id: true },
    });

    const assemblyPickList = await prisma.pickList.create({
      data: {
        code: "PK-ASM-FULL-FLOW-01",
        assemblyWorkOrderId: workOrder.id,
        status: "DRAFT",
      },
      select: { id: true },
    });

    await prisma.pickTask.create({
      data: {
        pickListId: assemblyPickList.id,
        assemblyWorkOrderLineId: workOrderLine.id,
        sourceLocationId: storageA.id,
        targetWipLocationId: staging.id,
        sequence: 1,
        requestedQty: 1,
        reservedQty: 1,
        pickedQty: 0,
        shortQty: 0,
        status: "PENDING",
      },
    });

    await pullSalesRequestOrder(prisma, {
      orderId: order.id,
      assignedToUserId: sales.id,
    });
    await confirmSalesRequestOrder(prisma, {
      orderId: order.id,
      confirmedByUserId: sales.id,
    });
    await releaseSalesRequestPickList(prisma, order.id);

    const directPickList = await prisma.salesInternalOrderPickList.findFirst({
      where: { orderId: order.id },
      include: { tasks: true },
    });
    expect(directPickList?.tasks.length).toBe(1);

    await confirmSalesRequestPickTasksBatch(prisma, {
      orderId: order.id,
      operatorName: "Operador Full Flow",
      tasks: [{ taskId: directPickList!.tasks[0].id, pickedQty: 1 }],
    });

    await releaseAssemblyPickList(prisma, production.id);

    const assemblyTasks = await prisma.pickTask.findMany({
      where: { pickListId: assemblyPickList.id },
      select: { id: true },
    });
    await confirmAssemblyPickTasksBatch(prisma, {
      productionOrderId: production.id,
      operatorName: "Operador Full Flow",
      tasks: assemblyTasks.map((task) => ({ taskId: task.id, pickedQty: 1 })),
    });
    await closeAssemblyWorkOrderConsume(prisma, production.id, "Operador Full Flow");

    await markSalesRequestDelivered(prisma, {
      orderId: order.id,
      deliveredByUserId: sales.id,
    });

    const [deliveredOrder, completedProduction, auditEntries] = await Promise.all([
      prisma.salesInternalOrder.findUnique({
        where: { id: order.id },
        select: { deliveredToCustomerAt: true, deliveredByUserId: true },
      }),
      prisma.productionOrder.findUnique({
        where: { id: production.id },
        select: { status: true },
      }),
      prisma.auditLog.findMany({
        where: {
          entityType: "SALES_INTERNAL_ORDER",
          entityId: order.id,
          action: { in: ["PULL_REQUEST", "MARK_DELIVERED_TO_CUSTOMER"] },
        },
        select: { action: true },
      }),
    ]);

    expect(deliveredOrder?.deliveredToCustomerAt).toBeTruthy();
    expect(deliveredOrder?.deliveredByUserId).toBe(sales.id);
    expect(completedProduction?.status).toBe("COMPLETADA");
    expect(auditEntries.map((row) => row.action)).toEqual(expect.arrayContaining(["PULL_REQUEST", "MARK_DELIVERED_TO_CUSTOMER"]));
  });
});
