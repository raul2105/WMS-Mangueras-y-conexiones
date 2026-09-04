import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { loginAs } from "./lib/auth.helpers";

const prisma = new PrismaClient();
const tag = `TSA${Date.now().toString().slice(-8)}`;

const fixture = {
  warehouseCode: `${tag}-WH`,
  customerCode: `${tag}-C`,
  customerName: `Cliente ensamble ${tag}`,
  entrySku: `${tag}-IN`,
  exitSku: `${tag}-OUT`,
  hoseSku: `${tag}-HOSE`,
  directSku: `${tag}-DIRECT`,
  warehouseId: "",
  customerId: "",
  productIds: [] as string[],
  locationIds: [] as string[],
  salesOrderId: "",
  productionOrderId: "",
  technicalSourceId: "",
};

async function cleanupFixture() {
  const salesOrders = fixture.warehouseId
    ? await prisma.salesInternalOrder.findMany({ where: { warehouseId: fixture.warehouseId }, select: { id: true } })
    : [];
  const salesOrderIds = salesOrders.map((order) => order.id);
  const productionOrders = fixture.warehouseId
    ? await prisma.productionOrder.findMany({ where: { warehouseId: fixture.warehouseId }, select: { id: true } })
    : [];
  const productionOrderIds = productionOrders.map((order) => order.id);

  if (productionOrderIds.length > 0) {
    await prisma.auditLog.deleteMany({ where: { entityId: { in: productionOrderIds } } });
    await prisma.inventoryMovement.deleteMany({ where: { documentId: { in: productionOrderIds } } });
    await prisma.productionOrder.deleteMany({ where: { id: { in: productionOrderIds } } });
  }

  if (salesOrderIds.length > 0) {
    await prisma.auditLog.deleteMany({ where: { entityId: { in: salesOrderIds } } });
    await prisma.salesInternalOrder.deleteMany({ where: { id: { in: salesOrderIds } } });
  }

  if (fixture.productIds.length > 0 || fixture.locationIds.length > 0) {
    await prisma.inventoryMovement.deleteMany({
      where: {
        OR: [
          fixture.productIds.length > 0 ? { productId: { in: fixture.productIds } } : undefined,
          fixture.locationIds.length > 0 ? { locationId: { in: fixture.locationIds } } : undefined,
        ].filter(Boolean) as never[],
      },
    });
  }

  if (fixture.productIds.length > 0) {
    await prisma.inventory.deleteMany({ where: { productId: { in: fixture.productIds } } });
    await prisma.productTechnicalAttribute.deleteMany({ where: { productId: { in: fixture.productIds } } });
    await prisma.product.deleteMany({ where: { id: { in: fixture.productIds } } });
  }
  if (fixture.technicalSourceId) {
    await prisma.productTechnicalSource.deleteMany({ where: { id: fixture.technicalSourceId } });
  }
  if (fixture.locationIds.length > 0) {
    await prisma.location.deleteMany({ where: { id: { in: fixture.locationIds } } });
  }
  if (fixture.customerId) {
    await prisma.customer.deleteMany({ where: { id: fixture.customerId } });
  }
  if (fixture.warehouseId) {
    await prisma.location.deleteMany({ where: { warehouseId: fixture.warehouseId } });
    await prisma.warehouse.deleteMany({ where: { id: fixture.warehouseId } });
  }
}

