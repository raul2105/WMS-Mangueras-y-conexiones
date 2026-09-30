import { expect, test, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { loginAs, USERS } from "./lib/auth.helpers";

const prisma = new PrismaClient();
const tag = `QA-MIX-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
const secondaryPassword = randomUUID();

const fixture = {
  warehouseId: "",
  customerId: "",
  productIds: [] as string[],
  locationIds: [] as string[],
  orderId: "",
  productionOrderId: "",
  salesUserId: "",
  warehouseOperatorId: "",
  secondaryOperatorId: "",
  technicalSourceId: "",
  shippingLocationId: "",
  warehouseCode: `${tag}-WH`,
  customerName: `Cliente continuidad ${tag}`,
  entrySku: `${tag}-IN`,
  exitSku: `${tag}-OUT`,
  hoseSku: `${tag}-HOSE`,
  directSku: `${tag}-DIRECT`,
};

async function loginFresh(page: Page, role: "MANAGER" | "SALES_EXECUTIVE" | "WAREHOUSE_OPERATOR", callbackUrl: string) {
  // CloudFront may serve the logout redirect from cache while the auth
  // session cookie remains in the browser context. Isolate each role switch
  // explicitly so the browser evidence cannot be attributed to the previous
  // actor.
  await page.context().clearCookies();
  await page.goto(`/logout?e2eNonce=${Date.now()}`);
  await page.context().clearCookies();
  await loginAs(page, role, callbackUrl, callbackUrl);
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

async function cleanupFixture() {
  const scopedOrders = fixture.warehouseId
    ? await prisma.salesInternalOrder.findMany({
        where: { warehouseId: fixture.warehouseId },
        select: { id: true, lines: { select: { id: true } }, pickLists: { select: { id: true, tasks: { select: { id: true } } } } },
      })
    : [];
  const scopedProductionOrders = fixture.warehouseId
    ? await prisma.productionOrder.findMany({
        where: { warehouseId: fixture.warehouseId },
        select: {
          id: true,
          items: { select: { id: true } },
          assemblyConfiguration: { select: { id: true } },
          assemblyWorkOrder: {
            select: {
              id: true,
              lines: { select: { id: true, pickTasks: { select: { id: true } } } },
              pickLists: { select: { id: true, tasks: { select: { id: true } } } },
            },
          },
        },
      })
    : [];
  const orderIds = scopedOrders.map((order) => order.id);
  const productionIds = scopedProductionOrders.map((order) => order.id);
  const childEntityIds = [
    ...scopedOrders.flatMap((order) => [order.id, ...order.lines.map((line) => line.id), ...order.pickLists.flatMap((list) => [list.id, ...list.tasks.map((task) => task.id)])]),
    ...scopedProductionOrders.flatMap((order) => [
      order.id,
      ...order.items.map((item) => item.id),
      ...(order.assemblyConfiguration ? [order.assemblyConfiguration.id] : []),
      ...(order.assemblyWorkOrder ? [
        order.assemblyWorkOrder.id,
        ...order.assemblyWorkOrder.lines.flatMap((line) => [line.id, ...line.pickTasks.map((task) => task.id)]),
        ...order.assemblyWorkOrder.pickLists.flatMap((list) => [list.id, ...list.tasks.map((task) => task.id)]),
      ] : []),
    ]),
  ];
  const inventoryEntityIds = fixture.productIds.flatMap((productId) => [
    ...fixture.locationIds.map((locationId) => `${productId}:${locationId}`),
    ...fixture.locationIds.flatMap((fromLocationId) => fixture.locationIds
      .filter((toLocationId) => toLocationId !== fromLocationId)
      .map((toLocationId) => `${productId}:${fromLocationId}->${toLocationId}`)),
  ]);
  const movementScope = [
    ...(orderIds.length ? [{ documentId: { in: orderIds } }] : []),
    ...(productionIds.length ? [{ documentId: { in: productionIds } }] : []),
    ...(fixture.productIds.length ? [{ productId: { in: fixture.productIds } }] : []),
    ...(fixture.locationIds.length ? [{ locationId: { in: fixture.locationIds } }] : []),
  ];
  const traceIds = fixture.warehouseId
    ? (await prisma.traceRecord.findMany({ where: { warehouseId: fixture.warehouseId }, select: { id: true } })).map(({ id }) => id)
    : [];
  if (traceIds.length) await prisma.labelPrintJob.deleteMany({ where: { traceRecordId: { in: traceIds } } });
  if (traceIds.length) await prisma.traceRecord.deleteMany({ where: { id: { in: traceIds } } });
  const auditEntityIds = [...childEntityIds, ...inventoryEntityIds, ...fixture.productIds, ...fixture.locationIds, fixture.warehouseId].filter(Boolean);
  if (auditEntityIds.length) await prisma.auditLog.deleteMany({ where: { entityId: { in: auditEntityIds } } });
  if (inventoryEntityIds.length) await prisma.syncEvent.deleteMany({ where: { entityType: "INVENTORY", entityId: { in: inventoryEntityIds } } });

  if (orderIds.length || productionIds.length || fixture.productIds.length || fixture.locationIds.length) {
    await prisma.inventoryMovement.deleteMany({
      where: {
        OR: movementScope,
      },
    });
  }
  if (productionIds.length) {
    await prisma.auditLog.deleteMany({ where: { entityId: { in: productionIds } } });
    await prisma.productionOrder.deleteMany({ where: { id: { in: productionIds } } });
  }
  if (orderIds.length) {
    await prisma.salesInternalOrder.deleteMany({ where: { id: { in: orderIds } } });
  }
  if (fixture.productIds.length) {
    await prisma.inventory.deleteMany({ where: { productId: { in: fixture.productIds } } });
    await prisma.productCompatibilityRule.deleteMany({ where: { OR: [{ productId: { in: fixture.productIds } }, { compatibleProductId: { in: fixture.productIds } }] } });
    await prisma.productTechnicalAttribute.deleteMany({ where: { productId: { in: fixture.productIds } } });
    await prisma.product.deleteMany({ where: { id: { in: fixture.productIds } } });
  }
  if (fixture.technicalSourceId) await prisma.productTechnicalSource.delete({ where: { id: fixture.technicalSourceId } });
  if (fixture.locationIds.length) {
    await prisma.location.deleteMany({ where: { id: { in: fixture.locationIds } } });
  }
  if (fixture.customerId) {
    await prisma.customer.deleteMany({ where: { id: fixture.customerId } });
  }
  if (fixture.warehouseId) {
    await prisma.warehouse.deleteMany({ where: { id: fixture.warehouseId } });
  }
  if (fixture.secondaryOperatorId) {
    await prisma.user.delete({ where: { id: fixture.secondaryOperatorId } });
  }

  const residualCounts = await Promise.all([
    fixture.warehouseId ? prisma.warehouse.count({ where: { id: fixture.warehouseId } }) : 0,
    fixture.customerId ? prisma.customer.count({ where: { id: fixture.customerId } }) : 0,
    fixture.productIds.length ? prisma.product.count({ where: { id: { in: fixture.productIds } } }) : 0,
    fixture.locationIds.length ? prisma.location.count({ where: { id: { in: fixture.locationIds } } }) : 0,
    orderIds.length ? prisma.salesInternalOrder.count({ where: { id: { in: orderIds } } }) : 0,
    productionIds.length ? prisma.productionOrder.count({ where: { id: { in: productionIds } } }) : 0,
    fixture.secondaryOperatorId ? prisma.user.count({ where: { id: fixture.secondaryOperatorId } }) : 0,
    auditEntityIds.length ? prisma.auditLog.count({ where: { entityId: { in: auditEntityIds } } }) : 0,
    inventoryEntityIds.length ? prisma.syncEvent.count({ where: { entityType: "INVENTORY", entityId: { in: inventoryEntityIds } } }) : 0,
    traceIds.length ? prisma.traceRecord.count({ where: { id: { in: traceIds } } }) : 0,
    traceIds.length ? prisma.labelPrintJob.count({ where: { traceRecordId: { in: traceIds } } }) : 0,
    movementScope.length ? prisma.inventoryMovement.count({ where: { OR: movementScope } }) : 0,
    fixture.productIds.length ? prisma.inventory.count({ where: { productId: { in: fixture.productIds } } }) : 0,
  ]);
  expect(residualCounts).toEqual(Array(residualCounts.length).fill(0));
}

test.describe.serial("mixed sales order continuity", () => {
  test.beforeAll(async () => {
    const salesUser = await prisma.user.findUniqueOrThrow({
      where: { email: USERS.SALES_EXECUTIVE.email },
      select: { id: true },
    });
    fixture.salesUserId = salesUser.id;
    fixture.warehouseOperatorId = (await prisma.user.findUniqueOrThrow({
      where: { email: USERS.WAREHOUSE_OPERATOR.email },
      select: { id: true },
    })).id;

    const operatorRole = await prisma.role.findUniqueOrThrow({ where: { code: "WAREHOUSE_OPERATOR" }, select: { id: true } });
    const secondaryOperator = await prisma.user.create({
      data: {
        email: `${tag.toLowerCase()}-operator@qa.invalid`,
        name: `Operador secundario ${tag}`,
        passwordHash: await bcrypt.hash(secondaryPassword, 10),
        isActive: true,
        userRoles: { create: [{ roleId: operatorRole.id }] },
      },
      select: { id: true },
    });
    fixture.secondaryOperatorId = secondaryOperator.id;

    const warehouse = await prisma.warehouse.create({
      data: { code: fixture.warehouseCode, name: `Almacén ${tag}`, isActive: true },
    });
    fixture.warehouseId = warehouse.id;

    const customer = await prisma.customer.create({
      data: { code: `${tag}-C`, name: fixture.customerName, isActive: true },
    });
    fixture.customerId = customer.id;

    const locations = await Promise.all([
      prisma.location.create({ data: { code: `${tag}-STO`, name: "Almacenaje QA", zone: "QA", usageType: "STORAGE", isActive: true, warehouseId: warehouse.id } }),
      prisma.location.create({ data: { code: `${tag}-STG`, name: "Staging QA", zone: "QA", usageType: "STAGING", isActive: true, warehouseId: warehouse.id } }),
      prisma.location.create({ data: { code: `${tag}-WIP`, name: "WIP QA", zone: "QA", usageType: "WIP", isActive: true, warehouseId: warehouse.id } }),
      prisma.location.create({ data: { code: `${tag}-SHIP`, name: "Embarque QA", zone: "QA", usageType: "SHIPPING", isActive: true, warehouseId: warehouse.id } }),
    ]);
    fixture.locationIds.push(...locations.map((location) => location.id));
    fixture.shippingLocationId = locations[3].id;

    const [entry, exit, hose, direct] = await Promise.all([
      prisma.product.create({ data: { sku: fixture.entrySku, name: `Conexión entrada ${tag}`, type: "FITTING" } }),
      prisma.product.create({ data: { sku: fixture.exitSku, name: `Conexión salida ${tag}`, type: "FITTING" } }),
      prisma.product.create({ data: { sku: fixture.hoseSku, name: `Manguera hidráulica ${tag}`, type: "HOSE", unitLabel: "m" } }),
      prisma.product.create({ data: { sku: fixture.directSku, name: `Producto directo ${tag}`, type: "ACCESSORY" } }),
    ]);
    fixture.productIds.push(entry.id, exit.id, hose.id, direct.id);

    const technicalSource = await prisma.productTechnicalSource.create({
      data: {
        supplierName: `Proveedor QA ${tag}`,
        documentRef: `FICHA-${tag}`,
        documentVersion: "1",
        status: "APPROVED",
        reviewedAt: new Date(),
      },
    });
    fixture.technicalSourceId = technicalSource.id;
    await prisma.productCompatibilityRule.createMany({
      data: [
        { productId: entry.id, compatibleProductId: hose.id, ruleType: "ASSEMBLY", description: `Regla aprobada QA ${tag}`, severity: "INFO", decision: "APPROVED", governanceStatus: "APPROVED", sourceId: technicalSource.id, maxWorkingPressureBar: 250, minTemperatureC: -20, maxTemperatureC: 90, medium: "Aceite hidráulico", application: "Línea de retorno", assemblyMethod: "Prensado según ficha técnica" },
        { productId: hose.id, compatibleProductId: exit.id, ruleType: "ASSEMBLY", description: `Regla aprobada QA ${tag}`, severity: "INFO", decision: "APPROVED", governanceStatus: "APPROVED", sourceId: technicalSource.id, maxWorkingPressureBar: 250, minTemperatureC: -20, maxTemperatureC: 90, medium: "Aceite hidráulico", application: "Línea de retorno", assemblyMethod: "Prensado según ficha técnica" },
      ],
    });

    await prisma.inventory.createMany({
      data: [
        { productId: entry.id, locationId: locations[0].id, quantity: 10, reserved: 0, available: 10 },
        { productId: exit.id, locationId: locations[0].id, quantity: 10, reserved: 0, available: 10 },
        { productId: hose.id, locationId: locations[0].id, quantity: 20, reserved: 0, available: 20 },
        { productId: direct.id, locationId: locations[0].id, quantity: 10, reserved: 0, available: 10 },
      ],
    });
  });

  test.afterAll(async () => {
    await cleanupFixture();
    await prisma.$disconnect();
  });

  test("V2/V6/V8 direct order reserves, fulfills under assignment, and prepares/delivers idempotently", async ({ browser, page }) => {
    await loginAs(page, "SALES_EXECUTIVE", "/production/requests/new", "/production/requests/new");
    await page.getByLabel("Selecciona o crea el cliente").fill(fixture.customerName);
    await page.getByRole("button", { name: new RegExp(fixture.customerName) }).click();
    await page.getByRole("button", { name: "Continuar a producto →" }).click();
    await page.getByRole("button", { name: "Producto directo" }).click();
    await page.getByLabel("Almacén para surtido").selectOption(fixture.warehouseId);
    await page.getByTestId("new-order-direct-product-input").fill(fixture.directSku);
    await page.getByRole("button", { name: new RegExp(fixture.directSku) }).click();
    await page.getByRole("button", { name: "Agregar producto al pedido" }).click();
    await page.getByRole("button", { name: "Continuar a entrega →" }).click();
    await page.getByLabel("Fecha compromiso").fill("2026-12-31");
    await Promise.all([
      page.waitForURL(/\/production\/requests\/[^/?]+\?ok=/),
      page.getByTestId("create-order-button").click(),
    ]);

    const directOrder = await prisma.salesInternalOrder.findFirstOrThrow({
      where: { warehouseId: fixture.warehouseId, customerId: fixture.customerId },
      orderBy: { createdAt: "desc" },
      include: { lines: true },
    });
    expect(directOrder.lines).toHaveLength(1);
    expect(directOrder.lines[0]?.lineKind).toBe("PRODUCT");
    const directInventory = await prisma.inventory.findFirstOrThrow({ where: { productId: fixture.productIds[3], locationId: fixture.locationIds[0] } });
    expect(directInventory.reserved).toBe(directOrder.lines[0]?.requestedQty);
    const draftPickList = await prisma.salesInternalOrderPickList.findFirstOrThrow({ where: { orderId: directOrder.id }, include: { tasks: true } });
    expect(draftPickList.status).toBe("DRAFT");
    expect(draftPickList.tasks).toHaveLength(1);

    await loginFresh(page, "MANAGER", `/production/requests/${directOrder.id}`);
    await page.getByRole("button", { name: "Confirmar pedido" }).click();
    await page.getByTestId("manager-assign-order").locator("select").selectOption(fixture.salesUserId);
    await page.getByTestId("manager-assign-order").getByRole("button", { name: /Asignar vendedor|Reasignar antes de toma/ }).click();

    await loginFresh(page, "SALES_EXECUTIVE", `/production/requests/${directOrder.id}`);
    await page.getByRole("button", { name: /Tomar pedido|Continuar pedido/ }).click();

    await loginFresh(page, "WAREHOUSE_OPERATOR", `/production/fulfillment/${directOrder.id}`);
    const pickDownload = page.waitForEvent("download");
    await page.getByRole("link", { name: "Descargar lista de surtido" }).click();
    expect((await pickDownload).suggestedFilename()).toMatch(/^surtido-.*\.pdf$/);
    await page.getByRole("button", { name: "Liberar surtido directo" }).click();
    await loginFresh(page, "MANAGER", `/production/fulfillment/${directOrder.id}`);
    const requireAssignment = page.locator("form").filter({ hasText: "¿Requiere asignación manual?" });
    await requireAssignment.locator('input[name="reason"]').fill("V2/V6 ownership fixture");
    await requireAssignment.getByRole("button", { name: "Exigir asignación" }).click();
    const assignmentForm = page.locator("form").filter({ hasText: "Asignación requerida" });
    await assignmentForm.locator('select[name="assigneeUserId"]').selectOption(fixture.warehouseOperatorId);
    await assignmentForm.getByRole("button", { name: "Asignar tareas" }).click();

    await loginFresh(page, "WAREHOUSE_OPERATOR", `/production/fulfillment/${directOrder.id}`);
    await page.getByRole("button", { name: "Tomar tareas" }).click();
    const operatorId = fixture.warehouseOperatorId;
    const claimedTask = await prisma.salesInternalOrderPickTask.findFirstOrThrow({ where: { orderLine: { orderId: directOrder.id } } });
    expect(claimedTask.claimedByUserId).toBe(operatorId);
    expect(claimedTask.assignedToUserId).toBe(operatorId);
    expect(claimedTask.assignmentMode).toBe("MANAGER_REQUIRED");
    const pickList = await prisma.salesInternalOrderPickList.findFirstOrThrow({
      where: { orderId: directOrder.id },
      include: { targetLocation: { select: { code: true, usageType: true } } },
    });
    expect(pickList.targetLocation.usageType).toBe("STAGING");
    await page.locator('input[name^="scanRef__"]').first().fill(fixture.directSku);
    await page.getByRole("button", { name: "Confirmar surtido" }).click();
    await expect(page.getByTestId("fulfillment-next-action")).toContainText("Surtido directo terminado");
    await expect(prisma.salesInternalOrderPickList.findFirstOrThrow({ where: { orderId: directOrder.id }, select: { status: true } })).resolves.toMatchObject({ status: "COMPLETED" });
    await page.goto(`/production/requests/${directOrder.id}`);
    await expect(page.getByTestId("prepare-for-delivery-form")).toBeVisible();

    await loginFresh(page, "SALES_EXECUTIVE", `/production/requests/${directOrder.id}`);
    await expect(page.getByTestId("prepare-for-delivery-form")).toHaveCount(0);
    await loginWithCredentials(page, `${tag.toLowerCase()}-operator@qa.invalid`, secondaryPassword, `/production/requests/${directOrder.id}`);
    await expect(page.getByTestId("prepare-for-delivery-form")).toHaveCount(0);
    await expect(prisma.salesInternalOrder.findUniqueOrThrow({ where: { id: directOrder.id }, select: { preparedForDeliveryAt: true } })).resolves.toMatchObject({ preparedForDeliveryAt: null });
    await expect(prisma.auditLog.count({ where: { entityId: directOrder.id, action: "MARK_PREPARED_FOR_DELIVERY" } })).resolves.toBe(0);
    await loginFresh(page, "WAREHOUSE_OPERATOR", `/production/requests/${directOrder.id}`);
    const preparationForm = page.getByTestId("prepare-for-delivery-form");
    const preparedLocation = preparationForm.locator('select[name="preparedLocationId"]');
    await preparedLocation.evaluate((select, invalidId) => {
      const option = document.createElement("option");
      option.value = invalidId;
      option.textContent = "QA STORAGE tampered";
      select.append(option);
    }, fixture.locationIds[0]);
    await preparedLocation.selectOption(fixture.locationIds[0]);
    await Promise.all([
      page.waitForURL((url) => url.pathname.endsWith(`/production/requests/${directOrder.id}`) && url.searchParams.has("error")),
      page.getByRole("button", { name: "Preparar para entrega" }).click(),
    ]);
    await expect(page).toHaveURL(/error=/);
    await expect(prisma.salesInternalOrder.findUniqueOrThrow({ where: { id: directOrder.id }, select: { preparedForDeliveryAt: true } })).resolves.toMatchObject({ preparedForDeliveryAt: null });
    await expect(prisma.auditLog.count({ where: { entityId: directOrder.id, action: "MARK_PREPARED_FOR_DELIVERY" } })).resolves.toBe(0);
    await preparedLocation.selectOption(fixture.shippingLocationId);
    await page.getByLabel("Nota (opcional)").fill("Fixture directo preparado para entrega");

    const duplicatePrepContext = await browser.newContext();
    const duplicatePrepPage = await duplicatePrepContext.newPage();
    try {
      await loginAs(duplicatePrepPage, "WAREHOUSE_OPERATOR", `/production/requests/${directOrder.id}`, `/production/requests/${directOrder.id}`);
      const duplicatePrepLocation = duplicatePrepPage.locator('[data-testid="prepare-for-delivery-form"] select[name="preparedLocationId"]');
      await duplicatePrepLocation.selectOption(fixture.shippingLocationId);
      await duplicatePrepPage.getByLabel("Nota (opcional)").fill("Fixture directo preparado para entrega");
      await Promise.all([
        page.waitForURL(/\?ok=/),
        duplicatePrepPage.waitForURL(/\?ok=/),
        page.getByRole("button", { name: "Preparar para entrega" }).click(),
        duplicatePrepPage.getByRole("button", { name: "Preparar para entrega" }).click(),
      ]);
    } finally {
      await duplicatePrepContext.close();
    }
    await expect(page.getByTestId("prepared-for-delivery-summary")).toContainText("Preparado para entrega");

    await loginFresh(page, "SALES_EXECUTIVE", `/production/requests/${directOrder.id}`);
    await page.getByLabel("Recibió *").fill("Cliente QA directo");
    await page.getByLabel("Método de entrega *").fill("Entrega directa");
    const movementsBeforeDelivery = await prisma.inventoryMovement.count({ where: { documentId: directOrder.id } });
    const duplicateDeliveryContext = await browser.newContext();
    const duplicateDeliveryPage = await duplicateDeliveryContext.newPage();
    try {
      await loginAs(duplicateDeliveryPage, "SALES_EXECUTIVE", `/production/requests/${directOrder.id}`, `/production/requests/${directOrder.id}`);
      await duplicateDeliveryPage.getByLabel("Recibió *").fill("Cliente QA directo");
      await duplicateDeliveryPage.getByLabel("Método de entrega *").fill("Entrega directa");
      await Promise.all([
        page.waitForURL(/\?ok=/),
        duplicateDeliveryPage.waitForURL(/\?ok=/),
        page.getByRole("button", { name: "Confirmar entrega al cliente" }).click(),
        duplicateDeliveryPage.getByRole("button", { name: "Confirmar entrega al cliente" }).click(),
      ]);
    } finally {
      await duplicateDeliveryContext.close();
    }
    const deliveryDownload = page.waitForEvent("download");
    await page.getByRole("link", { name: "Descargar comprobante de entrega" }).click();
    expect((await deliveryDownload).suggestedFilename()).toMatch(/^entrega-.*\.pdf$/);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/production/requests/${directOrder.id}`);
    await expect(page.getByRole("link", { name: "Descargar comprobante de entrega" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    const finalOrder = await prisma.salesInternalOrder.findUniqueOrThrow({
      where: { id: directOrder.id },
      select: { preparedForDeliveryAt: true, preparedForDeliveryNotes: true, preparedForDeliveryByUserId: true, preparedForDeliveryLocation: { select: { code: true } }, deliveredToCustomerAt: true, deliveredByUserId: true },
    });
    const [preparedAudit, deliveredAudit] = await Promise.all([
      prisma.auditLog.findFirst({ where: { entityId: directOrder.id, action: "MARK_PREPARED_FOR_DELIVERY" }, orderBy: { createdAt: "desc" } }),
      prisma.auditLog.findFirst({ where: { entityId: directOrder.id, action: "MARK_DELIVERED_TO_CUSTOMER" }, orderBy: { createdAt: "desc" } }),
    ]);
    expect(finalOrder.preparedForDeliveryAt).toBeTruthy();
    expect(finalOrder.preparedForDeliveryLocation?.code).toBe(`${tag}-SHIP`);
    expect(finalOrder.preparedForDeliveryNotes).toBe("Fixture directo preparado para entrega");
    expect(finalOrder.deliveredToCustomerAt).toBeTruthy();
    expect(finalOrder.preparedForDeliveryByUserId).toBe(operatorId);
    expect(preparedAudit?.actorUserId).toBe(operatorId);
    expect(deliveredAudit?.actorUserId).toBe(finalOrder.deliveredByUserId);
    expect(deliveredAudit?.actorUserId).toBe(fixture.salesUserId);
    expect(await prisma.auditLog.count({ where: { entityId: directOrder.id, action: "MARK_PREPARED_FOR_DELIVERY" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityId: directOrder.id, action: "MARK_DELIVERED_TO_CUSTOMER" } })).toBe(1);
    expect(await prisma.inventoryMovement.count({ where: { documentId: directOrder.id } })).toBeGreaterThan(0);
    expect(await prisma.inventoryMovement.count({ where: { documentId: directOrder.id } })).toBe(movementsBeforeDelivery + 1);
    expect(await prisma.inventoryMovement.count({ where: { documentType: "SALES_INTERNAL_ORDER_DELIVERY", documentId: directOrder.id, type: "OUT" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityId: directOrder.id, action: "MARK_PREPARED_FOR_DELIVERY" } })).toBe(1);
  });

  test("completes an assembly-only order without requiring a direct pick", async ({ page }) => {
    await loginAs(page, "SALES_EXECUTIVE", "/production/requests/new", "/production/requests/new");
    await page.getByLabel("Selecciona o crea el cliente").fill(fixture.customerName);
    await page.getByRole("button", { name: new RegExp(fixture.customerName) }).click();
    await page.getByRole("button", { name: "Continuar a producto →" }).click();
    await page.getByRole("button", { name: "Ensamble" }).click();
    await page.locator('select[name="warehouseId"]').selectOption(fixture.warehouseId);
    await page.getByTestId("new-order-entry-fitting-input").fill(fixture.entrySku);
    await page.getByRole("button", { name: new RegExp(fixture.entrySku) }).click();
    await page.getByTestId("new-order-exit-fitting-input").fill(fixture.exitSku);
    await page.getByRole("button", { name: new RegExp(fixture.exitSku) }).click();
    await page.getByTestId("new-order-hose-input").fill(fixture.hoseSku);
    await page.getByRole("button", { name: new RegExp(fixture.hoseSku) }).click();
    await page.getByLabel("Presión de trabajo (bar)").fill("180");
    await page.getByLabel("Temperatura de operación (°C)").fill("60");
    await page.getByLabel("Medio o fluido").fill("Aceite hidráulico");
    await page.getByLabel("Aplicación").fill("Línea de retorno");
    await page.getByLabel("Método de ensamble").fill("Prensado según ficha técnica");
    await page.getByLabel("Longitud por ensamble").fill("2");
    await page.getByLabel("Cantidad de ensambles").fill("1");
    await page.getByRole("button", { name: "Agregar ensamble al pedido" }).click();
    await page.getByRole("button", { name: "Continuar a entrega →" }).click();
    await page.getByLabel("Fecha compromiso").fill("2026-12-31");
    await Promise.all([
      page.waitForURL(/\/production\/requests\/[^/?]+\?ok=/),
      page.getByTestId("create-order-button").click(),
    ]);

    const assemblyOrder = await prisma.salesInternalOrder.findFirstOrThrow({
      where: { warehouseId: fixture.warehouseId, customerId: fixture.customerId },
      orderBy: { createdAt: "desc" },
      include: { lines: true },
    });
    expect(assemblyOrder.lines).toHaveLength(1);
    expect(assemblyOrder.lines[0]?.lineKind).toBe("CONFIGURED_ASSEMBLY");

    await loginFresh(page, "MANAGER", `/production/requests/${assemblyOrder.id}`);
    await page.getByRole("button", { name: "Confirmar pedido" }).click();
    await page.getByTestId("manager-assign-order").locator("select").selectOption(fixture.salesUserId);
    await page.getByTestId("manager-assign-order").getByRole("button", { name: /Asignar vendedor|Reasignar antes de toma/ }).click();

    await loginFresh(page, "SALES_EXECUTIVE", `/production/requests/${assemblyOrder.id}`);
    await page.getByRole("button", { name: /Tomar pedido|Continuar pedido/ }).click();

    await loginFresh(page, "WAREHOUSE_OPERATOR", `/production/fulfillment/${assemblyOrder.id}`);
    const continueAssembly = page.getByRole("link", { name: /Continuar ensamble/ });
    await expect(continueAssembly).toBeVisible();
    await continueAssembly.click();
    const production = await prisma.productionOrder.findFirstOrThrow({
      where: { sourceDocumentId: assemblyOrder.id },
      include: { assemblyWorkOrder: { include: { pickLists: true } } },
    });
    expect(await prisma.productionOrder.count({ where: { sourceDocumentId: assemblyOrder.id } })).toBe(1);
    expect(production.status).toBe("ABIERTA");
    expect(production.assemblyWorkOrder?.reservationStatus).toBe("RESERVED");
    expect(production.assemblyWorkOrder?.pickLists[0]?.status).toBe("DRAFT");
    await expect(page).toHaveURL(new RegExp(`/production/orders/${production.id}`));
    await page.goto(`/production/requests/${assemblyOrder.id}`);
    await expect(page.getByTestId("prepare-for-delivery-form")).toHaveCount(0);
    await page.goto(`/production/orders/${production.id}`);
    await page.getByRole("button", { name: "Liberar materiales" }).click();
    await page.getByLabel("Operador").fill(`Operador ${tag}`);
    await page.getByTestId("confirm-assembly-materials").click({ noWaitAfter: true });
    await expect(page.getByText(/orden cerrada\/consumida/i)).toBeVisible({ timeout: 60_000 });
    await page.getByRole("link", { name: "Volver al pedido" }).click();
    await expect(page.getByTestId("prepare-for-delivery-form")).toBeVisible();
    expect(await prisma.auditLog.count({ where: { entityId: assemblyOrder.id, action: "MARK_PREPARED_FOR_DELIVERY" } })).toBe(0);
    await page.getByTestId("prepare-for-delivery-form").locator('select[name="preparedLocationId"]').selectOption(fixture.shippingLocationId);
    await page.getByRole("button", { name: "Preparar para entrega" }).click();
    await expect(page.getByTestId("prepared-for-delivery-summary")).toContainText("Preparado para entrega");

    await loginFresh(page, "SALES_EXECUTIVE", `/production/requests/${assemblyOrder.id}`);
    await page.getByLabel("Recibió *").fill("Cliente QA ensamble");
    await page.getByLabel("Método de entrega *").fill("Entrega directa");
    await page.getByRole("button", { name: "Confirmar entrega al cliente" }).click();
    await expect(page.getByRole("link", { name: "Descargar comprobante de entrega" })).toBeVisible();
    const finalOrder = await prisma.salesInternalOrder.findUniqueOrThrow({
      where: { id: assemblyOrder.id },
      select: { preparedForDeliveryAt: true, preparedForDeliveryByUserId: true, preparedForDeliveryLocation: { select: { usageType: true } }, deliveredToCustomerAt: true },
    });
    expect(finalOrder.preparedForDeliveryAt).toBeTruthy();
    expect(finalOrder.preparedForDeliveryByUserId).toBe((await prisma.user.findUniqueOrThrow({ where: { email: USERS.WAREHOUSE_OPERATOR.email }, select: { id: true } })).id);
    expect(finalOrder.preparedForDeliveryLocation?.usageType).toBe("SHIPPING");
    expect(finalOrder.deliveredToCustomerAt).toBeTruthy();
    expect(await prisma.auditLog.count({ where: { entityId: assemblyOrder.id, action: "MARK_PREPARED_FOR_DELIVERY" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityId: assemblyOrder.id, action: "COMPLETE_WAREHOUSE_ASSEMBLY" } })).toBe(1);
  });

  test("maintains one continuous route from a mixed order to delivery", async ({ page }) => {
    await loginAs(page, "SALES_EXECUTIVE", "/production/requests/new", "/production/requests/new");
    await page.getByLabel("Selecciona o crea el cliente").fill(fixture.customerName);
    await page.getByRole("button", { name: new RegExp(fixture.customerName) }).click();
    await page.getByRole("button", { name: "Continuar a producto →" }).click();

    await page.getByRole("button", { name: "Ensamble" }).click();
    await page.locator('select[name="warehouseId"]').selectOption(fixture.warehouseId);
    await page.getByTestId("new-order-entry-fitting-input").fill(fixture.entrySku);
    await page.getByRole("button", { name: new RegExp(fixture.entrySku) }).click();
    await page.getByTestId("new-order-exit-fitting-input").fill(fixture.exitSku);
    await page.getByRole("button", { name: new RegExp(fixture.exitSku) }).click();
    await page.getByTestId("new-order-hose-input").fill(fixture.hoseSku);
    await page.getByRole("button", { name: new RegExp(fixture.hoseSku) }).click();
    await page.getByLabel("Presión de trabajo (bar)").fill("180");
    await page.getByLabel("Temperatura de operación (°C)").fill("60");
    await page.getByLabel("Medio o fluido").fill("Aceite hidráulico");
    await page.getByLabel("Aplicación").fill("Línea de retorno");
    await page.getByLabel("Método de ensamble").fill("Prensado según ficha técnica");
    await page.getByLabel("Longitud por ensamble").fill("2");
    await page.getByLabel("Cantidad de ensambles").fill("1");
    await page.getByRole("button", { name: "Agregar ensamble al pedido" }).click();

    await page.getByRole("button", { name: "Producto directo" }).click();
    await page.getByTestId("new-order-direct-product-input").fill(fixture.directSku);
    await page.getByRole("button", { name: new RegExp(fixture.directSku) }).click();
    await page.getByRole("button", { name: "Agregar producto al pedido" }).click();
    await page.getByRole("button", { name: "Continuar a entrega →" }).click();
    await page.getByLabel("Fecha compromiso").fill("2026-12-31");
    await Promise.all([
      page.waitForURL(/\/production\/requests\/[^/?]+\?ok=/),
      page.getByTestId("create-order-button").click(),
    ]);

    const order = await prisma.salesInternalOrder.findFirstOrThrow({
      where: { warehouseId: fixture.warehouseId, customerId: fixture.customerId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    fixture.orderId = order.id;

    await loginFresh(page, "MANAGER", `/production/requests/${order.id}`);
    await page.getByRole("button", { name: "Confirmar pedido" }).click();
    await page.getByTestId("manager-assign-order").locator("select").selectOption(fixture.salesUserId);
    await page.getByTestId("manager-assign-order").getByRole("button", { name: /Asignar vendedor|Reasignar antes de toma/ }).click();

    await loginFresh(page, "SALES_EXECUTIVE", `/production/requests/${order.id}`);
    await page.getByRole("button", { name: /Tomar pedido|Continuar pedido/ }).click();
    await expect(page.getByTestId("request-work-board")).toContainText("Productos directos");
    await expect(page.getByTestId("request-work-board")).toContainText("Ensamble 1");

    await loginFresh(page, "WAREHOUSE_OPERATOR", `/production/fulfillment/${order.id}`);
    await page.getByRole("button", { name: "Liberar surtido directo" }).click();
    await page.getByRole("button", { name: "Tomar tareas" }).click();
    await page.locator('input[name^="scanRef__"]').first().fill(fixture.directSku);
    await page.getByRole("button", { name: "Confirmar surtido" }).click();
    const continueAssembly = page.getByRole("link", { name: /Continuar ensamble/ });
    await expect(page.getByTestId("fulfillment-next-action")).toContainText("Continuar ensamble");
    await expect(continueAssembly).toHaveAttribute("href", /\/production\/orders\//);
    await page.goto(`/production/requests/${order.id}`);
    await expect(page.getByTestId("prepare-for-delivery-form")).toHaveCount(0);
    const pendingProduction = await prisma.productionOrder.findFirstOrThrow({
      where: { sourceDocumentId: order.id },
      select: { status: true },
    });
    expect(pendingProduction.status).toBe("ABIERTA");
    expect(await prisma.salesInternalOrderPickList.count({ where: { orderId: order.id, status: "COMPLETED" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityId: order.id, action: "MARK_PREPARED_FOR_DELIVERY" } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { entityId: order.id, action: "MARK_DELIVERED_TO_CUSTOMER" } })).toBe(0);
    await page.goto(`/production/fulfillment/${order.id}`);
    await expect(page.getByRole("link", { name: /Continuar ensamble/ })).toBeVisible();
    await page.getByRole("link", { name: /Continuar ensamble/ }).click();

    const production = await prisma.productionOrder.findFirstOrThrow({
      where: { sourceDocumentId: order.id },
      select: { id: true },
    });
    fixture.productionOrderId = production.id;
    await expect(page).toHaveURL(new RegExp(`/production/orders/${production.id}`));
    await expect(page.getByTestId("assembly-work-steps")).toContainText("Libera materiales");
    await Promise.all([
      page.waitForURL(/\?ok=/),
      page.getByRole("button", { name: "Liberar materiales" }).click(),
    ]);
    await page.getByLabel("Operador").fill(`Operador ${tag}`);
    const confirmMaterials = page.getByTestId("confirm-assembly-materials");
    await expect(confirmMaterials).toBeEnabled();
    await confirmMaterials.scrollIntoViewIfNeeded();
    await confirmMaterials.click({ noWaitAfter: true });
    await expect(page.getByText(/orden cerrada\/consumida/i)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("link", { name: "Volver al pedido" })).toHaveAttribute("href", `/production/requests/${order.id}`);
    await page.getByRole("link", { name: "Volver al pedido" }).click();
    await expect(page.getByTestId("prepare-for-delivery-form")).toBeVisible();
    await page.getByTestId("prepare-for-delivery-form").locator('select[name="preparedLocationId"]').selectOption(fixture.shippingLocationId);
    await Promise.all([
      page.waitForURL(/\?ok=/),
      page.getByRole("button", { name: "Preparar para entrega" }).click(),
    ]);
    await expect(page.getByTestId("prepared-for-delivery-summary")).toContainText("Preparado para entrega");

    await loginFresh(page, "SALES_EXECUTIVE", `/production/requests/${order.id}`);
    await expect(page.getByText("Preparado para entrega", { exact: true }).first()).toBeVisible();
    await page.getByLabel("Recibió *").fill("Cliente QA mixto");
    await page.getByLabel("Método de entrega *").fill("Entrega directa");
    await Promise.all([
      page.waitForURL(/\?ok=/),
      page.getByRole("button", { name: "Confirmar entrega al cliente" }).click(),
    ]);

    const [finalOrder, finalAssembly] = await Promise.all([
      prisma.salesInternalOrder.findUniqueOrThrow({ where: { id: order.id }, select: { preparedForDeliveryAt: true, preparedForDeliveryByUserId: true, preparedForDeliveryLocation: { select: { code: true, usageType: true } }, deliveredToCustomerAt: true, deliveredByUserId: true } }),
      prisma.productionOrder.findUniqueOrThrow({ where: { id: production.id }, select: { status: true } }),
    ]);
    const [preparedAudit, deliveredAudit] = await Promise.all([
      prisma.auditLog.findFirst({ where: { entityId: order.id, action: "MARK_PREPARED_FOR_DELIVERY" } }),
      prisma.auditLog.findFirst({ where: { entityId: order.id, action: "MARK_DELIVERED_TO_CUSTOMER" } }),
    ]);
    expect(finalOrder.preparedForDeliveryAt).toBeTruthy();
    expect(finalOrder.preparedForDeliveryLocation?.code).toBe(`${tag}-SHIP`);
    expect(finalOrder.preparedForDeliveryLocation?.usageType).toBe("SHIPPING");
    expect(finalOrder.preparedForDeliveryByUserId).toBe((await prisma.user.findUniqueOrThrow({ where: { email: USERS.WAREHOUSE_OPERATOR.email }, select: { id: true } })).id);
    expect(finalOrder.deliveredToCustomerAt).toBeTruthy();
    expect(finalOrder.deliveredByUserId).toBe(fixture.salesUserId);
    expect(preparedAudit?.actorUserId).toBe(finalOrder.preparedForDeliveryByUserId);
    expect(deliveredAudit?.actorUserId).toBe(finalOrder.deliveredByUserId);
    expect(await prisma.auditLog.count({ where: { entityId: order.id, action: "MARK_PREPARED_FOR_DELIVERY" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityId: order.id, action: "MARK_DELIVERED_TO_CUSTOMER" } })).toBe(1);
    expect(await prisma.inventoryMovement.count({ where: { documentId: order.id } })).toBeGreaterThan(0);
    expect(finalAssembly.status).toBe("COMPLETADA");
    expect(await prisma.salesInternalOrderPickList.count({ where: { orderId: order.id, status: "COMPLETED" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityId: order.id, action: "COMPLETE_WAREHOUSE_ASSEMBLY" } })).toBe(1);
  });
});
