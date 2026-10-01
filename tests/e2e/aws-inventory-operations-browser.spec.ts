import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { loginAs, USERS, expectForbidden } from "./lib/auth.helpers";
import { createAwsFixtureEvidence } from "./lib/aws-fixture-evidence";

const prisma = new PrismaClient();
const enabled = process.env.WMS_AWS_WRITE_E2E === "1";
const tag = `QA-INV-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
let evidence: Awaited<ReturnType<typeof createAwsFixtureEvidence>> | null = null;

const fixture = {
  warehouseId: "",
  productId: "",
  receivingLocationId: "",
  storageLocationId: "",
  warehouseCode: `${tag}-WH`,
  sku: `${tag}-SKU`,
  receivingLocationCode: `${tag}-REC`,
  storageLocationCode: `${tag}-STO`,
};

type InventorySnapshot = {
  stage: string;
  inventories: Array<{ locationId: string; quantity: number; reserved: number; available: number }>;
  movementCount: number;
  movementIds: string[];
  movements: Array<{ id: string; type: string; quantity: number; reference: string | null; operatorUserId: string | null }>;
  auditIds: string[];
  auditActions: string[];
  actors: Array<string | null>;
};

const snapshots: InventorySnapshot[] = [];

async function captureBeforeManifest() {
  const [{ schema }] = await prisma.$queryRaw<Array<{ schema: string }>>`SELECT current_schema() AS schema`;
  const [warehouses, products, locations] = await Promise.all([
    prisma.warehouse.findMany({ where: { code: fixture.warehouseCode }, select: { id: true, code: true } }),
    prisma.product.findMany({ where: { sku: fixture.sku }, select: { id: true, sku: true } }),
    prisma.location.findMany({ where: { code: { in: [fixture.receivingLocationCode, fixture.storageLocationCode] } }, select: { id: true, code: true } }),
  ]);
  return {
    phase: "before",
    capturedAt: new Date().toISOString(),
    schema,
    uniqueTag: tag,
    keys: {
      warehouseCode: fixture.warehouseCode,
      sku: fixture.sku,
      locationCodes: [fixture.receivingLocationCode, fixture.storageLocationCode],
    },
    records: { warehouses, products, locations },
    counts: { warehouses: warehouses.length, products: products.length, locations: locations.length },
  };
}

function inventoryEntityId(locationId: string) {
  return `${fixture.productId}:${locationId}`;
}

async function captureSnapshot(stage: string): Promise<InventorySnapshot> {
  const locationIds = [fixture.receivingLocationId, fixture.storageLocationId].filter(Boolean);
  const inventoryRows = fixture.productId && locationIds.length
    ? await prisma.inventory.findMany({
        where: { productId: fixture.productId, locationId: { in: locationIds } },
        select: { id: true, locationId: true, quantity: true, reserved: true, available: true },
      })
    : [];
  const movementRows = fixture.productId
    ? await prisma.inventoryMovement.findMany({
        where: { productId: fixture.productId },
        orderBy: { createdAt: "asc" },
        select: { id: true, type: true, quantity: true, reference: true, operatorUserId: true },
      })
    : [];
  const entityIds = locationIds.map(inventoryEntityId);
  if (fixture.productId && fixture.receivingLocationId && fixture.storageLocationId) {
    entityIds.push(`${fixture.productId}:${fixture.receivingLocationId}->${fixture.storageLocationId}`);
  }
  const audits = entityIds.length
    ? await prisma.auditLog.findMany({ where: { entityId: { in: entityIds } }, orderBy: { createdAt: "asc" }, select: { id: true, action: true, actorUserId: true } })
    : [];
  return {
    stage,
    inventories: locationIds.map((locationId) => {
      const row = inventoryRows.find((item) => item.locationId === locationId);
      return { locationId, quantity: row?.quantity ?? 0, reserved: row?.reserved ?? 0, available: row?.available ?? 0 };
    }),
    movementCount: movementRows.length,
    movementIds: movementRows.map(({ id }) => id),
    movements: movementRows,
    auditIds: audits.map(({ id }) => id),
    auditActions: audits.map(({ action }) => action),
    actors: audits.map(({ actorUserId }) => actorUserId),
  };
}

async function expectState(stage: string, receiving: number, storage: number, movementCount: number, action: string, actorUserId: string, movementType: string, movementQuantity: number) {
  const snapshot = await captureSnapshot(stage);
  snapshots.push(snapshot);
  expect(snapshot.inventories).toEqual([
    { locationId: fixture.receivingLocationId, quantity: receiving, reserved: 0, available: receiving },
    { locationId: fixture.storageLocationId, quantity: storage, reserved: 0, available: storage },
  ]);
  expect(snapshot.movementCount).toBe(movementCount);
  expect(snapshot.movements.at(-1)).toMatchObject({ operatorUserId: actorUserId, type: movementType, quantity: movementQuantity });
  const newActions = snapshot.auditActions.slice(snapshots.length > 1 ? snapshots[snapshots.length - 2].auditActions.length : 0);
  expect(newActions).toContain(action);
  const actionAudit = await prisma.auditLog.findFirstOrThrow({
    where: {
      action,
      actorUserId,
      entityId: { in: [inventoryEntityId(fixture.receivingLocationId), inventoryEntityId(fixture.storageLocationId), `${fixture.productId}:${fixture.receivingLocationId}->${fixture.storageLocationId}`] },
    },
    orderBy: { createdAt: "desc" },
  });
  expect(actionAudit.actorUserId).toBe(actorUserId);
  return snapshot;
}

async function expectPreState(stage: string, receiving: number, storage: number, movementCount: number) {
  const snapshot = await captureSnapshot(stage);
  snapshots.push(snapshot);
  expect(snapshot.inventories).toEqual([
    { locationId: fixture.receivingLocationId, quantity: receiving, reserved: 0, available: receiving },
    { locationId: fixture.storageLocationId, quantity: storage, reserved: 0, available: storage },
  ]);
  expect(snapshot.movementCount).toBe(movementCount);
  return snapshot;
}

async function auditForm(page: Page) {
  const form = page.locator("form").first();
  const axe = await new AxeBuilder({ page }).include("form").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe.violations.filter(({ impact }) => impact === "critical" || impact === "serious")).toEqual([]);
  expect(axe.violations.filter(({ id }) => id === "color-contrast")).toEqual([]);
  await expect(form).toBeVisible();
}

async function cleanupFixture() {
  const productIds = fixture.productId ? [fixture.productId] : [];
  const locationIds = [fixture.receivingLocationId, fixture.storageLocationId].filter(Boolean);
  const movementRows = productIds.length
    ? await prisma.inventoryMovement.findMany({ where: { productId: { in: productIds } }, select: { id: true } })
    : [];
  const movementIds = movementRows.map(({ id }) => id);
  const traceRows = movementIds.length || locationIds.length
    ? await prisma.traceRecord.findMany({
        where: { OR: [
          ...(movementIds.length ? [{ originMovementId: { in: movementIds } }] : []),
          ...(productIds.length ? [{ productId: { in: productIds } }] : []),
          ...(locationIds.length ? [{ locationId: { in: locationIds } }] : []),
        ] },
        select: { id: true, originMovementId: true },
      })
    : [];
  const traceIds = traceRows.map(({ id }) => id);
  const labelJobs = traceIds.length
    ? await prisma.labelPrintJob.findMany({ where: { traceRecordId: { in: traceIds } }, select: { id: true, traceRecordId: true } })
    : [];
  const inventoryRows = productIds.length
    ? await prisma.inventory.findMany({ where: { productId: { in: productIds }, locationId: { in: locationIds } }, select: { id: true } })
    : [];
  const entityIds = locationIds.map(inventoryEntityId);
  if (fixture.productId && fixture.receivingLocationId && fixture.storageLocationId) {
    entityIds.push(`${fixture.productId}:${fixture.receivingLocationId}->${fixture.storageLocationId}`);
  }
  const auditEntityIds = [...new Set([...entityIds, ...movementIds])];
  const auditRows = auditEntityIds.length
    ? await prisma.auditLog.findMany({ where: { entityId: { in: auditEntityIds } }, select: { id: true, entityId: true, action: true, actorUserId: true } })
    : [];
  const syncEventWhere: Prisma.SyncEventWhereInput = {
    entityType: "INVENTORY",
    entityId: { in: entityIds },
  };
  const syncRows = entityIds.length
    ? await prisma.syncEvent.findMany({ where: syncEventWhere, select: { id: true, entityId: true, action: true, status: true } })
    : [];
  const [{ schema }] = await prisma.$queryRaw<Array<{ schema: string }>>`SELECT current_schema() AS schema`;
  const duringIds = {
    warehouseIds: fixture.warehouseId ? [fixture.warehouseId] : [],
    productIds,
    locationIds,
    inventoryIds: inventoryRows.map(({ id }) => id),
    movementIds,
    traceIds,
    labelPrintJobIds: labelJobs.map(({ id }) => id),
    auditEntityIds,
    auditLogIds: auditRows.map(({ id }) => id),
    syncEventIds: syncRows.map(({ id }) => id),
  };
  let duringEvidenceError: unknown;
  try {
    try {
      await evidence?.write("during", {
        phase: "during",
        capturedAt: new Date().toISOString(),
        schema,
        uniqueTag: tag,
        fixture: { ...fixture },
        ids: duringIds,
        records: { inventories: inventoryRows, movements: movementRows, traces: traceRows, labelJobs, audits: auditRows, syncEvents: syncRows },
        snapshots,
      });
    } catch (error) {
      // Artifact failures must not prevent cleanup of the exact fixture IDs.
      duringEvidenceError = error;
    }
    if (labelJobs.length) await prisma.labelPrintJob.deleteMany({ where: { id: { in: labelJobs.map(({ id }) => id) } } });
    if (traceIds.length) await prisma.traceRecord.deleteMany({ where: { id: { in: traceIds } } });
    if (auditEntityIds.length) await prisma.auditLog.deleteMany({ where: { entityId: { in: auditEntityIds } } });
    if (syncRows.length) await prisma.syncEvent.deleteMany({ where: { id: { in: syncRows.map(({ id }) => id) } } });
    if (movementIds.length) await prisma.inventoryMovement.deleteMany({ where: { id: { in: movementIds } } });
    if (inventoryRows.length) await prisma.inventory.deleteMany({ where: { id: { in: inventoryRows.map(({ id }) => id) } } });
    if (productIds.length) await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    if (locationIds.length) await prisma.location.deleteMany({ where: { id: { in: locationIds } } });
    if (fixture.warehouseId) await prisma.warehouse.deleteMany({ where: { id: fixture.warehouseId } });
  } finally {
    const afterCounts = {
      warehouses: fixture.warehouseId ? await prisma.warehouse.count({ where: { id: fixture.warehouseId } }) : 0,
      products: productIds.length ? await prisma.product.count({ where: { id: { in: productIds } } }) : 0,
      locations: locationIds.length ? await prisma.location.count({ where: { id: { in: locationIds } } }) : 0,
      inventory: inventoryRows.length ? await prisma.inventory.count({ where: { id: { in: inventoryRows.map(({ id }) => id) } } }) : 0,
      movements: movementIds.length ? await prisma.inventoryMovement.count({ where: { id: { in: movementIds } } }) : 0,
      traces: traceIds.length ? await prisma.traceRecord.count({ where: { id: { in: traceIds } } }) : 0,
      labelPrintJobs: labelJobs.length ? await prisma.labelPrintJob.count({ where: { id: { in: labelJobs.map(({ id }) => id) } } }) : 0,
      audits: auditEntityIds.length ? await prisma.auditLog.count({ where: { entityId: { in: auditEntityIds } } }) : 0,
      syncEvents: syncRows.length ? await prisma.syncEvent.count({ where: { id: { in: syncRows.map(({ id }) => id) } } }) : 0,
      warehouseCode: await prisma.warehouse.count({ where: { code: fixture.warehouseCode } }),
      sku: await prisma.product.count({ where: { sku: fixture.sku } }),
      locationCodes: await prisma.location.count({ where: { code: { in: [fixture.receivingLocationCode, fixture.storageLocationCode] } } }),
    };
    await evidence?.write("after", { phase: "after", capturedAt: new Date().toISOString(), schema, uniqueTag: tag, ids: duringIds, counts: afterCounts, zeroResiduals: Object.values(afterCounts).every((count) => count === 0) });
    expect(Object.values(afterCounts)).toEqual(Array(Object.keys(afterCounts).length).fill(0));
  }
  if (duringEvidenceError) throw duringEvidenceError;
}

test.describe.serial("AWS inventory operations through browser", () => {
  test.skip(!enabled, "Set WMS_AWS_WRITE_E2E=1 only for the explicitly authorized AWS write lane.");

  test.beforeAll(async () => {
    evidence = await createAwsFixtureEvidence("aws-inventory-operations", tag);
    const before = await captureBeforeManifest();
    await evidence.write("before", before);
    expect(Object.values(before.counts)).toEqual(Array(Object.keys(before.counts).length).fill(0));

    const warehouse = await prisma.warehouse.create({ data: { code: fixture.warehouseCode, name: `Almacén ${tag}`, isActive: true } });
    fixture.warehouseId = warehouse.id;
    const product = await prisma.product.create({ data: { sku: fixture.sku, name: `Material individual ${tag}`, type: "ACCESSORY" } });
    fixture.productId = product.id;
    const receiving = await prisma.location.create({ data: { code: fixture.receivingLocationCode, name: `Recepción ${tag}`, zone: "QA", usageType: "RECEIVING", isActive: true, warehouseId: warehouse.id }, select: { id: true } });
    fixture.receivingLocationId = receiving.id;
    const storage = await prisma.location.create({ data: { code: fixture.storageLocationCode, name: `Almacenaje ${tag}`, zone: "QA", usageType: "STORAGE", isActive: true, warehouseId: warehouse.id }, select: { id: true } });
    fixture.storageLocationId = storage.id;
    expect(await prisma.inventory.count({ where: { productId: product.id } })).toBe(0);
  });

  test.afterAll(async () => {
    try {
      await cleanupFixture();
    } finally {
      await prisma.$disconnect();
    }
  });

  test("Warehouse recibe y surte, Manager ajusta, Warehouse transfiere y Sales queda bloqueado", async ({ page }) => {
    const operator = await prisma.user.findUniqueOrThrow({ where: { email: USERS.WAREHOUSE_OPERATOR.email }, select: { id: true } });
    const manager = await prisma.user.findUniqueOrThrow({ where: { email: USERS.MANAGER.email }, select: { id: true } });

    await loginAs(page, "WAREHOUSE_OPERATOR", "/inventory/receive", "/inventory/receive");
    await page.goto("/inventory/receive");
    const themeToggle = page.locator("header").getByRole("button", { name: "Cambiar tema" });
    await expect(themeToggle).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", /^(dark|light)$/);
    if (await page.locator("html").getAttribute("data-theme") !== "dark") {
      await themeToggle.click();
    }
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("heading", { name: "Recepción (Entrada)" })).toBeVisible();
    await expectPreState("before-receive", 0, 0, 0);
    await auditForm(page);
    await themeToggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await auditForm(page);
    await page.locator('input[name="code"]').fill(fixture.sku);
    await page.locator('input[name="quantity"]').fill("12");
    await page.locator('select[name="warehouseId"]').selectOption(fixture.warehouseId);
    await page.locator('select[name="locationId"]').selectOption(fixture.receivingLocationId);
    await page.getByLabel(/OC, factura o remisión/i).fill(`${tag}-RECEIPT`);
    await page.getByRole("button", { name: "Registrar entrada" }).click();
    await expect(page).toHaveURL(/\/labels\/jobs\/[^/?]+\?next=/);
    await expect(page.getByRole("heading", { name: "Etiqueta" })).toBeVisible();
    await page.getByRole("link", { name: "Volver" }).click();
    await expect(page.getByText("Entrada registrada.")).toBeVisible();
    await expectState("after-receive", 12, 0, 1, "RECEIVE_FORM_SUBMIT", operator.id, "IN", 12);

    await expectPreState("before-pick", 12, 0, 1);
    await page.goto("/inventory/pick");
    await page.locator('input[name="code"]').fill(fixture.sku);
    await page.locator('input[name="quantity"]').fill("3");
    await page.locator('select[name="location"]').selectOption(fixture.receivingLocationCode);
    await page.locator('input[name="reference"]').fill(`${tag}-PICK`);
    await page.getByRole("button", { name: "Registrar salida" }).click();
    await expect(page).toHaveURL(/\/labels\/jobs\/[^/?]+\?next=/);
    await page.getByRole("link", { name: "Volver" }).click();
    await expect(page.getByText("Salida registrada.")).toBeVisible();
    await expectState("after-pick", 9, 0, 2, "PICK_FORM_SUBMIT", operator.id, "OUT", 3);

    await loginAs(page, "MANAGER", "/inventory/adjust", "/inventory/adjust");
    await expectPreState("before-manager-adjustment", 9, 0, 2);
    await page.locator('input[name="code"]').fill(fixture.sku);
    await page.locator('input[name="delta"]').fill("2");
    await page.locator('select[name="location"]').selectOption(fixture.receivingLocationCode);
    await page.locator('select[name="reason"]').selectOption("AJUSTE_AUTORIZADO");
    await page.getByRole("button", { name: "Registrar ajuste" }).click();
    await expect(page).toHaveURL(/\/labels\/jobs\/[^/?]+\?next=/);
    await page.getByRole("link", { name: "Volver" }).click();
    await expect(page.getByText("Ajuste registrado.")).toBeVisible();
    await expectState("after-manager-adjustment", 11, 0, 3, "ADJUST_FORM_SUBMIT", manager.id, "ADJUSTMENT", 2);

    await loginAs(page, "WAREHOUSE_OPERATOR", "/inventory/transfer", "/inventory/transfer");
    await expectPreState("before-transfer", 11, 0, 3);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/inventory/transfer");
    await expect(page.getByRole("heading", { name: "Transferencia Interna" })).toBeVisible();
    await auditForm(page);
    const reflow = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    expect(reflow.scrollWidth).toBeLessThanOrEqual(reflow.clientWidth);
    await page.locator('input[name="code"]').fill(fixture.sku);
    await page.locator('input[name="quantity"]').fill("4");
    await page.locator('select[name="fromLocation"]').selectOption(fixture.receivingLocationCode);
    await page.locator('select[name="toLocation"]').selectOption(fixture.storageLocationCode);
    await page.locator('input[name="reference"]').fill(`${tag}-TRANSFER`);
    await page.getByRole("button", { name: "Registrar transferencia" }).click();
    await expect(page.getByText("Transferencia registrada.")).toBeVisible();
    await expectState("after-transfer", 7, 4, 4, "TRANSFER_STOCK", operator.id, "TRANSFER", 4);

    await loginAs(page, "SALES_EXECUTIVE", "/requests", "/requests");
    const beforeDenied = await expectPreState("before-sales-denials", 7, 4, 4);
    await expectForbidden(page, "/inventory/receive");
    await expectForbidden(page, "/inventory/pick");
    await expectForbidden(page, "/inventory/transfer");
    await expectForbidden(page, "/inventory/adjust");
    const afterDenied = await captureSnapshot("after-sales-denials");
    snapshots.push(afterDenied);
    expect(afterDenied).toEqual({ ...beforeDenied, stage: "after-sales-denials" });
  });
});
