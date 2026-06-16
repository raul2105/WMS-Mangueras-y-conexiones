import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import {
  cancelSalesRequestOrder,
  confirmSalesRequestOrder,
  createSalesRequestDraftHeader,
  pullSalesRequestOrder,
} from "@/lib/sales/request-service";
import { loginAs } from "./lib/auth.helpers";

const prisma = new PrismaClient();

let warehouseId = "";
let createdWarehouseId = "";
let productId = "";
let captureOrderId = "";
let assignmentOrderId = "";
let fulfillmentOrderId = "";
let readyOrderId = "";
let cancelledOrderId = "";

let assignmentOrderCode = "";
let fulfillmentOrderCode = "";
let readyOrderCode = "";
let cancelledOrderCode = "";

async function cleanupFixtures() {
  const orderIds = [
    captureOrderId,
    assignmentOrderId,
    fulfillmentOrderId,
    readyOrderId,
    cancelledOrderId,
  ].filter(Boolean);

  if (orderIds.length > 0) {
    await prisma.salesInternalOrder.deleteMany({ where: { id: { in: orderIds } } });
  }
  if (productId) {
    await prisma.product.deleteMany({ where: { id: productId } });
  }
  if (createdWarehouseId) {
    await prisma.warehouse.deleteMany({ where: { id: createdWarehouseId } });
  }
}

async function expectRequestCardNarrative(page: Page, orderCode: string, stageLabel: string, nextAction: string) {
  const card = page.getByTestId("request-card").filter({ hasText: orderCode }).first();
  await expect(card).toBeVisible();
  await expect(card).toContainText(stageLabel);
  await expect(card).toContainText(nextAction);
}

