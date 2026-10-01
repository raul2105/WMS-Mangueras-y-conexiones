import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { Prisma, PrismaClient } from "@prisma/client";
import { loginAs } from "./lib/auth.helpers";
import { createAwsFixtureEvidence } from "./lib/aws-fixture-evidence";

const prisma = new PrismaClient();
const tag = `TSA${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];
let evidence: Awaited<ReturnType<typeof createAwsFixtureEvidence>> | null = null;

async function attachAccessibilityEvidence(page: import("@playwright/test").Page, testInfo: import("@playwright/test").TestInfo, state: string) {
  const workspace = page.getByTestId("assembly-order-workspace");
  const axe = await new AxeBuilder({ page }).include('[data-testid="assembly-order-workspace"]').withTags(WCAG_TAGS).analyze();
  await testInfo.attach(`axe-${state}.json`, {
    body: Buffer.from(JSON.stringify({ violations: axe.violations, passes: axe.passes.map((item) => item.id) }, null, 2)),
    contentType: "application/json",
  });
  expect(axe.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious")).toEqual([]);
  expect(axe.violations.filter((violation) => violation.id === "color-contrast")).toEqual([]);

  const ariaSnapshot = await workspace.ariaSnapshot();
  await testInfo.attach(`screen-reader-tree-${state}.yml`, {
    body: Buffer.from(ariaSnapshot),
    contentType: "text/yaml",
  });
  expect(ariaSnapshot).toContain("Seguridad técnica");
  expect(ariaSnapshot).toContain("Siguiente acción");
}

async function reachActionWithKeyboard(page: import("@playwright/test").Page, actionName: string) {
  const visited: string[] = [];
  for (let step = 0; step < 40; step += 1) {
    await page.keyboard.press("Tab");
    const active = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      return {
        name: element?.getAttribute("aria-label") ?? element?.innerText?.trim() ?? "",
        outline: element ? getComputedStyle(element).outlineStyle : "none",
        shadow: element ? getComputedStyle(element).boxShadow : "none",
      };
    });
    visited.push(active.name);
    if (active.name.includes(actionName)) {
      expect(active.outline !== "none" || active.shadow !== "none").toBe(true);
      return visited;
    }
  }
  throw new Error(`La acción ${actionName} no fue alcanzable por teclado. Secuencia: ${visited.join(" -> ")}`);
}

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

async function captureBeforeManifest() {
  const [{ schema }] = await prisma.$queryRaw<Array<{ schema: string }>>`SELECT current_schema() AS schema`;
  const locationCodes = [`${tag}-LOC`, `${tag}-SHIP`];
  const [warehouses, customers, products, locations, technicalSources] = await Promise.all([
    prisma.warehouse.findMany({ where: { code: fixture.warehouseCode }, select: { id: true, code: true } }),
    prisma.customer.findMany({ where: { code: fixture.customerCode }, select: { id: true, code: true } }),
    prisma.product.findMany({ where: { sku: { in: [fixture.entrySku, fixture.exitSku, fixture.hoseSku, fixture.directSku] } }, select: { id: true, sku: true } }),
    prisma.location.findMany({ where: { code: { in: locationCodes } }, select: { id: true, code: true } }),
    prisma.productTechnicalSource.findMany({ where: { documentRef: `FICHA-${tag}` }, select: { id: true, documentRef: true } }),
  ]);
  return {
    phase: "before", capturedAt: new Date().toISOString(), schema, uniqueTag: tag,
    keys: { warehouseCode: fixture.warehouseCode, customerCode: fixture.customerCode, skus: [fixture.entrySku, fixture.exitSku, fixture.hoseSku, fixture.directSku], locationCodes, technicalSourceDocumentRef: `FICHA-${tag}` },
    records: { warehouses, customers, products, locations, technicalSources },
    counts: { warehouses: warehouses.length, customers: customers.length, products: products.length, locations: locations.length, technicalSources: technicalSources.length },
  };
}

async function cleanupFixture() {
  const salesOrders = fixture.warehouseId
    ? await prisma.salesInternalOrder.findMany({
        where: { warehouseId: fixture.warehouseId },
        select: { id: true, lines: { select: { id: true } }, pickLists: { select: { id: true, tasks: { select: { id: true } } } } },
      })
    : [];
  const salesOrderIds = salesOrders.map((order) => order.id);
  const productionOrders = fixture.warehouseId
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
  const productionOrderIds = productionOrders.map((order) => order.id);
  const exceptions = salesOrderIds.length
    ? await prisma.salesInternalOrderException.findMany({ where: { orderId: { in: salesOrderIds } }, select: { id: true, returns: { select: { id: true, items: { select: { id: true } } } } } })
    : [];
  const exceptionIds = exceptions.map(({ id }) => id);
  const returnIds = exceptions.flatMap(({ returns }) => returns.map(({ id }) => id));
  const returnItemIds = exceptions.flatMap(({ returns }) => returns.flatMap(({ items }) => items.map(({ id }) => id)));
  const salesLineIds = salesOrders.flatMap(({ lines }) => lines.map(({ id }) => id));
  const salesPickListIds = salesOrders.flatMap(({ pickLists }) => pickLists.map(({ id }) => id));
  const salesPickTaskIds = salesOrders.flatMap(({ pickLists }) => pickLists.flatMap(({ tasks }) => tasks.map(({ id }) => id)));
  const productionItemIds = productionOrders.flatMap(({ items }) => items.map(({ id }) => id));
  const configurationIds = productionOrders.flatMap(({ assemblyConfiguration }) => assemblyConfiguration ? [assemblyConfiguration.id] : []);
  const workOrderIds = productionOrders.flatMap(({ assemblyWorkOrder }) => assemblyWorkOrder ? [assemblyWorkOrder.id] : []);
  const workOrderLineIds = productionOrders.flatMap(({ assemblyWorkOrder }) => assemblyWorkOrder?.lines.map(({ id }) => id) ?? []);
  const assemblyPickListIds = productionOrders.flatMap(({ assemblyWorkOrder }) => assemblyWorkOrder?.pickLists.map(({ id }) => id) ?? []);
  const assemblyPickTaskIds = productionOrders.flatMap(({ assemblyWorkOrder }) => assemblyWorkOrder?.pickLists.flatMap(({ tasks }) => tasks.map(({ id }) => id)) ?? []);
  const assemblyLinePickTaskIds = productionOrders.flatMap(({ assemblyWorkOrder }) => assemblyWorkOrder?.lines.flatMap(({ pickTasks }) => pickTasks.map(({ id }) => id)) ?? []);
  const fixtureEntityIds = [
    ...salesOrders.flatMap((order) => [order.id, ...order.lines.map((line) => line.id), ...order.pickLists.flatMap((list) => [list.id, ...list.tasks.map((task) => task.id)])]),
    ...productionOrders.flatMap((order) => [
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
    ...(salesOrderIds.length ? [{ documentId: { in: salesOrderIds } }] : []),
    ...(productionOrderIds.length ? [{ documentId: { in: productionOrderIds } }] : []),
    ...(fixture.productIds.length ? [{ productId: { in: fixture.productIds } }] : []),
    ...(fixture.locationIds.length ? [{ locationId: { in: fixture.locationIds } }] : []),
  ];
  const traceIds = fixture.warehouseId
    ? (await prisma.traceRecord.findMany({ where: { warehouseId: fixture.warehouseId }, select: { id: true } })).map(({ id }) => id)
    : [];
  const labelJobs = traceIds.length ? await prisma.labelPrintJob.findMany({ where: { traceRecordId: { in: traceIds } }, select: { id: true } }) : [];
  const inventoryRows = fixture.productIds.length ? await prisma.inventory.findMany({ where: { productId: { in: fixture.productIds } }, select: { id: true } }) : [];
  const movementRows = movementScope.length ? await prisma.inventoryMovement.findMany({ where: { OR: movementScope }, select: { id: true } }) : [];
  const ruleRows = fixture.productIds.length ? await prisma.productCompatibilityRule.findMany({ where: { OR: [{ productId: { in: fixture.productIds } }, { compatibleProductId: { in: fixture.productIds } }] }, select: { id: true } }) : [];
  const attributeRows = fixture.productIds.length ? await prisma.productTechnicalAttribute.findMany({ where: { productId: { in: fixture.productIds } }, select: { id: true } }) : [];
  const allOrderEventIds = [...salesOrderIds, ...productionOrderIds];
  const syncEventWhere: Prisma.SyncEventWhereInput = { OR: [
    ...(inventoryEntityIds.length ? [{ entityType: "INVENTORY", entityId: { in: inventoryEntityIds } }] : []),
    ...(allOrderEventIds.length ? [{ entityType: "ORDER", entityId: { in: allOrderEventIds } }] : []),
    ...(fixture.productIds.length ? [{ entityType: "PRODUCT", entityId: { in: fixture.productIds } }] : []),
  ] };
  const syncEvents = syncEventWhere.OR?.length ? await prisma.syncEvent.findMany({ where: syncEventWhere, select: { id: true } }) : [];
  const auditEntityIds = [...new Set([...fixtureEntityIds, ...exceptionIds, ...returnIds, ...returnItemIds, ...inventoryEntityIds, ...fixture.productIds, ...fixture.locationIds, fixture.warehouseId, fixture.customerId, fixture.technicalSourceId, ...ruleRows.map(({ id }) => id), ...attributeRows.map(({ id }) => id), ...movementRows.map(({ id }) => id)].filter((id): id is string => Boolean(id)))];
  const auditRows = auditEntityIds.length ? await prisma.auditLog.findMany({ where: { entityId: { in: auditEntityIds } }, select: { id: true } }) : [];
  const [{ schema }] = await prisma.$queryRaw<Array<{ schema: string }>>`SELECT current_schema() AS schema`;
  const duringIds = {
    warehouseIds: fixture.warehouseId ? [fixture.warehouseId] : [], customerIds: fixture.customerId ? [fixture.customerId] : [],
    productIds: [...fixture.productIds], locationIds: [...fixture.locationIds], salesOrderIds, salesLineIds, salesPickListIds, salesPickTaskIds,
    exceptionIds, returnIds, returnItemIds, productionOrderIds, productionItemIds, configurationIds, workOrderIds, workOrderLineIds,
    assemblyPickListIds, assemblyPickTaskIds, assemblyLinePickTaskIds, inventoryIds: inventoryRows.map(({ id }) => id),
    movementIds: movementRows.map(({ id }) => id), traceIds, labelPrintJobIds: labelJobs.map(({ id }) => id),
    technicalSourceIds: fixture.technicalSourceId ? [fixture.technicalSourceId] : [], compatibilityRuleIds: ruleRows.map(({ id }) => id),
    technicalAttributeIds: attributeRows.map(({ id }) => id), auditEntityIds, auditLogIds: auditRows.map(({ id }) => id),
    syncEventIds: syncEvents.map(({ id }) => id), inventoryEntityIds, orderEventIds: allOrderEventIds, productEventIds: [...fixture.productIds],
  };
  const duringCounts = Object.fromEntries(Object.entries(duringIds).map(([key, ids]) => [key, ids.length]));
  await evidence?.write("during", { phase: "during", capturedAt: new Date().toISOString(), schema, uniqueTag: tag, ids: duringIds, counts: duringCounts });

  if (traceIds.length) await prisma.labelPrintJob.deleteMany({ where: { id: { in: labelJobs.map(({ id }) => id) } } });
  if (traceIds.length) await prisma.traceRecord.deleteMany({ where: { id: { in: traceIds } } });
  if (auditEntityIds.length) await prisma.auditLog.deleteMany({ where: { entityId: { in: auditEntityIds } } });
  if (syncEventWhere.OR?.length) await prisma.syncEvent.deleteMany({ where: syncEventWhere });

  if (productionOrderIds.length > 0) {
    if (movementRows.length) await prisma.inventoryMovement.deleteMany({ where: { id: { in: movementRows.map(({ id }) => id) } } });
    await prisma.productionOrder.deleteMany({ where: { id: { in: productionOrderIds } } });
  }

  if (salesOrderIds.length > 0) {
    await prisma.salesInternalOrder.deleteMany({ where: { id: { in: salesOrderIds } } });
  }

  if (fixture.productIds.length > 0 || fixture.locationIds.length > 0) {
    if (movementRows.length) await prisma.inventoryMovement.deleteMany({ where: { id: { in: movementRows.map(({ id }) => id) } } });
  }

  if (fixture.productIds.length > 0) {
    await prisma.inventory.deleteMany({ where: { productId: { in: fixture.productIds } } });
    await prisma.productCompatibilityRule.deleteMany({ where: { OR: [{ productId: { in: fixture.productIds } }, { compatibleProductId: { in: fixture.productIds } }] } });
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
  const afterCounts = {
    warehouses: fixture.warehouseId ? await prisma.warehouse.count({ where: { id: fixture.warehouseId } }) : 0,
    customers: fixture.customerId ? await prisma.customer.count({ where: { id: fixture.customerId } }) : 0,
    products: fixture.productIds.length ? await prisma.product.count({ where: { id: { in: fixture.productIds } } }) : 0,
    locations: fixture.locationIds.length ? await prisma.location.count({ where: { id: { in: fixture.locationIds } } }) : 0,
    salesOrders: salesOrderIds.length ? await prisma.salesInternalOrder.count({ where: { id: { in: salesOrderIds } } }) : 0,
    salesLines: salesLineIds.length ? await prisma.salesInternalOrderLine.count({ where: { id: { in: salesLineIds } } }) : 0,
    salesPickLists: salesPickListIds.length ? await prisma.salesInternalOrderPickList.count({ where: { id: { in: salesPickListIds } } }) : 0,
    salesPickTasks: salesPickTaskIds.length ? await prisma.salesInternalOrderPickTask.count({ where: { id: { in: salesPickTaskIds } } }) : 0,
    exceptions: exceptionIds.length ? await prisma.salesInternalOrderException.count({ where: { id: { in: exceptionIds } } }) : 0,
    returns: returnIds.length ? await prisma.salesInternalOrderReturn.count({ where: { id: { in: returnIds } } }) : 0,
    returnItems: returnItemIds.length ? await prisma.salesInternalOrderReturnItem.count({ where: { id: { in: returnItemIds } } }) : 0,
    productionOrders: productionOrderIds.length ? await prisma.productionOrder.count({ where: { id: { in: productionOrderIds } } }) : 0,
    productionItems: productionItemIds.length ? await prisma.productionOrderItem.count({ where: { id: { in: productionItemIds } } }) : 0,
    configurations: configurationIds.length ? await prisma.assemblyConfiguration.count({ where: { id: { in: configurationIds } } }) : 0,
    workOrders: workOrderIds.length ? await prisma.assemblyWorkOrder.count({ where: { id: { in: workOrderIds } } }) : 0,
    workOrderLines: workOrderLineIds.length ? await prisma.assemblyWorkOrderLine.count({ where: { id: { in: workOrderLineIds } } }) : 0,
    assemblyPickLists: assemblyPickListIds.length ? await prisma.pickList.count({ where: { id: { in: assemblyPickListIds } } }) : 0,
    assemblyPickTasks: assemblyPickTaskIds.length ? await prisma.pickTask.count({ where: { id: { in: assemblyPickTaskIds } } }) : 0,
    assemblyLinePickTasks: assemblyLinePickTaskIds.length ? await prisma.pickTask.count({ where: { id: { in: assemblyLinePickTaskIds } } }) : 0,
    inventory: inventoryRows.length ? await prisma.inventory.count({ where: { id: { in: inventoryRows.map(({ id }) => id) } } }) : 0,
    movements: movementRows.length ? await prisma.inventoryMovement.count({ where: { id: { in: movementRows.map(({ id }) => id) } } }) : 0,
    traces: traceIds.length ? await prisma.traceRecord.count({ where: { id: { in: traceIds } } }) : 0,
    labelPrintJobs: labelJobs.length ? await prisma.labelPrintJob.count({ where: { id: { in: labelJobs.map(({ id }) => id) } } }) : 0,
    compatibilityRules: ruleRows.length ? await prisma.productCompatibilityRule.count({ where: { id: { in: ruleRows.map(({ id }) => id) } } }) : 0,
    technicalAttributes: attributeRows.length ? await prisma.productTechnicalAttribute.count({ where: { id: { in: attributeRows.map(({ id }) => id) } } }) : 0,
    technicalSources: fixture.technicalSourceId ? await prisma.productTechnicalSource.count({ where: { id: fixture.technicalSourceId } }) : 0,
    auditLogs: auditEntityIds.length ? await prisma.auditLog.count({ where: { entityId: { in: auditEntityIds } } }) : 0,
    syncEvents: syncEventWhere.OR?.length ? await prisma.syncEvent.count({ where: syncEventWhere }) : 0,
  };
  await evidence?.write("after", { phase: "after", capturedAt: new Date().toISOString(), schema, uniqueTag: tag, ids: duringIds, counts: afterCounts, zeroResiduals: Object.values(afterCounts).every((count) => count === 0) });
  expect(Object.values(afterCounts)).toEqual(Array(Object.keys(afterCounts).length).fill(0));
}

test.beforeAll(async () => {
  evidence = await createAwsFixtureEvidence("sales-configured-assembly", tag);
  const before = await captureBeforeManifest();
  await evidence.write("before", before);
  expect(Object.values(before.counts)).toEqual(Array(Object.keys(before.counts).length).fill(0));

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
  try {
    await cleanupFixture();
  } finally {
    await prisma.$disconnect();
  }
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

  const productionOrders = await prisma.productionOrder.findMany({
    where: { sourceDocumentId: order.id },
    include: { assemblyConfiguration: true, assemblyWorkOrder: { include: { pickLists: true } } },
    orderBy: { createdAt: "asc" },
  });
  const productionOrder = productionOrders[0];
  expect(productionOrder).toBeTruthy();
  if (!productionOrder) throw new Error("No se generaron órdenes para las líneas configuradas");
  fixture.productionOrderId = productionOrder.id;
  expect(productionOrders).toHaveLength(configuredLines.length);
  expect(productionOrders.map((item) => item.sourceDocumentLineId).sort()).toEqual(configuredLines.map((line) => line.id).sort());
  expect(productionOrders.every((item) => item.status === "ABIERTA")).toBe(true);
  expect(productionOrders.every((item) => item.assemblyWorkOrder?.reservationStatus === "RESERVED")).toBe(true);
  expect(productionOrders.every((item) => item.assemblyWorkOrder?.pickLists.some((list) => list.status === "DRAFT"))).toBe(true);
  expect(await prisma.productionOrder.count({ where: { sourceDocumentId: order.id, sourceDocumentLineId: { in: directLines.map((line) => line.id) } } })).toBe(0);
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
  await expect(page.getByRole("button", { name: "Liberar materiales" })).toHaveCount(0);
  await expect(page.getByText("ENTRY_FITTING", { exact: true })).toHaveCount(0);
  await expect(page.getByText("HOSE", { exact: true })).toHaveCount(0);
  await expect(page.getByText("EXIT_FITTING", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Confirmar materiales recogidos" })).toHaveCount(0);
  await expect(page.getByTestId("assembly-work-steps")).toContainText("Confirma el pedido de origen antes de enviarlo a almacén");
  await attachAccessibilityEvidence(page, testInfo, "sales-approved");
  await page.screenshot({ path: testInfo.outputPath("sales-technical-approved-1440.png"), fullPage: true });

  await prisma.salesInternalOrder.update({
    where: { id: order.id },
    data: { status: "CONFIRMADA", confirmedAt: new Date() },
  });
  await page.goto(`/production/requests/${order.id}`);
  await expect(page.getByTestId("prepare-for-delivery-form")).toHaveCount(0);
  expect(await prisma.auditLog.count({ where: { entityId: order.id, action: "MARK_PREPARED_FOR_DELIVERY" } })).toBe(0);
  await page.goto("/logout");
  await loginAs(
    page,
    "WAREHOUSE_OPERATOR",
    `/production/orders/${productionOrder.id}`,
    `/production/orders/${productionOrder.id}`,
  );
  await expect(page.getByTestId("assembly-technical-status")).toHaveText("APROBADO");
  await expect(page.getByRole("button", { name: "Liberar materiales" })).toBeVisible();
  const keyboardSequence = await reachActionWithKeyboard(page, "Liberar materiales");
  await testInfo.attach("warehouse-keyboard-sequence.json", {
    body: Buffer.from(JSON.stringify(keyboardSequence, null, 2)),
    contentType: "application/json",
  });
  await attachAccessibilityEvidence(page, testInfo, "warehouse-approved");
  await page.screenshot({ path: testInfo.outputPath("warehouse-technical-approved-1440.png"), fullPage: true });

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
      decision: "REQUIRES_REVIEW",
      severity: "WARN",
      description: "La combinación requiere revisión técnica controlada",
    },
  });
  await page.reload();
  await expect(page.getByTestId("assembly-technical-status")).toHaveText("REQUIERE REVISIÓN");
  await expect(page.getByTestId("assembly-technical-safety")).toContainText("Solicita revisión técnica");
  await expect(page.getByTestId("assembly-work-steps")).toContainText("Solicita revisión técnica antes de liberar, sustituir o consumir materiales");
  await expect(page.getByTestId("assembly-work-steps")).not.toContainText("Libera materiales para empezar");
  await expect(page.getByRole("button", { name: "Liberar materiales" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Confirmar materiales recogidos" })).toHaveCount(0);
  await attachAccessibilityEvidence(page, testInfo, "warehouse-review");
  await page.screenshot({ path: testInfo.outputPath("assembly-technical-review-1440.png"), fullPage: true });

  await page.setViewportSize({ width: 640, height: 900 });
  await expect(page.getByTestId("assembly-technical-safety")).toBeVisible();
  const reflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(reflow.scrollWidth).toBeLessThanOrEqual(reflow.clientWidth);
  await page.screenshot({ path: testInfo.outputPath("assembly-technical-review-200-percent.png"), fullPage: true });

  await page.setViewportSize({ width: 1440, height: 1000 });
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
  await expect(page.getByTestId("assembly-work-steps")).toContainText("Detén la operación y solicita al responsable técnico una combinación compatible");
  await expect(page.getByTestId("assembly-work-steps")).not.toContainText("Libera materiales para empezar");
  await expect(page.getByRole("button", { name: "Liberar materiales" })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("assembly-technical-blocked-1440.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("assembly-technical-safety")).toBeVisible();
  const mobileReflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(mobileReflow.scrollWidth).toBeLessThanOrEqual(mobileReflow.clientWidth);
  await page.screenshot({ path: testInfo.outputPath("assembly-technical-blocked-390.png"), fullPage: true });
});
