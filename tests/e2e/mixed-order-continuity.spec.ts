import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { loginAs } from "./lib/auth.helpers";

const prisma = new PrismaClient();
const tag = `QA-MIX-${Date.now().toString().slice(-8)}`;

const fixture = {
  warehouseId: "",
  customerId: "",
  productIds: [] as string[],
  locationIds: [] as string[],
  orderId: "",
  productionOrderId: "",
  salesUserId: "",
  shippingLocationId: "",
  warehouseCode: `${tag}-WH`,
  customerName: `Cliente continuidad ${tag}`,
  entrySku: `${tag}-IN`,
  exitSku: `${tag}-OUT`,
  hoseSku: `${tag}-HOSE`,
  directSku: `${tag}-DIRECT`,
};

async function loginFresh(page: Page, role: "MANAGER" | "SALES_EXECUTIVE" | "WAREHOUSE_OPERATOR", callbackUrl: string) {
  await page.getByRole("link", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login/);
  await loginAs(page, role, callbackUrl, callbackUrl);
}

async function cleanupFixture() {
  const scopedOrders = fixture.warehouseId
    ? await prisma.salesInternalOrder.findMany({
        where: { warehouseId: fixture.warehouseId },
        select: { id: true },
      })
    : [];
  const scopedProductionOrders = fixture.warehouseId
    ? await prisma.productionOrder.findMany({
        where: { warehouseId: fixture.warehouseId },
        select: { id: true },
      })
    : [];
  const orderIds = scopedOrders.map((order) => order.id);
  const productionIds = scopedProductionOrders.map((order) => order.id);

  if (orderIds.length || productionIds.length || fixture.productIds.length || fixture.locationIds.length) {
    await prisma.inventoryMovement.deleteMany({
      where: {
        OR: [
          orderIds.length ? { documentId: { in: orderIds } } : undefined,
          productionIds.length ? { documentId: { in: productionIds } } : undefined,
          fixture.productIds.length ? { productId: { in: fixture.productIds } } : undefined,
          fixture.locationIds.length ? { locationId: { in: fixture.locationIds } } : undefined,
        ].filter(Boolean) as never[],
      },
    });
  }
  if (orderIds.length) {
    await prisma.auditLog.deleteMany({ where: { entityId: { in: orderIds } } });
  }
  if (productionIds.length) {
    await prisma.productionOrder.deleteMany({ where: { id: { in: productionIds } } });
  }
  if (orderIds.length) {
    await prisma.salesInternalOrder.deleteMany({ where: { id: { in: orderIds } } });
  }
  if (fixture.productIds.length) {
    await prisma.inventory.deleteMany({ where: { productId: { in: fixture.productIds } } });
    await prisma.productTechnicalAttribute.deleteMany({ where: { productId: { in: fixture.productIds } } });
    await prisma.product.deleteMany({ where: { id: { in: fixture.productIds } } });
  }
  if (fixture.locationIds.length) {
    await prisma.location.deleteMany({ where: { id: { in: fixture.locationIds } } });
  }
  if (fixture.customerId) {
    await prisma.customer.deleteMany({ where: { id: fixture.customerId } });
  }
  if (fixture.warehouseId) {
    await prisma.warehouse.deleteMany({ where: { id: fixture.warehouseId } });
  }
}