test.beforeAll(async () => {
  const warehouse = await prisma.warehouse.create({
    data: { code: fixture.warehouseCode, name: `Almacén prueba ${tag}`, isActive: true },
  });
  fixture.warehouseId = warehouse.id;

  const customer = await prisma.customer.create({
    data: { code: fixture.customerCode, name: fixture.customerName, isActive: true },
  });
  fixture.customerId = customer.id;

  const location = await prisma.location.create({
    data: {
      code: `${tag}-LOC`,
      name: "Ubicación de prueba",
      zone: "TEST",
      isActive: true,
      usageType: "STORAGE",
      warehouseId: warehouse.id,
    },
  });
  fixture.locationIds.push(location.id);

  const shipping = await prisma.location.create({
    data: {
      code: `${tag}-SHIP`,
      name: "Despacho de prueba",
      zone: "SHIP",
      isActive: true,
      usageType: "SHIPPING",
      warehouseId: warehouse.id,
    },
  });
  fixture.locationIds.push(shipping.id);

  const [entry, exit, hose, direct] = await Promise.all([
    prisma.product.create({ data: { sku: fixture.entrySku, name: `Conexión entrada ${tag}`, type: "FITTING" } }),
    prisma.product.create({ data: { sku: fixture.exitSku, name: `Conexión salida ${tag}`, type: "FITTING" } }),
    prisma.product.create({ data: { sku: fixture.hoseSku, name: `Manguera hidráulica ${tag}`, type: "HOSE", unitLabel: "m" } }),
    prisma.product.create({ data: { sku: fixture.directSku, name: `Producto directo ${tag}`, type: "ACCESSORY" } }),
  ]);
  fixture.productIds.push(entry.id, exit.id, hose.id, direct.id);

  const technicalSource = await prisma.productTechnicalSource.create({
    data: {
      supplierName: `Proveedor técnico ${tag}`,
      documentRef: `FICHA-${tag}`,
      documentVersion: "1",
      status: "APPROVED",
      reviewedAt: new Date(),
    },
  });
  fixture.technicalSourceId = technicalSource.id;

  await prisma.productCompatibilityRule.createMany({
    data: [
      {
        productId: entry.id,
        compatibleProductId: hose.id,
        ruleType: "ASSEMBLY",
        description: "Entrada y manguera aprobadas para el E2E controlado",
        severity: "INFO",
        decision: "APPROVED",
        governanceStatus: "APPROVED",
        sourceId: technicalSource.id,
        maxWorkingPressureBar: 250,
        minTemperatureC: -20,
        maxTemperatureC: 90,
        medium: "Aceite hidráulico",
        application: "Línea de retorno",
        assemblyMethod: "Prensado según ficha técnica",
      },
      {
        productId: hose.id,
        compatibleProductId: exit.id,
        ruleType: "ASSEMBLY",
        description: "Manguera y salida aprobadas para el E2E controlado",
        severity: "INFO",
        decision: "APPROVED",
        governanceStatus: "APPROVED",
        sourceId: technicalSource.id,
        maxWorkingPressureBar: 250,
        minTemperatureC: -20,
        maxTemperatureC: 90,
        medium: "Aceite hidráulico",
        application: "Línea de retorno",
        assemblyMethod: "Prensado según ficha técnica",
      },
    ],
  });

  await prisma.inventory.createMany({
    data: [
      { productId: entry.id, locationId: location.id, quantity: 10, reserved: 0, available: 10 },
      { productId: exit.id, locationId: location.id, quantity: 10, reserved: 0, available: 10 },
      { productId: hose.id, locationId: location.id, quantity: 20, reserved: 0, available: 20 },
      { productId: direct.id, locationId: location.id, quantity: 10, reserved: 0, available: 10 },
    ],
  });
});

test.afterAll(async () => {
  await cleanupFixture();
  await prisma.$disconnect();
});