test.describe.serial("KAN-52 request flow narrative", () => {
  test.beforeAll(async () => {
    await cleanupFixtures();

    const manager = await prisma.user.findUnique({
      where: { email: "manager@scmayher.com" },
      select: { id: true },
    });
    const salesUser = await prisma.user.findUnique({
      where: { email: "sales@scmayher.com" },
      select: { id: true },
    });
    if (!manager || !salesUser) {
      throw new Error("Missing sales fixtures for KAN-52 narrative test");
    }

    const warehouse = await prisma.warehouse.create({
      data: {
        code: `KAN52-WH-${Date.now()}`,
        name: "Almacen KAN-52",
        address: "Fixture",
        isActive: true,
      },
      select: { id: true, code: true },
    });
    warehouseId = warehouse.id;
    createdWarehouseId = warehouse.id;

    await prisma.location.createMany({
      data: [
        {
          code: `STORAGE-${warehouse.code}`,
          name: "KAN-52 storage",
          usageType: "STORAGE",
          warehouseId: warehouse.id,
          isActive: true,
        },
        {
          code: `STAGING-${warehouse.code}`,
          name: "KAN-52 staging",
          usageType: "STAGING",
          warehouseId: warehouse.id,
          isActive: true,
        },
        {
          code: `SHIPPING-${warehouse.code}`,
          name: "KAN-52 shipping",
          usageType: "SHIPPING",
          warehouseId: warehouse.id,
          isActive: true,
        },
      ],
    });

    const product = await prisma.product.create({
      data: {
        sku: `KAN52-SKU-${Date.now()}`,
        name: "Producto KAN-52",
        type: "HOSE",
      },
      select: { id: true },
    });
    productId = product.id;

    const storageLocation = await prisma.location.findFirst({
      where: { warehouseId: warehouse.id, usageType: "STORAGE", isActive: true },
      orderBy: { code: "asc" },
      select: { id: true },
    });
    if (!storageLocation) {
      throw new Error("Missing storage location for KAN-52 narrative test");
    }
    await prisma.inventory.create({
      data: {
        productId: product.id,
        locationId: storageLocation.id,
        quantity: 20,
        reserved: 0,
        available: 20,
      },
    });

    const captureOrder = await createSalesRequestDraftHeader(prisma, {
      customerName: "Cliente KAN-52 captura",
      warehouseId,
      dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      notes: "KAN-52 capture fixture",
      requestedByUserId: manager.id,
      requestedByRoles: ["MANAGER"],
    });
    captureOrderId = captureOrder.id;
    const assignmentOrder = await createSalesRequestDraftHeader(prisma, {
      customerName: "Cliente KAN-52 asignacion",
      warehouseId,
      dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      notes: "KAN-52 assignment fixture",
      requestedByUserId: manager.id,
      requestedByRoles: ["MANAGER"],
      initialProductLine: { productId, requestedQty: 2 },
    });
    await confirmSalesRequestOrder(prisma, {
      orderId: assignmentOrder.id,
      confirmedByUserId: manager.id,
    });
    assignmentOrderId = assignmentOrder.id;
    assignmentOrderCode = assignmentOrder.code;

    const fulfillmentOrder = await createSalesRequestDraftHeader(prisma, {
      customerName: "Cliente KAN-52 surtido",
      warehouseId,
      dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      notes: "KAN-52 fulfillment fixture",
      requestedByUserId: manager.id,
      requestedByRoles: ["MANAGER"],
      initialProductLine: { productId, requestedQty: 1 },
    });
    await confirmSalesRequestOrder(prisma, {
      orderId: fulfillmentOrder.id,
      confirmedByUserId: manager.id,
    });
    await pullSalesRequestOrder(prisma, {
      orderId: fulfillmentOrder.id,
      assignedToUserId: salesUser.id,
    });
    fulfillmentOrderId = fulfillmentOrder.id;
    fulfillmentOrderCode = fulfillmentOrder.code;

    const readyOrder = await createSalesRequestDraftHeader(prisma, {
      customerName: "Cliente KAN-52 entrega",
      warehouseId,
      dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      notes: "KAN-52 ready fixture",
      requestedByUserId: manager.id,
      requestedByRoles: ["MANAGER"],
      initialProductLine: { productId, requestedQty: 3 },
    });
    await confirmSalesRequestOrder(prisma, {
      orderId: readyOrder.id,
      confirmedByUserId: manager.id,
    });
    await pullSalesRequestOrder(prisma, {
      orderId: readyOrder.id,
      assignedToUserId: salesUser.id,
    });
    await prisma.salesInternalOrderPickList.updateMany({
      where: { orderId: readyOrder.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    readyOrderId = readyOrder.id;
    readyOrderCode = readyOrder.code;

    const cancelledOrder = await createSalesRequestDraftHeader(prisma, {
      customerName: "Cliente KAN-52 cancelado",
      warehouseId,
      dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      notes: "KAN-52 cancel fixture",
      requestedByUserId: manager.id,
      requestedByRoles: ["MANAGER"],
    });
    await cancelSalesRequestOrder(prisma, {
      orderId: cancelledOrder.id,
      cancelledByUserId: manager.id,
    });
    cancelledOrderId = cancelledOrder.id;
    cancelledOrderCode = cancelledOrder.code;
  });

  test.afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  test("keeps the list filter buckets aligned with the shared flow model", async ({
    page,
  }) => {
    await loginAs(page, "SALES_EXECUTIVE", "/production/requests");
    await page.goto("/production/requests");
    await page.locator('[data-testid="requests-more-filters"] summary').click();

    await expect(page.getByRole("link", { name: /^Captura$/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Por asignar$/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /^En surtido$/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Listo para entrega$/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Entregado$/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Cancelado$/i })).toBeVisible();

    await page.getByRole("link", { name: /^Por asignar$/i }).click();
    await expect(page).toHaveURL(/stage=por_asignar/);
    await expectRequestCardNarrative(page, assignmentOrderCode, "Por asignar", "Tomar pedido");

    await page.getByRole("link", { name: /^En surtido$/i }).click();
    await expect(page).toHaveURL(/stage=en_surtido/);
    await expectRequestCardNarrative(page, fulfillmentOrderCode, "En surtido", "Revisar bloqueo");

    await page.getByRole("link", { name: /^Listo para entrega$/i }).click();
    await expect(page).toHaveURL(/stage=listo_entrega/);
    await expectRequestCardNarrative(page, readyOrderCode, "Listo para entrega", "Marcar entrega");

    await page.getByRole("link", { name: /^Cancelado$/i }).click();
    await expect(page).toHaveURL(/stage=cancelado/);
    await expectRequestCardNarrative(page, cancelledOrderCode, "Cancelado", "Revisar bloqueo");
  });

  test("keeps list and detail coherent for delivery-ready and cancelled requests", async ({
    page,
  }) => {
    await loginAs(page, "SALES_EXECUTIVE", "/production/requests");

    await page.goto("/production/requests?preset=listos_para_entrega");
    await expectRequestCardNarrative(page, readyOrderCode, "Listo para entrega", "Marcar entrega");
    await page
      .getByTestId("request-card")
      .filter({ hasText: readyOrderCode })
      .first()
      .getByRole("link", { name: /Ver detalle/i })
      .click();

    await expect(page.getByRole("heading", { name: /Pedido comercial/i })).toBeVisible();
    await expect(page.getByText("Listo para entrega", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: /Siguiente acción/i })).toBeVisible();
    await expect(page.getByText("Marcar entrega", { exact: true })).toBeVisible();

    const readyTimeline = page.locator("section").filter({ hasText: "Timeline operativo" }).first();
    await expect(readyTimeline.getByRole("listitem")).toHaveCount(5);
    await expect(readyTimeline.getByRole("listitem").nth(0)).toContainText("Captura");
    await expect(readyTimeline.getByRole("listitem").nth(1)).toContainText("Asignación");
    await expect(readyTimeline.getByRole("listitem").nth(2)).toContainText("Surtido / fulfillment");
    await expect(readyTimeline.getByRole("listitem").nth(3)).toContainText("Entrega");
    await expect(readyTimeline.getByRole("listitem").nth(4)).toContainText("Cancelación");

    await page.goto("/production/requests?status=CANCELADA");
    await expectRequestCardNarrative(page, cancelledOrderCode, "Cancelado", "Revisar bloqueo");
    await page
      .getByTestId("request-card")
      .filter({ hasText: cancelledOrderCode })
      .first()
      .getByRole("link", { name: /Ver detalle/i })
      .click();

    await expect(page.getByText("Cancelado", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Revisar bloqueo", { exact: true })).toBeVisible();
    await expect(page.getByText("Marcar entrega", { exact: true })).toHaveCount(0);

    const cancelledTimeline = page.locator("section").filter({ hasText: "Timeline operativo" }).first();
    await expect(cancelledTimeline.getByRole("listitem").nth(4)).toContainText("Cancelación");
  });
});