test.describe.serial("mixed sales order continuity", () => {
  test.beforeAll(async () => {
    const salesUser = await prisma.user.findUniqueOrThrow({
      where: { email: "sales@scmayher.com" },
      select: { id: true },
    });
    fixture.salesUserId = salesUser.id;

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

  test("completes a direct-product order and downloads its operational documents", async ({ page }) => {
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
    await page.getByRole("button", { name: "Confirmar surtido" }).click();
    await expect(page.getByTestId("fulfillment-next-action")).toContainText("Surtido directo terminado");
    await page.goto(`/production/requests/${directOrder.id}`);
    await expect(page.getByTestId("prepare-for-delivery-form")).toBeVisible();
    await page.getByTestId("prepare-for-delivery-form").locator('select[name="preparedLocationId"]').selectOption(fixture.shippingLocationId);
    await page.getByLabel("Nota (opcional)").fill("Fixture directo preparado para entrega");
    await Promise.all([
      page.waitForURL(/\?ok=/),
      page.getByRole("button", { name: "Preparar para entrega" }).click(),
    ]);
    await expect(page.getByTestId("prepared-for-delivery-summary")).toContainText("Preparado para entrega");

    await loginFresh(page, "SALES_EXECUTIVE", `/production/requests/${directOrder.id}`);
    await page.getByRole("button", { name: "Entregado al cliente" }).click();
    const deliveryDownload = page.waitForEvent("download");
    await page.getByRole("link", { name: "Descargar comprobante de entrega" }).click();
    expect((await deliveryDownload).suggestedFilename()).toMatch(/^entrega-.*\.pdf$/);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/production/requests/${directOrder.id}`);
    await expect(page.getByRole("link", { name: "Descargar comprobante de entrega" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    const finalOrder = await prisma.salesInternalOrder.findUniqueOrThrow({
      where: { id: directOrder.id },
      select: { preparedForDeliveryAt: true, preparedForDeliveryNotes: true, preparedForDeliveryLocation: { select: { code: true } }, deliveredToCustomerAt: true },
    });
    expect(finalOrder.preparedForDeliveryAt).toBeTruthy();
    expect(finalOrder.preparedForDeliveryLocation?.code).toBe(`${tag}-SHIP`);
    expect(finalOrder.preparedForDeliveryNotes).toBe("Fixture directo preparado para entrega");
    expect(finalOrder.deliveredToCustomerAt).toBeTruthy();
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
      select: { id: true },
    });
    await expect(page).toHaveURL(new RegExp(`/production/orders/${production.id}`));
    await page.getByRole("button", { name: "Liberar materiales" }).click();
    await page.getByLabel("Operador").fill(`Operador ${tag}`);
    await page.getByTestId("confirm-assembly-materials").click({ noWaitAfter: true });
    await expect(page.getByText(/orden cerrada\/consumida/i)).toBeVisible({ timeout: 60_000 });
    await page.getByRole("link", { name: "Volver al pedido" }).click();
    await expect(page.getByTestId("prepare-for-delivery-form")).toBeVisible();
    await page.getByTestId("prepare-for-delivery-form").locator('select[name="preparedLocationId"]').selectOption(fixture.shippingLocationId);
    await page.getByRole("button", { name: "Preparar para entrega" }).click();
    await expect(page.getByTestId("prepared-for-delivery-summary")).toContainText("Preparado para entrega");

    await loginFresh(page, "SALES_EXECUTIVE", `/production/requests/${assemblyOrder.id}`);
    await page.getByRole("button", { name: "Entregado al cliente" }).click();
    await expect(page.getByRole("link", { name: "Descargar comprobante de entrega" })).toBeVisible();
    const finalOrder = await prisma.salesInternalOrder.findUniqueOrThrow({
      where: { id: assemblyOrder.id },
      select: { preparedForDeliveryAt: true, deliveredToCustomerAt: true },
    });
    expect(finalOrder.preparedForDeliveryAt).toBeTruthy();
    expect(finalOrder.deliveredToCustomerAt).toBeTruthy();
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
    await page.getByRole("button", { name: "Confirmar surtido" }).click();
    const continueAssembly = page.getByRole("link", { name: /Continuar ensamble/ });
    await expect(page.getByTestId("fulfillment-next-action")).toContainText("Continuar ensamble");
    await expect(continueAssembly).toHaveAttribute("href", /\/production\/orders\//);
    await continueAssembly.click();

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
    await Promise.all([
      page.waitForURL(/\?ok=/),
      page.getByRole("button", { name: "Entregado al cliente" }).click(),
    ]);

    const [finalOrder, finalAssembly] = await Promise.all([
      prisma.salesInternalOrder.findUniqueOrThrow({ where: { id: order.id }, select: { preparedForDeliveryAt: true, preparedForDeliveryLocation: { select: { code: true } }, deliveredToCustomerAt: true } }),
      prisma.productionOrder.findUniqueOrThrow({ where: { id: production.id }, select: { status: true } }),
    ]);
    expect(finalOrder.preparedForDeliveryAt).toBeTruthy();
    expect(finalOrder.preparedForDeliveryLocation?.code).toBe(`${tag}-SHIP`);
    expect(finalOrder.deliveredToCustomerAt).toBeTruthy();
    expect(finalAssembly.status).toBe("COMPLETADA");
  });
});