test("Ventas mezcla productos directos y varios ensambles en un solo pedido", async ({ page }, testInfo) => {
  await loginAs(page, "SALES_EXECUTIVE");
  await page.goto("/production/requests/new");

  await page.getByLabel("Selecciona o crea el cliente").fill(fixture.customerName);
  await expect(page.getByRole("button", { name: new RegExp(fixture.customerName) })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(fixture.customerName) }).click();
  await page.getByRole("button", { name: "Continuar a producto →" }).click();

  await page.getByRole("button", { name: "Ensamble" }).click();
  await expect(page.getByTestId("sales-order-assembly-configurator")).toBeVisible();
  await page.locator('select[name="warehouseId"]').selectOption(fixture.warehouseId);

  await page.getByTestId("new-order-entry-fitting-input").fill(fixture.entrySku);
  await page.getByRole("button", { name: new RegExp(fixture.entrySku) }).click();
  await page.getByTestId("new-order-exit-fitting-input").fill(fixture.exitSku);
  await page.getByRole("button", { name: new RegExp(fixture.exitSku) }).click();
  await page.getByTestId("new-order-hose-input").fill(fixture.hoseSku);
  await page.getByRole("button", { name: new RegExp(fixture.hoseSku) }).click();

  await page.getByLabel("Longitud por ensamble").fill("2");
  await page.getByLabel("Cantidad de ensambles").fill("3");
  await page.getByLabel("Presión de trabajo (bar)").fill("180");
  await page.getByLabel("Temperatura de operación (°C)").fill("60");
  await page.getByLabel("Medio o fluido").fill("Aceite hidráulico");
  await page.getByLabel("Aplicación").fill("Línea de retorno");
  await page.getByLabel("Método de ensamble").fill("Prensado según ficha técnica");
  await page.getByRole("button", { name: "Agregar ensamble al pedido" }).click();

  await page.getByRole("button", { name: "Producto directo" }).click();
  await page.getByTestId("new-order-direct-product-input").fill(fixture.directSku);
  await page.getByRole("button", { name: new RegExp(fixture.directSku) }).click();
  await page.getByRole("button", { name: "Agregar producto al pedido" }).click();

  await page.getByRole("button", { name: "Ensamble" }).click();
  await page.getByTestId("new-order-entry-fitting-input").fill(fixture.entrySku);
  await page.getByRole("button", { name: new RegExp(fixture.entrySku) }).click();
  await page.getByTestId("new-order-exit-fitting-input").fill(fixture.exitSku);
  await page.getByRole("button", { name: new RegExp(fixture.exitSku) }).click();
  await page.getByTestId("new-order-hose-input").fill(fixture.hoseSku);
  await page.getByRole("button", { name: new RegExp(fixture.hoseSku) }).click();
  await page.getByLabel("Longitud por ensamble").fill("1");
  await page.getByLabel("Cantidad de ensambles").fill("2");
  await page.getByLabel("Presión de trabajo (bar)").fill("160");
  await page.getByLabel("Temperatura de operación (°C)").fill("50");
  await page.getByLabel("Medio o fluido").fill("Aceite hidráulico");
  await page.getByLabel("Aplicación").fill("Línea de retorno");
  await page.getByLabel("Método de ensamble").fill("Prensado según ficha técnica");
  await page.getByRole("button", { name: "Agregar ensamble al pedido" }).click();

  await expect(page.getByTestId("sales-order-lines")).toContainText("3 líneas listas");
  await page.getByRole("button", { name: "Continuar a entrega →" }).click();
  await page.getByLabel("Fecha compromiso").fill("2026-12-31");
  await page.getByTestId("create-order-button").click();

  await expect(page).toHaveURL(/\/production\/requests\/[^/?]+\?ok=/);
  await expect(page.getByText("Pedido de surtido creado")).toBeVisible();

  const order = await prisma.salesInternalOrder.findFirstOrThrow({
    where: { warehouseId: fixture.warehouseId, customerId: fixture.customerId },
    orderBy: { createdAt: "desc" },
    include: { lines: { include: { assemblyConfiguration: true } } },
  });
  fixture.salesOrderId = order.id;
  const configuredLines = order.lines.filter((line) => line.lineKind === "CONFIGURED_ASSEMBLY");
  const directLines = order.lines.filter((line) => line.lineKind === "PRODUCT");
  expect(configuredLines).toHaveLength(2);
  expect(directLines).toHaveLength(1);
  expect(configuredLines.every((line) => line.productId === null)).toBe(true);
  expect(configuredLines.map((line) => line.assemblyConfiguration?.assemblyQuantity).sort()).toEqual([2, 3]);
  expect(configuredLines.map((line) => line.assemblyConfiguration?.workingPressureBar).sort()).toEqual([160, 180]);
  expect(configuredLines.map((line) => line.assemblyConfiguration?.operatingTemperatureC).sort()).toEqual([50, 60]);
  expect(configuredLines.every((line) => line.assemblyConfiguration?.medium === "Aceite hidráulico")).toBe(true);
  expect(configuredLines.every((line) => line.assemblyConfiguration?.application === "Línea de retorno")).toBe(true);
  expect(configuredLines.every((line) => line.assemblyConfiguration?.assemblyMethod === "Prensado según ficha técnica")).toBe(true);

  const productionOrder = await prisma.productionOrder.findFirstOrThrow({
    where: { sourceDocumentId: order.id },
    include: { assemblyConfiguration: true, assemblyWorkOrder: { include: { pickLists: true } } },
  });
  fixture.productionOrderId = productionOrder.id;
  expect(await prisma.productionOrder.count({ where: { sourceDocumentId: order.id } })).toBe(2);
  const productionConfigurations = await prisma.assemblyConfiguration.findMany({
    where: { productionOrder: { sourceDocumentId: order.id } },
  });
  expect(productionConfigurations.map((configuration) => configuration.workingPressureBar).sort()).toEqual([160, 180]);
  expect(productionConfigurations.map((configuration) => configuration.operatingTemperatureC).sort()).toEqual([50, 60]);
  expect(productionConfigurations.every((configuration) => configuration.medium === "Aceite hidráulico")).toBe(true);
  expect(productionConfigurations.every((configuration) => configuration.application === "Línea de retorno")).toBe(true);
  expect(productionConfigurations.every((configuration) => configuration.assemblyMethod === "Prensado según ficha técnica")).toBe(true);
  expect(productionConfigurations.every((configuration) => configuration.compatibilityStatus === "APPROVED")).toBe(true);
  expect(productionOrder.status).toBe("ABIERTA");
  expect(productionOrder.assemblyWorkOrder?.reservationStatus).toBe("RESERVED");
  expect(productionOrder.assemblyWorkOrder?.pickLists[0]?.status).toBe("DRAFT");

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/production/orders/${productionOrder.id}`);
  await expect(page.getByTestId("assembly-technical-safety")).toBeVisible();
  await expect(page.getByTestId("assembly-technical-status")).toHaveText("APROBADO");
  await expect(page.getByTestId("assembly-technical-safety")).toContainText("180 bar");
  await expect(page.getByTestId("assembly-technical-safety")).toContainText("60 °C");
  await expect(page.getByTestId("assembly-technical-safety")).toContainText("Aceite hidráulico");
  await expect(page.getByTestId("assembly-technical-safety")).toContainText("Línea de retorno");
  await expect(page.getByTestId("assembly-technical-safety")).toContainText("Prensado según ficha técnica");
  await expect(page.getByRole("button", { name: "Liberar materiales" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("assembly-technical-approved-1440.png"), fullPage: true });

  const ruleToBlock = await prisma.productCompatibilityRule.findFirstOrThrow({
    where: {
      sourceId: fixture.technicalSourceId,
      productId: productionOrder.assemblyConfiguration!.entryFittingProductId,
      compatibleProductId: productionOrder.assemblyConfiguration!.hoseProductId,
    },
  });
  await prisma.productCompatibilityRule.update({
    where: { id: ruleToBlock.id },
    data: {
      decision: "BLOCKED",
      severity: "BLOCK",
      description: "Combinación detenida por prueba técnica controlada",
    },
  });
  await page.reload();
  await expect(page.getByTestId("assembly-technical-status")).toHaveText("BLOQUEADO");
  await expect(page.getByTestId("assembly-technical-safety")).toContainText("Detén la operación");
  await expect(page.getByRole("button", { name: "Liberar materiales" })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("assembly-technical-blocked-1440.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("assembly-technical-safety")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("assembly-technical-blocked-390.png"), fullPage: true });
});
