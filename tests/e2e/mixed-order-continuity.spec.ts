import { expect, test, type Locator, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { loginAs, USERS } from "./lib/auth.helpers";
import { createAwsFixtureEvidence } from "./lib/aws-fixture-evidence";

const prisma = new PrismaClient();
const tag = `QA-MIX-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
const secondaryPassword = randomUUID();
let evidence: Awaited<ReturnType<typeof createAwsFixtureEvidence>> | null = null;

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

async function focusWithTab(page: Page, target: Locator, maxTabs = 80) {
  await expect(target).toBeVisible();
  for (let step = 0; step < maxTabs; step += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error("Keyboard focus did not reach the expected control after 80 Tab presses.");
}

async function captureBeforeManifest() {
  const [{ schema }] = await prisma.$queryRaw<Array<{ schema: string }>>`SELECT current_schema() AS schema`;
  const locationCodes = [`${tag}-STO`, `${tag}-STG`, `${tag}-WIP`, `${tag}-SHIP`];
  const [warehouses, customers, products, locations, secondaryUsers, technicalSources] = await Promise.all([
    prisma.warehouse.findMany({ where: { code: fixture.warehouseCode }, select: { id: true, code: true } }),
    prisma.customer.findMany({ where: { code: `${tag}-C` }, select: { id: true, code: true } }),
    prisma.product.findMany({ where: { sku: { in: [fixture.entrySku, fixture.exitSku, fixture.hoseSku, fixture.directSku] } }, select: { id: true, sku: true } }),
    prisma.location.findMany({ where: { code: { in: locationCodes } }, select: { id: true, code: true } }),
    prisma.user.findMany({ where: { email: `${tag.toLowerCase()}-operator@qa.invalid` }, select: { id: true, email: true } }),
    prisma.productTechnicalSource.findMany({ where: { documentRef: `FICHA-${tag}` }, select: { id: true, documentRef: true } }),
  ]);
  return {
    phase: "before",
    capturedAt: new Date().toISOString(),
    schema,
    uniqueTag: tag,
    keys: { warehouseCode: fixture.warehouseCode, customerCode: `${tag}-C`, skus: [fixture.entrySku, fixture.exitSku, fixture.hoseSku, fixture.directSku], locationCodes, secondaryUserEmail: `${tag.toLowerCase()}-operator@qa.invalid`, technicalSourceDocumentRef: `FICHA-${tag}` },
    records: { warehouses, customers, products, locations, secondaryUsers, technicalSources },
    counts: { warehouses: warehouses.length, customers: customers.length, products: products.length, locations: locations.length, secondaryUsers: secondaryUsers.length, technicalSources: technicalSources.length },
  };
}

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
  // Match loginAs: unmount the prior role before clearing its cookies so an
  // in-flight session request cannot restore the previous identity.
  await page.goto("about:blank");
  await page.context().clearCookies();
  await page.request.get("/api/auth/session");
  await page.request.get("/api/auth/csrf");
  const cacheBuster = process.env.WMS_E2E_NO_CACHE === "1" ? `&e2eNonce=${Date.now()}` : "";
  await page.goto(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}${cacheBuster}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contrasena").fill(password);
  await page.getByRole("button", { name: "Iniciar sesion" }).click();
  await expect(page).toHaveURL(new RegExp(callbackUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  await page.reload();
  await expect(page.getByRole("banner")).toContainText(email);
  await page.waitForLoadState("networkidle");
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
  const exceptions = orderIds.length
    ? await prisma.salesInternalOrderException.findMany({ where: { orderId: { in: orderIds } }, select: { id: true, returns: { select: { id: true, items: { select: { id: true } } } } } })
    : [];
  const exceptionIds = exceptions.map(({ id }) => id);
  const returnIds = exceptions.flatMap(({ returns }) => returns.map(({ id }) => id));
  const returnItemIds = exceptions.flatMap(({ returns }) => returns.flatMap(({ items }) => items.map(({ id }) => id)));
  const salesLineIds = scopedOrders.flatMap((order) => order.lines.map(({ id }) => id));
  const salesPickListIds = scopedOrders.flatMap((order) => order.pickLists.map(({ id }) => id));
  const salesPickTaskIds = scopedOrders.flatMap((order) => order.pickLists.flatMap(({ tasks }) => tasks.map(({ id }) => id)));
  const productionItemIds = scopedProductionOrders.flatMap((order) => order.items.map(({ id }) => id));
  const assemblyConfigurationIds = scopedProductionOrders.flatMap((order) => order.assemblyConfiguration ? [order.assemblyConfiguration.id] : []);
  const assemblyWorkOrderIds = scopedProductionOrders.flatMap((order) => order.assemblyWorkOrder ? [order.assemblyWorkOrder.id] : []);
  const assemblyLineIds = scopedProductionOrders.flatMap((order) => order.assemblyWorkOrder?.lines.map(({ id }) => id) ?? []);
  const assemblyPickListIds = scopedProductionOrders.flatMap((order) => order.assemblyWorkOrder?.pickLists.map(({ id }) => id) ?? []);
  const assemblyPickTaskIds = scopedProductionOrders.flatMap((order) => order.assemblyWorkOrder?.pickLists.flatMap(({ tasks }) => tasks.map(({ id }) => id)) ?? []);
  const assemblyLinePickTaskIds = scopedProductionOrders.flatMap((order) => order.assemblyWorkOrder?.lines.flatMap(({ pickTasks }) => pickTasks.map(({ id }) => id)) ?? []);
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
    ...exceptionIds, ...returnIds, ...returnItemIds,
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
  const inventoryRows = fixture.productIds.length
    ? await prisma.inventory.findMany({ where: { productId: { in: fixture.productIds } }, select: { id: true, productId: true, locationId: true, quantity: true, reserved: true, available: true } })
    : [];
  const movementRows = movementScope.length
    ? await prisma.inventoryMovement.findMany({ where: { OR: movementScope }, select: { id: true, documentId: true, productId: true, locationId: true, type: true, quantity: true } })
    : [];
  const traceRows = fixture.warehouseId
    ? await prisma.traceRecord.findMany({ where: { warehouseId: fixture.warehouseId }, select: { id: true } })
    : [];
  const traceIds = traceRows.map(({ id }) => id);
  const labelJobs = traceIds.length
    ? await prisma.labelPrintJob.findMany({ where: { traceRecordId: { in: traceIds } }, select: { id: true, traceRecordId: true } })
    : [];
  const ruleRows = fixture.productIds.length
    ? await prisma.productCompatibilityRule.findMany({ where: { OR: [{ productId: { in: fixture.productIds } }, { compatibleProductId: { in: fixture.productIds } }] }, select: { id: true } })
    : [];
  const attributeRows = fixture.productIds.length
    ? await prisma.productTechnicalAttribute.findMany({ where: { productId: { in: fixture.productIds } }, select: { id: true } })
    : [];
  const sourceIds = fixture.technicalSourceId ? [fixture.technicalSourceId] : [];
  const userIds = fixture.secondaryOperatorId ? [fixture.secondaryOperatorId] : [];
  const userRoles = userIds.length
    ? await prisma.userRole.findMany({ where: { userId: { in: userIds } }, select: { userId: true, roleId: true } })
    : [];
  const orderEventIds = [...orderIds, ...productionIds];
  const syncEventWhere: Prisma.SyncEventWhereInput = {
    OR: [
      ...(inventoryEntityIds.length ? [{ entityType: "INVENTORY", entityId: { in: inventoryEntityIds } }] : []),
      ...(orderEventIds.length ? [{ entityType: "ORDER", entityId: { in: orderEventIds } }] : []),
      ...(fixture.productIds.length ? [{ entityType: "PRODUCT", entityId: { in: fixture.productIds } }] : []),
    ],
  };
  const syncEvents = syncEventWhere.OR?.length ? await prisma.syncEvent.findMany({ where: syncEventWhere, select: { id: true, entityType: true, entityId: true, action: true, status: true } }) : [];
  const auditEntityIds = [...new Set([
    ...childEntityIds, ...inventoryEntityIds, ...fixture.productIds, ...fixture.locationIds,
    fixture.warehouseId, fixture.customerId, ...sourceIds, ...ruleRows.map(({ id }) => id),
    ...attributeRows.map(({ id }) => id), ...userIds, ...movementRows.map(({ id }) => id),
  ].filter((value): value is string => Boolean(value)))];
  const auditRows = auditEntityIds.length
    ? await prisma.auditLog.findMany({ where: { entityId: { in: auditEntityIds } }, select: { id: true, entityType: true, entityId: true, action: true, actorUserId: true } })
    : [];

  const duringIds = {
    warehouseIds: fixture.warehouseId ? [fixture.warehouseId] : [],
    customerIds: fixture.customerId ? [fixture.customerId] : [],
    productIds: [...fixture.productIds], locationIds: [...fixture.locationIds], salesOrderIds: orderIds,
    salesLineIds, salesPickListIds, salesPickTaskIds, exceptionIds, returnIds, returnItemIds,
    productionOrderIds: productionIds, productionItemIds, assemblyConfigurationIds, assemblyWorkOrderIds,
    assemblyLineIds, assemblyPickListIds, assemblyPickTaskIds, assemblyLinePickTaskIds,
    inventoryIds: inventoryRows.map(({ id }) => id), movementIds: movementRows.map(({ id }) => id),
    traceIds, labelPrintJobIds: labelJobs.map(({ id }) => id), technicalSourceIds: sourceIds,
    compatibilityRuleIds: ruleRows.map(({ id }) => id), technicalAttributeIds: attributeRows.map(({ id }) => id),
    userIds, userRoles, auditEntityIds, auditLogIds: auditRows.map(({ id }) => id),
    syncEventIds: syncEvents.map(({ id }) => id), inventoryEntityIds, orderEventIds, productEventIds: [...fixture.productIds],
  };
  const duringCounts = Object.fromEntries(Object.entries(duringIds).map(([key, ids]) => [key, Array.isArray(ids) ? ids.length : 0]));
  await evidence?.write("during", { phase: "during", capturedAt: new Date().toISOString(), uniqueTag: tag, schema: (await prisma.$queryRaw<Array<{ schema: string }>>`SELECT current_schema() AS schema`)[0]?.schema, ids: duringIds, counts: duringCounts });

  if (traceIds.length) await prisma.labelPrintJob.deleteMany({ where: { traceRecordId: { in: traceIds } } });
  if (traceIds.length) await prisma.traceRecord.deleteMany({ where: { id: { in: traceIds } } });
  if (auditEntityIds.length) await prisma.auditLog.deleteMany({ where: { entityId: { in: auditEntityIds } } });
  if (syncEventWhere.OR?.length) await prisma.syncEvent.deleteMany({ where: syncEventWhere });

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

  const afterCounts = {
    warehouses: fixture.warehouseId ? await prisma.warehouse.count({ where: { id: fixture.warehouseId } }) : 0,
    customers: fixture.customerId ? await prisma.customer.count({ where: { id: fixture.customerId } }) : 0,
    products: fixture.productIds.length ? await prisma.product.count({ where: { id: { in: fixture.productIds } } }) : 0,
    locations: fixture.locationIds.length ? await prisma.location.count({ where: { id: { in: fixture.locationIds } } }) : 0,
    salesOrders: orderIds.length ? await prisma.salesInternalOrder.count({ where: { id: { in: orderIds } } }) : 0,
    salesOrderLines: salesLineIds.length ? await prisma.salesInternalOrderLine.count({ where: { id: { in: salesLineIds } } }) : 0,
    salesPickLists: salesPickListIds.length ? await prisma.salesInternalOrderPickList.count({ where: { id: { in: salesPickListIds } } }) : 0,
    salesPickTasks: salesPickTaskIds.length ? await prisma.salesInternalOrderPickTask.count({ where: { id: { in: salesPickTaskIds } } }) : 0,
    exceptions: exceptionIds.length ? await prisma.salesInternalOrderException.count({ where: { id: { in: exceptionIds } } }) : 0,
    returns: returnIds.length ? await prisma.salesInternalOrderReturn.count({ where: { id: { in: returnIds } } }) : 0,
    returnItems: returnItemIds.length ? await prisma.salesInternalOrderReturnItem.count({ where: { id: { in: returnItemIds } } }) : 0,
    productionOrders: productionIds.length ? await prisma.productionOrder.count({ where: { id: { in: productionIds } } }) : 0,
    productionItems: productionItemIds.length ? await prisma.productionOrderItem.count({ where: { id: { in: productionItemIds } } }) : 0,
    assemblyConfigurations: assemblyConfigurationIds.length ? await prisma.assemblyConfiguration.count({ where: { id: { in: assemblyConfigurationIds } } }) : 0,
    assemblyWorkOrders: assemblyWorkOrderIds.length ? await prisma.assemblyWorkOrder.count({ where: { id: { in: assemblyWorkOrderIds } } }) : 0,
    assemblyWorkOrderLines: assemblyLineIds.length ? await prisma.assemblyWorkOrderLine.count({ where: { id: { in: assemblyLineIds } } }) : 0,
    assemblyPickLists: assemblyPickListIds.length ? await prisma.pickList.count({ where: { id: { in: assemblyPickListIds } } }) : 0,
    assemblyPickTasks: assemblyPickTaskIds.length ? await prisma.pickTask.count({ where: { id: { in: assemblyPickTaskIds } } }) : 0,
    assemblyLinePickTasks: assemblyLinePickTaskIds.length ? await prisma.pickTask.count({ where: { id: { in: assemblyLinePickTaskIds } } }) : 0,
    users: userIds.length ? await prisma.user.count({ where: { id: { in: userIds } } }) : 0,
    userRoles: userRoles.length ? await prisma.userRole.count({ where: { OR: userRoles } }) : 0,
    auditLogs: auditEntityIds.length ? await prisma.auditLog.count({ where: { entityId: { in: auditEntityIds } } }) : 0,
    syncEvents: syncEventWhere.OR?.length ? await prisma.syncEvent.count({ where: syncEventWhere }) : 0,
    traces: traceIds.length ? await prisma.traceRecord.count({ where: { id: { in: traceIds } } }) : 0,
    labelPrintJobs: labelJobs.length ? await prisma.labelPrintJob.count({ where: { id: { in: labelJobs.map(({ id }) => id) } } }) : 0,
    inventoryMovements: movementRows.length ? await prisma.inventoryMovement.count({ where: { id: { in: movementRows.map(({ id }) => id) } } }) : 0,
    inventories: inventoryRows.length ? await prisma.inventory.count({ where: { id: { in: inventoryRows.map(({ id }) => id) } } }) : 0,
    technicalSources: sourceIds.length ? await prisma.productTechnicalSource.count({ where: { id: { in: sourceIds } } }) : 0,
    compatibilityRules: ruleRows.length ? await prisma.productCompatibilityRule.count({ where: { id: { in: ruleRows.map(({ id }) => id) } } }) : 0,
    technicalAttributes: attributeRows.length ? await prisma.productTechnicalAttribute.count({ where: { id: { in: attributeRows.map(({ id }) => id) } } }) : 0,
  };
  await evidence?.write("after", { phase: "after", capturedAt: new Date().toISOString(), uniqueTag: tag, ids: duringIds, counts: afterCounts, zeroResiduals: Object.values(afterCounts).every((count) => count === 0) });
  expect(Object.values(afterCounts)).toEqual(Array(Object.keys(afterCounts).length).fill(0));
}

test.describe.serial("mixed sales order continuity", () => {
  test.beforeAll(async () => {
    evidence = await createAwsFixtureEvidence("mixed-order-continuity", tag);
    const before = await captureBeforeManifest();
    await evidence.write("before", before);
    expect(Object.values(before.counts)).toEqual(Array(Object.keys(before.counts).length).fill(0));

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
    try {
      await cleanupFixture();
    } finally {
      await prisma.$disconnect();
    }
  });

  test("V2/V6/V8 direct order reserves, fulfills under assignment, and prepares/delivers idempotently (KAN-16 keyboard-first)", async ({ browser, page }) => {
    await loginAs(page, "SALES_EXECUTIVE", "/production/requests/new", "/production/requests/new");
    const customerSearch = page.getByLabel("Selecciona o crea el cliente");
    const continueToProduct = page.getByRole("button", { name: "Continuar a producto →" });
    await expect(continueToProduct).toBeDisabled();
    await focusWithTab(page, customerSearch);
    await expect(customerSearch).toBeFocused();
    await page.keyboard.type(fixture.customerName);
    const customerOption = page.getByRole("button", { name: new RegExp(fixture.customerName) });
    await expect(customerOption).toBeVisible();
    await focusWithTab(page, customerOption);
    await expect(customerOption).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(continueToProduct).toBeEnabled();
    await focusWithTab(page, continueToProduct);
    await page.keyboard.press("Enter");

    const directProductChoice = page.getByRole("button", { name: "Producto directo" });
    await focusWithTab(page, directProductChoice);
    await page.keyboard.press("Enter");
    const warehouseSelect = page.getByLabel("Almacén para surtido");
    await focusWithTab(page, warehouseSelect);
    const warehouseOptions = await warehouseSelect.locator("option").evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value),
    );
    const warehouseIndex = warehouseOptions.indexOf(fixture.warehouseId);
    expect(warehouseIndex).toBeGreaterThan(0);
    await page.keyboard.press("Home");
    for (let index = 0; index < warehouseIndex; index += 1) {
      await page.keyboard.press("ArrowDown");
    }
    await page.keyboard.press("Enter");
    await expect(warehouseSelect).toHaveValue(fixture.warehouseId);

    const productSearch = page.getByTestId("new-order-direct-product-input");
    await focusWithTab(page, productSearch);
    await page.keyboard.type(fixture.directSku);
    const productOption = page.getByRole("button", { name: new RegExp(fixture.directSku) });
    await expect(productOption).toBeVisible();
    await focusWithTab(page, productOption);
    await expect(productOption).toBeFocused();
    await page.keyboard.press("Enter");

    const quantity = page.locator('input[type="number"]').first();
    await focusWithTab(page, quantity);
    await expect(quantity).toBeFocused();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("1");
    await expect(quantity).toHaveValue("1");
    const addProduct = page.getByRole("button", { name: "Agregar producto al pedido" });
    await focusWithTab(page, addProduct);
    await page.keyboard.press("Enter");
    const continueToDelivery = page.getByRole("button", { name: "Continuar a entrega →" });
    await focusWithTab(page, continueToDelivery);
    await page.keyboard.press("Enter");

    const createOrder = page.getByTestId("create-order-button");
    await expect(createOrder).toBeDisabled();
    const dueDate = page.getByLabel("Fecha compromiso");
    await focusWithTab(page, dueDate);
    await expect(dueDate).toBeFocused();
    // Playwright's fill handles the browser-native date control; all navigation and actions remain keyboard-driven.
    await dueDate.fill("2026-12-31");
    await expect(createOrder).toBeEnabled();
    await Promise.all([
      page.waitForURL(/\/production\/requests\/[^/?]+\?ok=/),
      (async () => {
        await focusWithTab(page, createOrder);
        await page.keyboard.press("Enter");
      })(),
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
    const dueDateBeforeChange = (await prisma.salesInternalOrder.findUniqueOrThrow({ where: { id: directOrder.id }, select: { dueDate: true } })).dueDate;
    const managerUser = await prisma.user.findUniqueOrThrow({ where: { email: USERS.MANAGER.email }, select: { id: true, name: true, email: true } });
    const commitmentForm = page.getByTestId("change-commitment-date-form");
    await expect(commitmentForm).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await commitmentForm.locator('input[name="dueDate"]').fill("2027-01-05");
    await commitmentForm.locator('input[name="reason"]').fill("Cliente confirmó nueva fecha de entrega");
    await Promise.all([
      page.waitForURL((url) => url.pathname.endsWith(`/production/requests/${directOrder.id}`) && url.searchParams.has("ok")),
      commitmentForm.getByRole("button", { name: "Actualizar compromiso" }).click(),
    ]);
    const [orderAfterDateChange, auditAfterDateChange, inventoryAfterDateChange, pickListAfterDateChange] = await Promise.all([
      prisma.salesInternalOrder.findUniqueOrThrow({ where: { id: directOrder.id }, select: { dueDate: true } }),
      prisma.auditLog.findFirstOrThrow({ where: { entityId: directOrder.id, action: "CHANGE_COMMITMENT_DATE" } }),
      prisma.inventory.findFirstOrThrow({ where: { productId: fixture.productIds[3], locationId: fixture.locationIds[0] }, select: { reserved: true, available: true } }),
      prisma.salesInternalOrderPickList.findFirstOrThrow({ where: { orderId: directOrder.id }, include: { tasks: true } }),
    ]);
    expect(orderAfterDateChange.dueDate).toEqual(new Date("2027-01-05T00:00:00.000Z"));
    expect(auditAfterDateChange.actorUserId).toBe(managerUser.id);
    expect(auditAfterDateChange.actor).toBe(managerUser.name || managerUser.email || managerUser.id);
    expect(auditAfterDateChange.source).toBe("sales/request-service/commitment-date");
    expect(JSON.parse(auditAfterDateChange.before ?? "{}")).toEqual({ dueDate: dueDateBeforeChange?.toISOString() ?? null });
    expect(JSON.parse(auditAfterDateChange.after ?? "{}")).toEqual({
      dueDate: orderAfterDateChange.dueDate?.toISOString(),
      reason: "Cliente confirmó nueva fecha de entrega",
    });
    expect(inventoryAfterDateChange.reserved).toBe(directInventory.reserved);
    expect(inventoryAfterDateChange.available).toBe(directInventory.available);
    expect(pickListAfterDateChange.id).toBe(draftPickList.id);
    expect(pickListAfterDateChange.status).toBe(draftPickList.status);
    expect(pickListAfterDateChange.tasks.map(({ id, status, reservedQty, pickedQty }) => ({ id, status, reservedQty, pickedQty })))
      .toEqual(draftPickList.tasks.map(({ id, status, reservedQty, pickedQty }) => ({ id, status, reservedQty, pickedQty })));

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole("button", { name: "Confirmar pedido" }).click();
    await page.getByTestId("manager-assign-order").locator("select").selectOption(fixture.salesUserId);
    await page.getByTestId("manager-assign-order").getByRole("button", { name: /Asignar vendedor|Reasignar antes de toma/ }).click();

    await loginFresh(page, "SALES_EXECUTIVE", `/production/requests/${directOrder.id}`);
    await expect(page.getByTestId("change-commitment-date-form")).toHaveCount(0);
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
    const directPickedQuantity = page.getByLabel("Cantidad surtida", { exact: true }).first();
    await expect(directPickedQuantity).toBeVisible();
    await expect(directPickedQuantity).toBeEnabled();
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
    const pickedQuantity = page.getByLabel("Cantidad surtida", { exact: true }).first();
    await expect(pickedQuantity).toBeVisible();
    await expect(pickedQuantity).toBeEnabled();
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
