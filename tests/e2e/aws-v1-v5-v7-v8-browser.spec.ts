import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { InventoryService } from "@/lib/inventory-service";
import { addSalesRequestProductLine, confirmSalesRequestOrder, createSalesRequestDraftHeader, releaseSalesRequestPickList } from "@/lib/sales/request-service";
import { loginAs, USERS } from "./lib/auth.helpers";
import { createAwsFixtureEvidence } from "./lib/aws-fixture-evidence";

const prisma = new PrismaClient();
const enabled = process.env.WMS_AWS_WRITE_E2E === "1";
const secondaryPassword = randomUUID();
const tag = `QA-GATES-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
let evidence: Awaited<ReturnType<typeof createAwsFixtureEvidence>> | null = null;

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

async function captureBeforeManifest() {
  const [{ schema }] = await prisma.$queryRaw<Array<{ schema: string }>>`SELECT current_schema() AS schema`;
  const locationCodes = [`${tag}-STO`, `${tag}-STG`, `${tag}-SHIP`];
  const [warehouses, customers, products, locations, secondaryUsers] = await Promise.all([
    prisma.warehouse.findMany({ where: { code: fixture.warehouseCode }, select: { id: true, code: true } }),
    prisma.customer.findMany({ where: { code: `${tag}-C` }, select: { id: true, code: true } }),
    prisma.product.findMany({ where: { sku: fixture.productSku }, select: { id: true, sku: true } }),
    prisma.location.findMany({ where: { code: { in: locationCodes } }, select: { id: true, code: true } }),
    prisma.user.findMany({ where: { email: `${tag.toLowerCase()}-operator@qa.invalid` }, select: { id: true, email: true } }),
  ]);
  return {
    phase: "before", capturedAt: new Date().toISOString(), schema, uniqueTag: tag,
    keys: { warehouseCode: fixture.warehouseCode, customerCode: `${tag}-C`, sku: fixture.productSku, locationCodes, secondaryUserEmail: `${tag.toLowerCase()}-operator@qa.invalid` },
    records: { warehouses, customers, products, locations, secondaryUsers },
    counts: { warehouses: warehouses.length, customers: customers.length, products: products.length, locations: locations.length, secondaryUsers: secondaryUsers.length },
  };
}

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
  const scopedOrders = fixture.warehouseId
    ? await prisma.salesInternalOrder.findMany({ where: { warehouseId: fixture.warehouseId }, select: { id: true } })
    : [];
  const orderIds = [...new Set([...fixture.orderIds, ...scopedOrders.map(({ id }) => id)])];
  const locationIds = [fixture.storageLocationId, fixture.stagingLocationId, fixture.shippingLocationId].filter(Boolean);
  const inventoryEntityIds = fixture.productId ? locationIds.map((locationId) => `${fixture.productId}:${locationId}`) : [];
  const scopedOrdersWithChildren = orderIds.length
    ? await prisma.salesInternalOrder.findMany({ where: { id: { in: orderIds } }, select: { id: true, lines: { select: { id: true } }, pickLists: { select: { id: true, tasks: { select: { id: true } } } } } })
    : [];
  const exceptions = orderIds.length
    ? await prisma.salesInternalOrderException.findMany({ where: { orderId: { in: orderIds } }, select: { id: true, returns: { select: { id: true, items: { select: { id: true } } } } } })
    : [];
  const exceptionIds = exceptions.map(({ id }) => id);
  const returnIds = exceptions.flatMap(({ returns }) => returns.map(({ id }) => id));
  const returnItemIds = exceptions.flatMap(({ returns }) => returns.flatMap(({ items }) => items.map(({ id }) => id)));
  const lineIds = scopedOrdersWithChildren.flatMap((order) => order.lines.map(({ id }) => id));
  const pickListIds = scopedOrdersWithChildren.flatMap((order) => order.pickLists.map(({ id }) => id));
  const pickTaskIds = scopedOrdersWithChildren.flatMap((order) => order.pickLists.flatMap(({ tasks }) => tasks.map(({ id }) => id)));
  const movementScope = [
    ...(orderIds.length ? [{ documentId: { in: orderIds } }] : []),
    ...(fixture.productId ? [{ productId: fixture.productId }] : []),
    ...(locationIds.length ? [{ locationId: { in: locationIds } }] : []),
  ];
  const [inventoryRows, movementRows, traceRows] = await Promise.all([
    fixture.productId ? prisma.inventory.findMany({ where: { productId: fixture.productId }, select: { id: true, productId: true, locationId: true, quantity: true, reserved: true, available: true } }) : Promise.resolve([]),
    movementScope.length ? prisma.inventoryMovement.findMany({ where: { OR: movementScope }, select: { id: true, documentId: true, productId: true, locationId: true, type: true, quantity: true } }) : Promise.resolve([]),
    fixture.warehouseId ? prisma.traceRecord.findMany({ where: { warehouseId: fixture.warehouseId }, select: { id: true } }) : Promise.resolve([]),
  ]);
  const traceIds = traceRows.map(({ id }) => id);
  const labelJobs = traceIds.length ? await prisma.labelPrintJob.findMany({ where: { traceRecordId: { in: traceIds } }, select: { id: true, traceRecordId: true } }) : [];
  const productIds = fixture.productId ? [fixture.productId] : [];
  const orderEventIds = [...orderIds];
  const syncEventWhere: Prisma.SyncEventWhereInput = {
    OR: [
      ...(inventoryEntityIds.length ? [{ entityType: "INVENTORY", entityId: { in: inventoryEntityIds } }] : []),
      ...(orderEventIds.length ? [{ entityType: "ORDER", entityId: { in: orderEventIds } }] : []),
      ...(productIds.length ? [{ entityType: "PRODUCT", entityId: { in: productIds } }] : []),
    ],
  };
  const syncEvents = syncEventWhere.OR?.length ? await prisma.syncEvent.findMany({ where: syncEventWhere, select: { id: true, entityType: true, entityId: true, action: true, status: true } }) : [];
  const childEntityIds = [
    ...scopedOrdersWithChildren.flatMap((order) => [order.id, ...order.lines.map(({ id }) => id), ...order.pickLists.flatMap((pickList) => [pickList.id, ...pickList.tasks.map(({ id }) => id)])]),
    ...exceptionIds, ...returnIds, ...returnItemIds,
  ];
  const auditEntityIds = [...new Set([
    ...childEntityIds, ...inventoryEntityIds, ...productIds, ...locationIds,
    fixture.warehouseId, fixture.customerId, fixture.secondaryOperatorId,
    ...movementRows.map(({ id }) => id),
  ].filter((value): value is string => Boolean(value)))];
  const auditRows = auditEntityIds.length ? await prisma.auditLog.findMany({ where: { entityId: { in: auditEntityIds } }, select: { id: true, entityType: true, entityId: true, action: true, actorUserId: true } }) : [];
  const duringIds = {
    warehouseIds: fixture.warehouseId ? [fixture.warehouseId] : [], customerIds: fixture.customerId ? [fixture.customerId] : [],
    productIds, locationIds, salesOrderIds: orderIds, salesOrderLineIds: lineIds, pickListIds, pickTaskIds,
    exceptionIds, returnIds, returnItemIds, inventoryIds: inventoryRows.map(({ id }) => id), movementIds: movementRows.map(({ id }) => id),
    traceIds, labelPrintJobIds: labelJobs.map(({ id }) => id), userIds: fixture.secondaryOperatorId ? [fixture.secondaryOperatorId] : [],
    userRoles: fixture.secondaryOperatorId ? await prisma.userRole.findMany({ where: { userId: fixture.secondaryOperatorId }, select: { userId: true, roleId: true } }) : [],
    auditEntityIds, auditLogIds: auditRows.map(({ id }) => id), syncEventIds: syncEvents.map(({ id }) => id),
    inventoryEntityIds, orderEventIds, productEventIds: productIds,
  };
  const duringCounts = Object.fromEntries(Object.entries(duringIds).map(([key, ids]) => [key, Array.isArray(ids) ? ids.length : 0]));
  const [{ schema }] = await prisma.$queryRaw<Array<{ schema: string }>>`SELECT current_schema() AS schema`;
  await evidence?.write("during", { phase: "during", capturedAt: new Date().toISOString(), schema, uniqueTag: tag, ids: duringIds, counts: duringCounts });

  if (traceIds.length) await prisma.labelPrintJob.deleteMany({ where: { id: { in: labelJobs.map(({ id }) => id) } } });
  if (traceIds.length) await prisma.traceRecord.deleteMany({ where: { id: { in: traceIds } } });
  if (auditEntityIds.length) await prisma.auditLog.deleteMany({ where: { entityId: { in: auditEntityIds } } });
  if (syncEventWhere.OR?.length) await prisma.syncEvent.deleteMany({ where: syncEventWhere });
  if (movementRows.length) await prisma.inventoryMovement.deleteMany({ where: { id: { in: movementRows.map(({ id }) => id) } } });
  if (orderIds.length) {
    await prisma.salesInternalOrder.deleteMany({ where: { id: { in: orderIds } } });
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

  const afterCounts = {
    warehouses: fixture.warehouseId ? await prisma.warehouse.count({ where: { id: fixture.warehouseId } }) : 0,
    customers: fixture.customerId ? await prisma.customer.count({ where: { id: fixture.customerId } }) : 0,
    products: productIds.length ? await prisma.product.count({ where: { id: { in: productIds } } }) : 0,
    locations: locationIds.length ? await prisma.location.count({ where: { id: { in: locationIds } } }) : 0,
    salesOrders: orderIds.length ? await prisma.salesInternalOrder.count({ where: { id: { in: orderIds } } }) : 0,
    salesOrderLines: lineIds.length ? await prisma.salesInternalOrderLine.count({ where: { id: { in: lineIds } } }) : 0,
    pickLists: pickListIds.length ? await prisma.salesInternalOrderPickList.count({ where: { id: { in: pickListIds } } }) : 0,
    pickTasks: pickTaskIds.length ? await prisma.salesInternalOrderPickTask.count({ where: { id: { in: pickTaskIds } } }) : 0,
    exceptions: exceptionIds.length ? await prisma.salesInternalOrderException.count({ where: { id: { in: exceptionIds } } }) : 0,
    returns: returnIds.length ? await prisma.salesInternalOrderReturn.count({ where: { id: { in: returnIds } } }) : 0,
    returnItems: returnItemIds.length ? await prisma.salesInternalOrderReturnItem.count({ where: { id: { in: returnItemIds } } }) : 0,
    inventory: inventoryRows.length ? await prisma.inventory.count({ where: { id: { in: inventoryRows.map(({ id }) => id) } } }) : 0,
    movements: movementRows.length ? await prisma.inventoryMovement.count({ where: { id: { in: movementRows.map(({ id }) => id) } } }) : 0,
    traces: traceIds.length ? await prisma.traceRecord.count({ where: { id: { in: traceIds } } }) : 0,
    labelPrintJobs: labelJobs.length ? await prisma.labelPrintJob.count({ where: { id: { in: labelJobs.map(({ id }) => id) } } }) : 0,
    secondaryUsers: fixture.secondaryOperatorId ? await prisma.user.count({ where: { id: fixture.secondaryOperatorId } }) : 0,
    userRoles: Array.isArray(duringIds.userRoles) && duringIds.userRoles.length ? await prisma.userRole.count({ where: { OR: duringIds.userRoles } }) : 0,
    audits: auditEntityIds.length ? await prisma.auditLog.count({ where: { entityId: { in: auditEntityIds } } }) : 0,
    syncEvents: syncEventWhere.OR?.length ? await prisma.syncEvent.count({ where: syncEventWhere }) : 0,
  };
  await evidence?.write("after", { phase: "after", capturedAt: new Date().toISOString(), schema, uniqueTag: tag, ids: duringIds, counts: afterCounts, zeroResiduals: Object.values(afterCounts).every((count) => count === 0) });
  expect(Object.values(afterCounts)).toEqual(Array(Object.keys(afterCounts).length).fill(0));
}

test.describe.serial("AWS dev browser gates V1/V5/V7/V8", () => {
  test.skip(
    !enabled,
    "Set WMS_AWS_WRITE_E2E=1 only for the explicitly authorized AWS dev write lane.",
  );

  test.beforeAll(async () => {
    evidence = await createAwsFixtureEvidence("aws-v1-v5-v7-v8", tag);
    const before = await captureBeforeManifest();
    await evidence.write("before", before);
    expect(Object.values(before.counts)).toEqual(Array(Object.keys(before.counts).length).fill(0));

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
        email: `${tag.toLowerCase()}-operator@qa.invalid`,
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
    try {
      await cleanupFixture();
    } finally {
      await prisma.$disconnect();
    }
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
    const primaryOperatorId = (await prisma.user.findUniqueOrThrow({ where: { email: USERS.WAREHOUSE_OPERATOR.email }, select: { id: true } })).id;
    await assignmentForm.locator('select[name="assigneeUserId"]').selectOption(primaryOperatorId);
    await assignmentForm.getByRole("button", { name: "Asignar tareas" }).click();

    const secondaryContext = await browser.newContext();
    const secondaryPage = await secondaryContext.newPage();
    try {
      await loginWithCredentials(secondaryPage, `${tag.toLowerCase()}-operator@qa.invalid`, secondaryPassword, `/production/fulfillment/${order.id}`);
      await expect(secondaryPage.getByText("Asignada a operador")).toBeVisible();
      await expect(secondaryPage.getByRole("button", { name: "Tomar tareas" })).toHaveCount(0);
    } finally {
      await secondaryContext.close();
    }

    await loginAs(page, "WAREHOUSE_OPERATOR", `/production/fulfillment/${order.id}`, `/production/fulfillment/${order.id}`);
    await page.getByRole("button", { name: "Tomar tareas" }).click();
    await expect(page.getByText("Tomada por ti")).toBeVisible();
    const task = await prisma.salesInternalOrderPickTask.findFirstOrThrow({ where: { orderLine: { orderId: order.id } } });
    expect(task.assignedToUserId).toBe(primaryOperatorId);
    expect(task.claimedByUserId).toBe(task.assignedToUserId);
  });

  test("V7 browser registra faltante, bloquea preparación y permite decisión auditada", async ({ page }) => {
    const order = await createConfirmedDirectOrder();
    await loginAs(page, "WAREHOUSE_OPERATOR", `/production/fulfillment/${order.id}`, `/production/fulfillment/${order.id}`);
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

    await loginAs(page, "MANAGER", `/production/requests/${order.id}`, `/production/requests/${order.id}`);
    const exceptions = page.getByTestId("operational-exceptions");
    await expect(exceptions).toContainText("OPEN");
    await exceptions.locator('select[name="resolution"]').selectOption("WAIT_REPLENISHMENT");
    await exceptions.locator('input[name="notes"]').fill("Reposición autorizada por manager gate");
    await exceptions.getByRole("button", { name: "Registrar decisión" }).click();
    await expect(page.getByTestId("operational-exceptions")).toContainText("WAIT_REPLENISHMENT");
    const resolvedException = await prisma.salesInternalOrderException.findFirstOrThrow({ where: { orderId: order.id, status: "RESOLVED" } });
    const managerId = (await prisma.user.findUniqueOrThrow({ where: { email: USERS.MANAGER.email }, select: { id: true } })).id;
    expect(resolvedException.resolution).toBe("WAIT_REPLENISHMENT");
    expect(resolvedException.decidedByUserId).toBe(managerId);
    expect(resolvedException.decidedAt).toBeTruthy();
    const resolutionAudits = await prisma.auditLog.findMany({ where: { entityId: order.id, action: "RESOLVE_OPERATIONAL_EXCEPTION" } });
    expect(resolutionAudits).toHaveLength(1);
    expect(resolutionAudits[0]?.actorUserId).toBe(managerId);
    await page.reload();
    await expect(page.getByTestId("operational-exceptions")).toContainText("WAIT_REPLENISHMENT");
    await expect(page.getByTestId("operational-exceptions").getByRole("button", { name: "Registrar decisión" })).toHaveCount(0);
    await expect(prisma.auditLog.count({ where: { entityId: order.id, action: "RESOLVE_OPERATIONAL_EXCEPTION" } })).resolves.toBe(1);
  });

  test("V8 browser ejecuta dos claims concurrentes y conserva un solo ownership", async ({ browser }) => {
    const order = await createConfirmedDirectOrder();
    const primaryContext = await browser.newContext();
    const secondaryContext = await browser.newContext();
    const primaryPage = await primaryContext.newPage();
    const secondaryPage = await secondaryContext.newPage();
    try {
      await Promise.all([
        loginAs(primaryPage, "WAREHOUSE_OPERATOR", `/production/fulfillment/${order.id}`, `/production/fulfillment/${order.id}`),
        loginWithCredentials(secondaryPage, `${tag.toLowerCase()}-operator@qa.invalid`, secondaryPassword, `/production/fulfillment/${order.id}`),
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

const governancePrisma = new PrismaClient();
const governanceTag = `E2E-GOV-${randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`;
const governanceFixture = {
  hoseSku: `${governanceTag}-HOSE`,
  fittingSku: `${governanceTag}-SUBSTITUTE-HOSE`,
  documentRef: `${governanceTag}-DOC`,
  sourceId: "",
  hoseId: "",
  fittingId: "",
  warehouseId: "",
  locationId: "",
  stagingLocationId: "",
  customerId: "",
  ruleId: "",
  equivalenceId: "",
  orderId: "",
  managerUserId: "",
  adminUserId: "",
};
let governanceBefore: Record<string, unknown> = {};
let governanceDuring: Record<string, unknown> = {};

async function expectCatalogAccessibilityBothThemes(page: Page) {
  for (const theme of ["light", "dark"] as const) {
    if (await page.locator("html").getAttribute("data-theme") !== theme) {
      await page.getByRole("button", { name: "Cambiar tema" }).click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    }
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(result.violations.filter((issue) => issue.impact === "critical" || issue.impact === "serious" || issue.id === "color-contrast")).toEqual([]);
  }
}

async function captureGovernanceManifest() {
  const [{ schema }] = await governancePrisma.$queryRaw<Array<{ schema: string }>>`SELECT current_schema() AS schema`;
  const [products, sources, rules, equivalences, orders, warehouses, locations, stagingLocations, customers, inventory, movements] = await Promise.all([
    governancePrisma.product.findMany({ where: { sku: { in: [governanceFixture.hoseSku, governanceFixture.fittingSku] } }, select: { id: true, sku: true } }),
    governancePrisma.productTechnicalSource.findMany({ where: { documentRef: governanceFixture.documentRef }, select: { id: true, status: true, documentVersion: true } }),
    governancePrisma.productCompatibilityRule.findMany({ where: { OR: [
      { id: governanceFixture.ruleId || "00000000-0000-0000-0000-000000000000" },
      { productId: governanceFixture.hoseId || "00000000-0000-0000-0000-000000000000", ruleType: "PRODUCT_SUBSTITUTION" },
    ] }, select: { id: true, governanceStatus: true, decision: true, ruleRevision: true } }),
    governancePrisma.productEquivalence.findMany({ where: { OR: [
      { id: governanceFixture.equivalenceId || "00000000-0000-0000-0000-000000000000" },
      { sourceSheet: `Commercial note ${governanceTag}` },
    ] }, select: { id: true, active: true } }),
    governancePrisma.salesInternalOrder.findMany({ where: { id: governanceFixture.orderId || "00000000-0000-0000-0000-000000000000" }, select: { id: true, code: true, lines: { select: { id: true, technicalSelectionSnapshot: true } }, pickLists: { select: { id: true, tasks: { select: { id: true } } } } } }),
    governancePrisma.warehouse.findMany({ where: { id: governanceFixture.warehouseId || "00000000-0000-0000-0000-000000000000" }, select: { id: true, code: true } }),
    governancePrisma.location.findMany({ where: { id: governanceFixture.locationId || "00000000-0000-0000-0000-000000000000" }, select: { id: true, code: true } }),
    governancePrisma.location.findMany({ where: { id: governanceFixture.stagingLocationId || "00000000-0000-0000-0000-000000000000" }, select: { id: true, code: true } }),
    governancePrisma.customer.findMany({ where: { id: governanceFixture.customerId || "00000000-0000-0000-0000-000000000000" }, select: { id: true, code: true } }),
    governancePrisma.inventory.findMany({ where: { productId: { in: [governanceFixture.hoseId, governanceFixture.fittingId].filter(Boolean) } }, select: { id: true, productId: true, locationId: true, quantity: true, reserved: true, available: true } }),
    governancePrisma.inventoryMovement.findMany({ where: { documentId: { in: [`${governanceTag}-RECEIPT`, governanceFixture.orderId || "00000000-0000-0000-0000-000000000000"] } }, select: { id: true, documentId: true, productId: true, quantity: true, type: true } }),
  ]);
  const inventoryEventEntityIds = productIdsForGovernance().flatMap((productId) =>
    [governanceFixture.locationId, governanceFixture.stagingLocationId].filter(Boolean).map((locationId) => `${productId}:${locationId}`),
  );
  const syncEvents = inventoryEventEntityIds.length
    ? await governancePrisma.syncEvent.findMany({ where: { entityType: "INVENTORY", entityId: { in: inventoryEventEntityIds } }, select: { id: true, entityId: true, action: true, status: true } })
    : [];
  const orderEntityIds = orders.flatMap((order) => [order.id, ...order.lines.map(({ id }) => id), ...order.pickLists.map(({ id }) => id), ...order.pickLists.flatMap(({ tasks }) => tasks.map(({ id }) => id))]);
  const entityIds = [governanceFixture.sourceId, governanceFixture.orderId, ...orderEntityIds, ...rules.map(({ id }) => id), ...equivalences.map(({ id }) => id), ...inventoryEventEntityIds].filter(Boolean);
  const audits = entityIds.length
    ? await governancePrisma.auditLog.findMany({ where: { entityId: { in: entityIds } }, select: { id: true, entityType: true, entityId: true, action: true, actorUserId: true } })
    : [];
  return {
    capturedAt: new Date().toISOString(),
    schema,
    runId: governanceTag,
    actors: { managerUserId: governanceFixture.managerUserId, adminUserId: governanceFixture.adminUserId },
    identities: { sourceId: governanceFixture.sourceId, hoseId: governanceFixture.hoseId, fittingId: governanceFixture.fittingId, ruleId: governanceFixture.ruleId, equivalenceId: governanceFixture.equivalenceId, warehouseId: governanceFixture.warehouseId, locationId: governanceFixture.locationId, stagingLocationId: governanceFixture.stagingLocationId, customerId: governanceFixture.customerId },
    records: { products, sources, rules, equivalences, orders, warehouses, locations, stagingLocations, customers, inventory, movements, syncEvents, audits },
  };
}

function productIdsForGovernance() {
  return [governanceFixture.hoseId, governanceFixture.fittingId].filter(Boolean);
}

async function cleanupGovernanceFixture() {
  const productIds = [governanceFixture.hoseId, governanceFixture.fittingId].filter(Boolean);
  const [scopedRules, scopedEquivalences] = await Promise.all([
    governanceFixture.ruleId
      ? governancePrisma.productCompatibilityRule.findMany({ where: { id: governanceFixture.ruleId }, select: { id: true } })
      : productIds.length
        ? governancePrisma.productCompatibilityRule.findMany({ where: { productId: { in: productIds }, ruleType: "PRODUCT_SUBSTITUTION" }, select: { id: true } })
        : Promise.resolve([]),
    governanceFixture.equivalenceId
      ? governancePrisma.productEquivalence.findMany({ where: { id: governanceFixture.equivalenceId }, select: { id: true } })
      : productIds.length
        ? governancePrisma.productEquivalence.findMany({ where: { productId: { in: productIds }, sourceSheet: `Commercial note ${governanceTag}` }, select: { id: true } })
        : Promise.resolve([]),
  ]);
  const ruleIds = [...new Set([...scopedRules.map(({ id }) => id), governanceFixture.ruleId].filter(Boolean))];
  const equivalenceIds = [...new Set([...scopedEquivalences.map(({ id }) => id), governanceFixture.equivalenceId].filter(Boolean))];
  const relatedOrder = governanceFixture.orderId
    ? await governancePrisma.salesInternalOrder.findUnique({
        where: { id: governanceFixture.orderId },
        select: { id: true, lines: { select: { id: true } }, pickLists: { select: { id: true, tasks: { select: { id: true } } } } },
      })
    : null;
  const orderEntityIds = relatedOrder
    ? [relatedOrder.id, ...relatedOrder.lines.map(({ id }) => id), ...relatedOrder.pickLists.map(({ id }) => id), ...relatedOrder.pickLists.flatMap(({ tasks }) => tasks.map(({ id }) => id))]
    : [];
  const inventoryEventEntityIds = productIds.flatMap((productId) =>
    [governanceFixture.locationId, governanceFixture.stagingLocationId].filter(Boolean).map((locationId) => `${productId}:${locationId}`),
  );
  const entityIds = [governanceFixture.sourceId, governanceFixture.orderId, ...orderEntityIds, ...ruleIds, ...equivalenceIds, ...inventoryEventEntityIds].filter(Boolean);
  if (entityIds.length) await governancePrisma.auditLog.deleteMany({ where: { entityId: { in: entityIds } } });
  if (inventoryEventEntityIds.length) await governancePrisma.syncEvent.deleteMany({ where: { entityType: "INVENTORY", entityId: { in: inventoryEventEntityIds } } });
  if (governanceFixture.orderId) {
    const order = await governancePrisma.salesInternalOrder.findUnique({ where: { id: governanceFixture.orderId }, select: { code: true } });
    if (order) await governancePrisma.inventoryMovement.deleteMany({ where: { documentId: { in: [governanceFixture.orderId, order.code, `${governanceTag}-RECEIPT`] } } });
    else await governancePrisma.inventoryMovement.deleteMany({ where: { documentId: `${governanceTag}-RECEIPT` } });
    await governancePrisma.salesInternalOrder.deleteMany({ where: { id: governanceFixture.orderId } });
  }
  if (productIds.length) await governancePrisma.inventory.deleteMany({ where: { productId: { in: productIds } } });
  if (ruleIds.length) await governancePrisma.productCompatibilityRule.deleteMany({ where: { id: { in: ruleIds } } });
  if (equivalenceIds.length) await governancePrisma.productEquivalence.deleteMany({ where: { id: { in: equivalenceIds } } });
  if (governanceFixture.orderId) await governancePrisma.salesInternalOrder.deleteMany({ where: { id: governanceFixture.orderId } });
  if (governanceFixture.sourceId) {
    await governancePrisma.productTechnicalSpecCandidate.deleteMany({ where: { sourceId: governanceFixture.sourceId } });
    await governancePrisma.productTechnicalSpec.deleteMany({ where: { sourceId: governanceFixture.sourceId } });
    await governancePrisma.productAsset.deleteMany({ where: { sourceId: governanceFixture.sourceId } });
    await governancePrisma.productTechnicalSource.deleteMany({ where: { id: governanceFixture.sourceId } });
  }
  if (governanceFixture.customerId) await governancePrisma.customer.deleteMany({ where: { id: governanceFixture.customerId } });
  if (governanceFixture.locationId) await governancePrisma.location.deleteMany({ where: { id: governanceFixture.locationId } });
  if (governanceFixture.stagingLocationId) await governancePrisma.location.deleteMany({ where: { id: governanceFixture.stagingLocationId } });
  if (governanceFixture.warehouseId) await governancePrisma.warehouse.deleteMany({ where: { id: governanceFixture.warehouseId } });
  if (productIds.length) await governancePrisma.product.deleteMany({ where: { id: { in: productIds } } });
}

async function writeGovernanceManifest(during: Record<string, unknown>, after: Record<string, unknown>) {
  const directory = process.env.WMS_AWS_EVIDENCE_DIR ?? path.join("output", governanceTag.toLowerCase());
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "catalog-governance-manifest.json"), JSON.stringify({ before: governanceBefore, during, after }, null, 2), "utf8");
}

test.describe.serial("AWS browser governance KAN-19/21", () => {
  test.skip(!enabled, "Set WMS_AWS_WRITE_E2E=1 only for the explicitly authorized AWS dev write lane.");

  test.beforeAll(async () => {
    governanceBefore = await captureGovernanceManifest();
    const records = governanceBefore.records as Record<string, unknown[]>;
    if (Object.values(records).some((rows) => rows.length > 0)) throw new Error(`UUID fixture collision before governance writes: ${governanceTag}`);
    const [manager, admin] = await Promise.all([
      governancePrisma.user.findUnique({ where: { email: USERS.MANAGER.email }, select: { id: true, isActive: true, userRoles: { select: { role: { select: { code: true, isActive: true } } } } } }),
      governancePrisma.user.findUnique({ where: { email: USERS.SYSTEM_ADMIN.email }, select: { id: true, isActive: true, userRoles: { select: { role: { select: { code: true, isActive: true } } } } } }),
    ]);
    if (!manager?.isActive || !manager.userRoles.some(({ role }) => role.code === "MANAGER" && role.isActive)) throw new Error("Configured Manager account is not active or lacks MANAGER role");
    if (!admin?.isActive || !admin.userRoles.some(({ role }) => role.code === "SYSTEM_ADMIN" && role.isActive)) throw new Error("Configured System Admin account is not active or lacks SYSTEM_ADMIN role");
    governanceFixture.managerUserId = manager.id;
    governanceFixture.adminUserId = admin.id;

    const hose = await governancePrisma.product.create({ data: { sku: governanceFixture.hoseSku, name: `E2E manguera original ${governanceTag}`, type: "HOSE", brand: `E2E Marca ${governanceTag}`, attributes: "{}" }, select: { id: true } });
    governanceFixture.hoseId = hose.id;
    const fitting = await governancePrisma.product.create({ data: { sku: governanceFixture.fittingSku, name: `E2E manguera sustituta ${governanceTag}`, type: "HOSE", brand: `E2E Marca ${governanceTag}`, attributes: "{}" }, select: { id: true } });
    governanceFixture.fittingId = fitting.id;
    const warehouse = await governancePrisma.warehouse.create({ data: { code: `${governanceTag}-WH`, name: `Almacén ${governanceTag}`, isActive: true }, select: { id: true } });
    governanceFixture.warehouseId = warehouse.id;
    const location = await governancePrisma.location.create({ data: { code: `${governanceTag}-STO`, name: `Stock ${governanceTag}`, zone: "QA", usageType: "STORAGE", isActive: true, warehouseId: warehouse.id }, select: { id: true } });
    governanceFixture.locationId = location.id;
    const staging = await governancePrisma.location.create({ data: { code: `STAGING-${governanceTag}-WH`, name: `Tránsito ${governanceTag}`, zone: "QA", usageType: "STAGING", isActive: true, warehouseId: warehouse.id }, select: { id: true } });
    governanceFixture.stagingLocationId = staging.id;
    await new InventoryService(governancePrisma).receiveStock(fitting.id, location.id, 10, `${governanceTag}-RECEIPT`);
    const customer = await governancePrisma.customer.create({ data: { code: `${governanceTag}-C`, name: `Cliente ${governanceTag}`, isActive: true }, select: { id: true } });
    governanceFixture.customerId = customer.id;
    const source = await governancePrisma.productTechnicalSource.create({
      data: { supplierName: `E2E Fabricante ${governanceTag}`, documentRef: governanceFixture.documentRef, documentVersion: null, sourceUrl: "https://manufacturer.example/e2e-source", status: "PENDING_REVIEW" },
      select: { id: true },
    });
    governanceFixture.sourceId = source.id;
    await governancePrisma.productTechnicalSpecCandidate.create({
      data: { productId: hose.id, sourceId: source.id, family: "HOSE", key: "working_pressure", value: "250", normalizedValue: "250", unit: "bar", isSafetyCritical: true },
    });
  });

  test.afterAll(async () => {
    try {
      await cleanupGovernanceFixture();
      const after = await captureGovernanceManifest();
      await writeGovernanceManifest(governanceDuring, after);
      const records = after.records as Record<string, unknown[]>;
      expect(Object.values(records).every((rows) => rows.length === 0)).toBe(true);
    } finally {
      await governancePrisma.$disconnect();
    }
  });

  test("Manager reviews documented source and rule; Admin publishes the exact decision; equivalence stays commercial", async ({ page }, testInfo) => {
    // This journey includes multiple role changes, eight theme/accessibility
    // scans and a complete order snapshot against the remote AWS runtime.
    // Keep each UI expectation bounded while allowing the whole journey to finish.
    test.setTimeout(600000);
    const journeyStarted = Date.now();
    const recordPhase = async (phase: string) => {
      await testInfo.attach(`governance-${phase}-timing`, {
        body: Buffer.from(JSON.stringify({ phase, elapsedMs: Date.now() - journeyStarted })),
        contentType: "application/json",
      });
    };
    await loginAs(page, "MANAGER", "/catalog/technical-sources", "/catalog/technical-sources");
    await page.goto("/catalog/technical-sources");
    await page.setViewportSize({ width: 390, height: 844 });
    await expectCatalogAccessibilityBothThemes(page);
    const sourceCard = page.locator("section").filter({ hasText: governanceFixture.documentRef });
    await expect(sourceCard).toContainText("Falta versión documental");
    await sourceCard.getByLabel("Versión / fecha del documento").fill("Rev. E2E-1");
    await sourceCard.getByLabel("Motivo de corrección").fill("Versión cotejada contra ficha técnica del fabricante");
    await sourceCard.getByRole("button", { name: "Guardar versión" }).click();
    await expect(page).toHaveURL(/\/catalog\/technical-sources\?success=version-updated/);
    const versionAudit = await governancePrisma.auditLog.findFirstOrThrow({ where: { entityType: "PRODUCT_TECHNICAL_SOURCE", entityId: governanceFixture.sourceId, action: "UPDATE_DOCUMENT_VERSION" }, select: { actorUserId: true, after: true } });
    expect(versionAudit.actorUserId).toBe(governanceFixture.managerUserId);
    expect(JSON.parse(versionAudit.after ?? "null")).toMatchObject({ documentVersion: "Rev. E2E-1", correctionReason: "Versión cotejada contra ficha técnica del fabricante" });
    await expect(sourceCard).toContainText("Rev. E2E-1");
    await sourceCard.getByLabel(/Confirmo que revisé/).check();
    await sourceCard.getByRole("button", { name: "Aprobar fuente y publicar" }).click();
    await expect(page).toHaveURL(/\/catalog\/technical-sources\?success=source-approved/);
    const approvedSource = await governancePrisma.productTechnicalSource.findUniqueOrThrow({ where: { id: governanceFixture.sourceId }, select: { status: true, documentVersion: true, reviewedByUserId: true } });
    expect(approvedSource).toMatchObject({ status: "APPROVED", documentVersion: "Rev. E2E-1", reviewedByUserId: governanceFixture.managerUserId });
    const sourceAudit = await governancePrisma.auditLog.findFirstOrThrow({ where: { entityType: "PRODUCT_TECHNICAL_SOURCE", entityId: governanceFixture.sourceId, action: "APPROVE" }, select: { actorUserId: true, after: true } });
    expect(sourceAudit.actorUserId).toBe(governanceFixture.managerUserId);
    expect(JSON.parse(sourceAudit.after ?? "null")).toMatchObject({ status: "APPROVED", sourceId: governanceFixture.sourceId });
    await recordPhase("source-approved");

    await page.goto("/catalog/compatibility");
    await page.setViewportSize({ width: 390, height: 844 });
    await expectCatalogAccessibilityBothThemes(page);
    const newRuleForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Guardar borrador de regla" }) });
    await newRuleForm.locator('select[name="productId"]').selectOption(governanceFixture.hoseId);
    await newRuleForm.locator('select[name="compatibleProductId"]').selectOption(governanceFixture.fittingId);
    await newRuleForm.locator('select[name="ruleType"]').selectOption("PRODUCT_SUBSTITUTION");
    await newRuleForm.locator('textarea[name="description"]').fill(`La ficha ${governanceFixture.documentRef} confirma este par exacto de manguera y conexión.`);
    await newRuleForm.locator('select[name="sourceId"]').selectOption(governanceFixture.sourceId);
    await newRuleForm.getByRole("button", { name: "Guardar borrador de regla" }).click();
    await expect(page).toHaveURL(/\/catalog\/compatibility\?success=rule-draft/);
    let rule = await governancePrisma.productCompatibilityRule.findFirstOrThrow({ where: { productId: governanceFixture.hoseId, compatibleProductId: governanceFixture.fittingId, ruleType: "PRODUCT_SUBSTITUTION" } });
    governanceFixture.ruleId = rule.id;
    expect(rule).toMatchObject({ governanceStatus: "DRAFT", decision: "REQUIRES_REVIEW", sourceId: governanceFixture.sourceId });
    const createdAudit = await governancePrisma.auditLog.findFirstOrThrow({ where: { entityType: "PRODUCT_COMPATIBILITY_RULE", entityId: rule.id, action: "CREATE_DRAFT" }, select: { actorUserId: true, after: true } });
    expect(createdAudit.actorUserId).toBe(governanceFixture.managerUserId);
    expect(JSON.parse(createdAudit.after ?? "null")).toMatchObject({ rule: { id: rule.id, governanceStatus: "DRAFT" }, source: { id: governanceFixture.sourceId, documentVersion: "Rev. E2E-1" } });

    const ruleCard = page.locator("article").filter({ hasText: "PRODUCT_SUBSTITUTION" }).filter({ hasText: governanceFixture.hoseSku });
    await ruleCard.getByRole("button", { name: "Revisar (Manager)" }).click();
    await expect(page).toHaveURL(/\/catalog\/compatibility\?success=reviewed/);
    rule = await governancePrisma.productCompatibilityRule.findUniqueOrThrow({ where: { id: rule.id } });
    expect(rule.governanceStatus).toBe("REVIEWED");
    await expect(page.locator("article").filter({ hasText: "PRODUCT_SUBSTITUTION" }).filter({ hasText: governanceFixture.hoseSku }).getByRole("button", { name: "Publicar decisión (Admin)" })).toHaveCount(0);

    await loginAs(page, "SYSTEM_ADMIN", "/catalog/compatibility", "/catalog/compatibility");
    await page.goto("/catalog/compatibility");
    await expectCatalogAccessibilityBothThemes(page);
    const reviewedCard = page.locator("article").filter({ hasText: "PRODUCT_SUBSTITUTION" }).filter({ hasText: governanceFixture.hoseSku });
    await reviewedCard.getByLabel("Decisión técnica para publicar", { exact: true }).selectOption("APPROVED");
    await reviewedCard.getByRole("button", { name: "Publicar decisión (Admin)" }).click();
    await expect(page).toHaveURL(/\/catalog\/compatibility\?success=approved/);
    rule = await governancePrisma.productCompatibilityRule.findUniqueOrThrow({ where: { id: rule.id } });
    expect(rule).toMatchObject({ governanceStatus: "APPROVED", decision: "APPROVED", ruleRevision: 2 });
    const approvalAudit = await governancePrisma.auditLog.findFirstOrThrow({ where: { entityType: "PRODUCT_COMPATIBILITY_RULE", entityId: rule.id, action: "APPROVE" }, select: { actorUserId: true, after: true } });
    expect(approvalAudit.actorUserId).toBe(governanceFixture.adminUserId);
    expect(JSON.parse(approvalAudit.after ?? "null")).toMatchObject({ governanceStatus: "APPROVED", decision: "APPROVED", ruleRevision: 2 });
    await recordPhase("rule-published");

    await loginAs(page, "MANAGER", "/catalog/compatibility", "/catalog/compatibility");
    await page.goto("/catalog/compatibility");
    await page.setViewportSize({ width: 390, height: 844 });
    await expectCatalogAccessibilityBothThemes(page);
    const equivalenceForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Guardar equivalencia comercial" }) });
    await equivalenceForm.locator('select[name="productId"]').selectOption(governanceFixture.hoseId);
    await equivalenceForm.locator('select[name="equivProductId"]').selectOption(governanceFixture.fittingId);
    await equivalenceForm.locator('input[name="basisNorm"]').fill("E2E commercial equivalence");
    await equivalenceForm.locator('input[name="sourceSheet"]').fill(`Commercial note ${governanceTag}`);
    await equivalenceForm.getByRole("button", { name: "Guardar equivalencia comercial" }).click();
    await expect(page).toHaveURL(/\/catalog\/compatibility\?success=equivalence-created/);
    const equivalence = await governancePrisma.productEquivalence.findFirstOrThrow({ where: { productId: governanceFixture.hoseId, equivProductId: governanceFixture.fittingId, sourceSheet: `Commercial note ${governanceTag}` } });
    governanceFixture.equivalenceId = equivalence.id;
    expect(equivalence.active).toBe(true);
    const equivalenceAudit = await governancePrisma.auditLog.findFirstOrThrow({ where: { entityType: "PRODUCT_EQUIVALENCE", entityId: equivalence.id, action: "CREATE" }, select: { actorUserId: true, after: true } });
    expect(equivalenceAudit.actorUserId).toBe(governanceFixture.managerUserId);
    expect(JSON.parse(equivalenceAudit.after ?? "null")).toMatchObject({ technicalApproval: "NONE", equivalence: { id: equivalence.id, active: true } });
    await recordPhase("commercial-equivalence-created");

    await loginAs(page, "MANAGER", "/production/requests/new", "/production/requests/new");
    const requestParams = new URLSearchParams({
      productId: governanceFixture.fittingId,
      sku: governanceFixture.fittingSku,
      source: "equivalences",
      equivalentProductId: governanceFixture.hoseId,
      warehouseId: governanceFixture.warehouseId,
      quantity: "1",
    });
    await page.goto(`/production/requests/new?${requestParams.toString()}`);
    await page.getByLabel("Selecciona o crea el cliente").fill(`Cliente ${governanceTag}`);
    await page.getByRole("button", { name: new RegExp(`${governanceTag}-C`) }).click();
    await page.getByRole("button", { name: "Continuar a producto →" }).click();
    await page.getByRole("button", { name: "Producto directo" }).click();
    await page.getByTestId("new-order-direct-product-input").fill(governanceFixture.fittingSku);
    await page.getByRole("button", { name: new RegExp(governanceFixture.fittingSku) }).click();
    await page.getByLabel("Cantidad").fill("1");
    await page.getByRole("button", { name: "Agregar producto al pedido" }).click();
    await page.getByRole("button", { name: "Continuar a entrega →" }).click();
    await page.getByLabel("Almacén").selectOption(governanceFixture.warehouseId);
    await page.getByLabel("Fecha compromiso").fill("2026-12-31");
    await page.getByLabel("Notas del pedido").fill(`Governance snapshot ${governanceTag}`);
    await Promise.all([
      page.waitForURL(/\/production\/requests\/[^/?]+\?ok=/),
      page.getByTestId("create-order-button").click(),
    ]);
    const order = await governancePrisma.salesInternalOrder.findFirstOrThrow({ where: { notes: { contains: governanceTag } }, select: { id: true } });
    governanceFixture.orderId = order.id;
    const line = await governancePrisma.salesInternalOrderLine.findFirstOrThrow({ where: { orderId: order.id, lineKind: "PRODUCT", productId: governanceFixture.fittingId }, select: { id: true } });
    const snapshotBeforeRetirement = (await governancePrisma.salesInternalOrderLine.findUniqueOrThrow({ where: { id: line.id }, select: { technicalSelectionSnapshot: true, requestedQty: true } }));
    expect(snapshotBeforeRetirement.requestedQty).toBe(1);
    const snapshotJsonBeforeRetirement = snapshotBeforeRetirement.technicalSelectionSnapshot;
    expect(JSON.parse(snapshotJsonBeforeRetirement ?? "null")).toMatchObject({
      originalProduct: { id: governanceFixture.hoseId },
      selectedProduct: { id: governanceFixture.fittingId },
      equivalence: { id: equivalence.id },
      technicalRules: [{ id: rule.id, revision: 2, ruleType: "PRODUCT_SUBSTITUTION", source: { documentVersion: "Rev. E2E-1" } }],
      context: { warehouseId: governanceFixture.warehouseId, requestedQty: 1, availableAtSelection: 10 },
    });
    await recordPhase("order-snapshot-captured");

    await loginAs(page, "SYSTEM_ADMIN", "/catalog/compatibility", "/catalog/compatibility");
    await page.goto("/catalog/compatibility");
    const activeRuleCard = page.locator("article").filter({ hasText: "PRODUCT_SUBSTITUTION" }).filter({ hasText: governanceFixture.hoseSku });
    await activeRuleCard.getByLabel("Motivo para retirar").fill("El fabricante retiró esta revisión técnica del catálogo");
    await activeRuleCard.getByRole("button", { name: "Retirar" }).click();
    await expect(page).toHaveURL(/\/catalog\/compatibility\?success=retired/);
    rule = await governancePrisma.productCompatibilityRule.findUniqueOrThrow({ where: { id: rule.id } });
    expect(rule).toMatchObject({ governanceStatus: "RETIRED", active: false, ruleRevision: 3 });
    const snapshotAfterRetirement = (await governancePrisma.salesInternalOrderLine.findUniqueOrThrow({ where: { id: line.id }, select: { technicalSelectionSnapshot: true } })).technicalSelectionSnapshot;
    expect(snapshotAfterRetirement).toBe(snapshotJsonBeforeRetirement);
    const retireAudit = await governancePrisma.auditLog.findFirstOrThrow({ where: { entityType: "PRODUCT_COMPATIBILITY_RULE", entityId: rule.id, action: "RETIRE" }, select: { actorUserId: true, after: true } });
    expect(retireAudit.actorUserId).toBe(governanceFixture.adminUserId);
    expect(JSON.parse(retireAudit.after ?? "null")).toMatchObject({ governanceStatus: "RETIRED", active: false, ruleRevision: 3 });
    await recordPhase("retired-snapshot-preserved");
    governanceDuring = await captureGovernanceManifest();
    await testInfo.attach("catalog-governance-approved-rule.png", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  });
});
