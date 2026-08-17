import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { InventoryService } from "@/lib/inventory-service";
import {
  addSalesRequestProductLine,
  confirmSalesRequestOrder,
  createSalesRequestDraftHeader,
  releaseSalesRequestPickList,
} from "@/lib/sales/request-service";
import { loginAs } from "./lib/auth.helpers";

const prisma = new PrismaClient();
const enabled = process.env.WMS_AWS_WRITE_E2E === "1";
const secondaryPassword = process.env.WMS_E2E_SECONDARY_OPERATOR_PASSWORD ?? "Operator123*";
const tag = `QA-GATES-${Date.now().toString().slice(-8)}`;

const fixture = {
  warehouseId: "",
  storageLocationId: "",
  stagingLocationId: "",
  shippingLocationId: "",
  productId: "",
  customerId: "",
  orderIds: [] as string[],
  productSku: `${tag}-SKU`,
  warehouseCode: `${tag}-WH`,
  customerName: `Cliente gates ${tag}`,
  secondaryOperatorId: "",
};

type GateOrder = { id: string; code: string; taskId: string; sourceLocationId: string; targetLocationId: string };

async function loginWithCredentials(page: Page, email: string, password: string, callbackUrl: string) {
  await page.context().clearCookies();
  await page.goto(`/logout?e2eNonce=${Date.now()}`);
  await page.context().clearCookies();
  await page.goto(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}&e2eNonce=${Date.now()}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contrasena").fill(password);
  await page.getByRole("button", { name: "Iniciar sesion" }).click();
  await expect(page).toHaveURL(new RegExp(callbackUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

async function createConfirmedDirectOrder(quantity = 2): Promise<GateOrder> {
  const order = await createSalesRequestDraftHeader(prisma, {
    customerName: fixture.customerName,
    warehouseId: fixture.warehouseId,
    dueDate: new Date("2026-12-31T00:00:00.000Z"),
    notes: `AWS browser gate ${tag}`,
  });
  fixture.orderIds.push(order.id);
  const line = await addSalesRequestProductLine(prisma, {
    orderId: order.id,
    productId: fixture.productId,
    requestedQty: quantity,
  });
  await confirmSalesRequestOrder(prisma, { orderId: order.id });
  await releaseSalesRequestPickList(prisma, order.id);
  const task = await prisma.salesInternalOrderPickTask.findFirstOrThrow({
    where: { orderLineId: line.id },
    select: { id: true, sourceLocationId: true, targetLocationId: true },
  });
  return { id: order.id, code: order.code, taskId: task.id, sourceLocationId: task.sourceLocationId, targetLocationId: task.targetLocationId };
}

async function cleanupFixture() {
  if (fixture.orderIds.length) {
    await prisma.inventoryMovement.deleteMany({ where: { documentId: { in: fixture.orderIds } } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: fixture.orderIds } } });
    await prisma.salesInternalOrder.deleteMany({ where: { id: { in: fixture.orderIds } } });
  }
  if (fixture.productId) {
    await prisma.inventory.deleteMany({ where: { productId: fixture.productId } });
    await prisma.product.delete({ where: { id: fixture.productId } });
  }
  if (fixture.customerId) await prisma.customer.delete({ where: { id: fixture.customerId } });
  if (fixture.warehouseId) {
    await prisma.location.deleteMany({ where: { warehouseId: fixture.warehouseId } });
    await prisma.warehouse.delete({ where: { id: fixture.warehouseId } });
  }
  if (fixture.secondaryOperatorId) await prisma.user.delete({ where: { id: fixture.secondaryOperatorId } });
}

test.describe.serial("AWS dev browser gates V1/V5/V7/V8", () => {
  test.skip(
    !enabled,
    "Set WMS_AWS_WRITE_E2E=1 only for the explicitly authorized AWS dev write lane.",
  );

  test.beforeAll(async () => {
    const warehouse = await prisma.warehouse.create({
      data: { code: fixture.warehouseCode, name: `Almacén ${tag}`, isActive: true },
    });
    fixture.warehouseId = warehouse.id;
    const [storage, staging, shipping] = await Promise.all([
      prisma.location.create({ data: { code: `${tag}-STO`, name: "Storage gate", zone: "QA", usageType: "STORAGE", isActive: true, warehouseId: warehouse.id } }),
      prisma.location.create({ data: { code: `${tag}-STG`, name: "Staging gate", zone: "QA", usageType: "STAGING", isActive: true, warehouseId: warehouse.id } }),
      prisma.location.create({ data: { code: `${tag}-SHIP`, name: "Shipping gate", zone: "QA", usageType: "SHIPPING", isActive: true, warehouseId: warehouse.id } }),
    ]);
    fixture.storageLocationId = storage.id;
    fixture.stagingLocationId = staging.id;
    fixture.shippingLocationId = shipping.id;
    const product = await prisma.product.create({
      data: { sku: fixture.productSku, name: `Producto gate ${tag}`, type: "ACCESSORY" },
    });
    fixture.productId = product.id;
    const customer = await prisma.customer.create({
      data: { code: `${tag}-C`, name: fixture.customerName, isActive: true },
    });
    fixture.customerId = customer.id;
    const inventoryService = new InventoryService(prisma);
    await inventoryService.receiveStock(product.id, storage.id, 10, `RCV-${tag}`);

    const role = await prisma.role.findUniqueOrThrow({ where: { code: "WAREHOUSE_OPERATOR" }, select: { id: true } });
    const secondary = await prisma.user.create({
      data: {
        email: `${tag.toLowerCase()}-operator@scmayher.com`,
        name: `Operador secundario ${tag}`,
        passwordHash: await bcrypt.hash(secondaryPassword, 10),
        isActive: true,
        userRoles: { create: [{ roleId: role.id }] },
      },
      select: { id: true },
    });
    fixture.secondaryOperatorId = secondary.id;
  });

  test.afterAll(async () => {
    await cleanupFixture();
    await prisma.$disconnect();
  });

  test("V1 browser escribe una reserva y revalida disponibilidad actual", async ({ page }) => {
    await loginAs(page, "SALES_EXECUTIVE", "/production/requests/new", "/production/requests/new");
    const promise = new URLSearchParams({
      productId: fixture.productId,
      sku: fixture.productSku,
      source: "availability",
      promiseProductId: fixture.productId,
      promiseSku: fixture.productSku,
      promiseWarehouseId: fixture.warehouseId,
      promiseWarehouseCode: fixture.warehouseCode,
      promiseWarehouseName: `Almacén ${tag}`,
      promiseRequestedQty: "6",
      promiseAvailableQty: "10",
      promiseCheckedAt: new Date().toISOString(),
      promiseSource: "availability",
      promiseIsSubstitute: "false",
      quantity: "6",
    });
    await page.goto(`/production/requests/new?${promise.toString()}`);
    await page.getByLabel("Selecciona o crea el cliente").fill(fixture.customerName);
    await page.getByRole("button", { name: new RegExp(fixture.customerName) }).click();
    await page.getByRole("button", { name: "Continuar a producto →" }).click();
    await page.getByRole("button", { name: "Producto directo" }).click();
    await page.getByTestId("new-order-direct-product-input").fill(fixture.productSku);
    await page.getByRole("button", { name: new RegExp(fixture.productSku) }).click();
    await page.getByLabel("Cantidad").fill("6");
    await page.getByRole("button", { name: "Agregar producto al pedido" }).click();
    await page.getByRole("button", { name: "Continuar a entrega →" }).click();
    await page.getByLabel("Fecha compromiso").fill("2026-12-31");
    await Promise.all([
      page.waitForURL(/\/production\/requests\/[^/?]+\?ok=/),
      page.getByTestId("create-order-button").click(),
    ]);

    const created = await prisma.salesInternalOrder.findFirstOrThrow({ where: { warehouseId: fixture.warehouseId, customerId: fixture.customerId }, orderBy: { createdAt: "desc" } });
    fixture.orderIds.push(created.id);
    const inventory = await prisma.inventory.findFirstOrThrow({ where: { productId: fixture.productId, locationId: fixture.storageLocationId } });
    expect(inventory.reserved).toBe(6);
    expect(inventory.available).toBe(4);

    const stalePromise = new URLSearchParams({
      productId: fixture.productId,
      sku: fixture.productSku,
      source: "availability",
      promiseProductId: fixture.productId,
      promiseSku: fixture.productSku,
      promiseWarehouseId: fixture.warehouseId,
      promiseWarehouseCode: fixture.warehouseCode,
      promiseWarehouseName: `Almacén ${tag}`,
      promiseRequestedQty: "5",
      promiseAvailableQty: "10",
      promiseCheckedAt: new Date().toISOString(),
      promiseSource: "availability",
      promiseIsSubstitute: "false",
      quantity: "5",
    });
    await page.goto(`/production/requests/new?${stalePromise.toString()}`);
    await expect(page.getByTestId("commercial-promise-status")).toHaveText("Disponibilidad insuficiente");
    await expect(page.getByTestId("commercial-promise-available-qty")).toHaveText("4");
    await expect(page.getByTestId("commercial-promise-reserved-qty")).toHaveText("6");
    await expect(page.getByRole("button", { name: "Continuar a producto →" })).toBeDisabled();
    await expect(prisma.auditLog.findFirst({ where: { entityId: created.id, action: "REVALIDATE_COMMERCIAL_PROMISE" } })).resolves.toBeTruthy();
  });

  test("V5 browser enforces ownership MANAGER_REQUIRED entre dos operadores", async ({ browser, page }) => {
    const order = await createConfirmedDirectOrder();
    await loginAs(page, "MANAGER", `/production/fulfillment/${order.id}`, `/production/fulfillment/${order.id}`);
    await page.locator('input[name="reason"]').fill("Cliente prioritario gate");
    await page.getByRole("button", { name: "Exigir asignación" }).click();
    const assignmentForm = page.locator("form").filter({ hasText: "Asignación requerida" });
    await expect(assignmentForm).toBeVisible();
    await assignmentForm.locator('select[name="assigneeUserId"]').selectOption((await prisma.user.findUniqueOrThrow({ where: { email: "operator@scmayher.com" }, select: { id: true } })).id);
    await assignmentForm.getByRole("button", { name: "Asignar tareas" }).click();

    const secondaryContext = await browser.newContext();
    const secondaryPage = await secondaryContext.newPage();
    try {
      await loginWithCredentials(secondaryPage, `${tag.toLowerCase()}-operator@scmayher.com`, secondaryPassword, `/production/fulfillment/${order.id}`);
      await expect(secondaryPage.getByText("Asignada a operador")).toBeVisible();
      await expect(secondaryPage.getByRole("button", { name: "Tomar tareas" })).toHaveCount(0);
    } finally {
      await secondaryContext.close();
    }

    await loginWithCredentials(page, "operator@scmayher.com", "Operator123*", `/production/fulfillment/${order.id}`);
    await page.getByRole("button", { name: "Tomar tareas" }).click();
    await expect(page.getByText("Tomada por ti")).toBeVisible();
    const task = await prisma.salesInternalOrderPickTask.findFirstOrThrow({ where: { orderLine: { orderId: order.id } } });
    expect(task.assignedToUserId).toBe((await prisma.user.findUniqueOrThrow({ where: { email: "operator@scmayher.com" }, select: { id: true } })).id);
    expect(task.claimedByUserId).toBe(task.assignedToUserId);
  });

  test("V7 browser registra faltante, bloquea preparación y permite decisión auditada", async ({ page }) => {
    const order = await createConfirmedDirectOrder();
    await loginWithCredentials(page, "operator@scmayher.com", "Operator123*", `/production/fulfillment/${order.id}`);
    await page.getByRole("button", { name: "Tomar tareas" }).click();
    await expect(page.getByText("Tomada por ti")).toBeVisible();
    await page.locator('input[name^="scanRef__"]').first().fill(fixture.productSku);
    await page.locator('input[name^="pickedQty__"]').first().fill("0");
    await page.locator('input[name^="shortReason__"]').first().fill("FALTANTE_BROWSER_GATE");
    await Promise.all([
      page.waitForURL((url) => url.pathname.endsWith(`/production/fulfillment/${order.id}`) && url.searchParams.get("ok")?.includes("Surtido confirmado") === true),
      page.getByRole("button", { name: "Confirmar surtido" }).click(),
    ]);
    await expect(page.getByTestId("fulfillment-next-action")).toContainText("Confirma las cantidades");
    await expect(prisma.salesInternalOrderPickTask.findFirst({ where: { id: order.taskId, status: "PARTIAL", shortQty: { gt: 0 } } })).resolves.toBeTruthy();
    await page.goto(`/production/requests/${order.id}`);
    await expect(page.getByTestId("operational-exceptions")).toContainText("FALTANTE_BROWSER_GATE");
    await expect(page.getByTestId("prepare-for-delivery-form")).toHaveCount(0);

    await loginWithCredentials(page, "manager@scmayher.com", "Manager123*", `/production/requests/${order.id}`);
    const exceptions = page.getByTestId("operational-exceptions");
    await expect(exceptions).toContainText("OPEN");
    await exceptions.locator('select[name="resolution"]').selectOption("WAIT_REPLENISHMENT");
    await exceptions.locator('input[name="notes"]').fill("Reposición autorizada por manager gate");
    await exceptions.getByRole("button", { name: "Registrar decisión" }).click();
    await expect(page.getByTestId("operational-exceptions")).toContainText("WAIT_REPLENISHMENT");
    await expect(prisma.salesInternalOrderException.findFirst({ where: { orderId: order.id, status: "RESOLVED" } })).resolves.toBeTruthy();
  });

  test("V8 browser ejecuta dos claims concurrentes y conserva un solo ownership", async ({ browser }) => {
    const order = await createConfirmedDirectOrder();
    const primaryContext = await browser.newContext();
    const secondaryContext = await browser.newContext();
    const primaryPage = await primaryContext.newPage();
    const secondaryPage = await secondaryContext.newPage();
    try {
      await Promise.all([
        loginWithCredentials(primaryPage, "operator@scmayher.com", "Operator123*", `/production/fulfillment/${order.id}`),
        loginWithCredentials(secondaryPage, `${tag.toLowerCase()}-operator@scmayher.com`, secondaryPassword, `/production/fulfillment/${order.id}`),
      ]);
      await Promise.all([
        Promise.all([primaryPage.waitForURL(/\/production\/fulfillment\/[^?]+\?(?:ok|error)=/), primaryPage.getByRole("button", { name: "Tomar tareas" }).click()]),
        Promise.all([secondaryPage.waitForURL(/\/production\/fulfillment\/[^?]+\?(?:ok|error)=/), secondaryPage.getByRole("button", { name: "Tomar tareas" }).click()]),
      ]);
      const task = await prisma.salesInternalOrderPickTask.findFirstOrThrow({ where: { orderLine: { orderId: order.id } } });
      expect(task.claimedByUserId).toBeTruthy();
      expect(await prisma.auditLog.count({ where: { entityId: order.id, action: "CLAIM_WAREHOUSE_PICK_TASKS" } })).toBe(1);
      await expect(primaryPage.locator("body")).toContainText(/Tareas tomadas|fueron tomadas mientras confirmabas/);
      await expect(secondaryPage.locator("body")).toContainText(/Tareas tomadas|fueron tomadas mientras confirmabas/);
    } finally {
      await primaryContext.close();
      await secondaryContext.close();
    }
  });
});
