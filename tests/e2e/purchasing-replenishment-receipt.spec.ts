import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { loginAs } from "./lib/auth.helpers";

const prisma = new PrismaClient();
const tag = `E2E-PO-${randomUUID().replaceAll("-", "").toUpperCase()}`;
const systemLabelTemplateCodes = [
  "RECEIPT_STANDARD", "RECEIPT_COMPACT", "PICKING_STANDARD", "PICKING_COMPACT",
  "LOCATION_STANDARD", "LOCATION_COMPACT", "ADJUSTMENT_STANDARD", "ADJUSTMENT_COMPACT",
  "WIP_STANDARD", "WIP_COMPACT",
];
const fixture = {
  supplierId: "",
  warehouseId: "",
  storageLocationId: "",
  receivingLocationId: "",
  productId: "",
  policyId: "",
  proposalId: "",
  purchaseOrderId: "",
  folio: `${tag}-OC`,
  supplierCode: `${tag}-SUP`,
  warehouseCode: `${tag}-WH`,
  storageCode: `${tag}-STO`,
  receivingCode: `${tag}-RECV`,
  sku: `${tag}-SKU`,
};

let beforeManifest: Record<string, unknown> = {};

async function captureManifest() {
  const [{ schema }] = await prisma.$queryRaw<Array<{ schema: string }>>`SELECT current_schema() AS schema`;
  const [suppliers, warehouses, products, policies, proposals, orders, labelTemplates] = await Promise.all([
    prisma.supplier.findMany({ where: { code: fixture.supplierCode }, select: { id: true, code: true } }),
    prisma.warehouse.findMany({ where: { code: fixture.warehouseCode }, select: { id: true, code: true } }),
    prisma.product.findMany({ where: { sku: fixture.sku }, select: { id: true, sku: true } }),
    prisma.replenishmentPolicy.findMany({ where: { product: { sku: fixture.sku }, warehouse: { code: fixture.warehouseCode } }, select: { id: true, productId: true, warehouseId: true, active: true } }),
    prisma.replenishmentProposal.findMany({ where: { product: { sku: fixture.sku }, warehouse: { code: fixture.warehouseCode } }, select: { id: true, policyId: true, status: true, purchaseOrderId: true } }),
    prisma.purchaseOrder.findMany({ where: { folio: fixture.folio }, select: { id: true, folio: true, status: true } }),
    prisma.labelTemplate.findMany({ where: { code: { in: systemLabelTemplateCodes } }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true, labelType: true, isActive: true, isDefault: true, definitionJson: true } }),
  ]);
  const linkedOrderIds = proposals.map((proposal) => proposal.purchaseOrderId).filter((id): id is string => Boolean(id));
  const orderIds = Array.from(new Set([...orders.map((order) => order.id), ...linkedOrderIds]));
  const linkedOrders = orderIds.length > 0
    ? await prisma.purchaseOrder.findMany({ where: { id: { in: orderIds } }, select: { id: true, folio: true, status: true } })
    : [];
  const allOrders = Array.from(new Map([...orders, ...linkedOrders].map((order) => [order.id, order])).values());
  const receipts = orderIds.length
    ? await prisma.purchaseReceipt.findMany({ where: { purchaseOrderId: { in: orderIds } }, select: { id: true, purchaseOrderId: true } })
    : [];
  const receiptIds = receipts.map((receipt) => receipt.id);
  const [locations, inventories, movements, syncEvents] = await Promise.all([
    prisma.location.findMany({ where: { code: { in: [fixture.storageCode, fixture.receivingCode] } }, select: { id: true, code: true } }),
    prisma.inventory.findMany({ where: { product: { sku: fixture.sku } }, select: { id: true, productId: true, locationId: true, quantity: true, available: true } }),
    receiptIds.length
      ? prisma.inventoryMovement.findMany({ where: { documentType: "PURCHASE_RECEIPT", documentId: { in: receiptIds } }, select: { id: true, type: true, quantity: true, documentId: true } })
      : Promise.resolve([]),
    fixture.productId
      ? prisma.syncEvent.findMany({ where: { entityType: "INVENTORY", entityId: { in: [fixture.storageLocationId, fixture.receivingLocationId].filter(Boolean).map((locationId) => `${fixture.productId}:${locationId}`) } }, select: { id: true, entityId: true, action: true, status: true } })
      : Promise.resolve([]),
  ]);
  const inventoryEventEntityIds = [fixture.storageLocationId, fixture.receivingLocationId].filter(Boolean).map((locationId) => `${fixture.productId}:${locationId}`);
  const auditEntityIds = [...orderIds, ...proposals.map((proposal) => proposal.id), ...receipts.map((receipt) => receipt.id), ...movements.map((movement) => movement.id), ...inventoryEventEntityIds];
  const audits = auditEntityIds.length
    ? await prisma.auditLog.findMany({ where: { entityId: { in: auditEntityIds } }, select: { id: true, entityType: true, entityId: true, action: true, actorUserId: true } })
    : [];
  return {
    capturedAt: new Date().toISOString(),
    schema,
    uniqueTag: tag,
    identities: { ...fixture },
    records: { suppliers, warehouses, products, policies, proposals, orders: allOrders, locations, inventories, receipts, movements, syncEvents, audits, labelTemplates },
  };
}

async function cleanupFixture() {
  if (!fixture.purchaseOrderId && fixture.proposalId) {
    const proposal = await prisma.replenishmentProposal.findUnique({ where: { id: fixture.proposalId }, select: { purchaseOrderId: true } });
    fixture.purchaseOrderId = proposal?.purchaseOrderId ?? "";
  }
  const orderIds = fixture.purchaseOrderId ? [fixture.purchaseOrderId] : [];
  const receipts = orderIds.length
    ? await prisma.purchaseReceipt.findMany({ where: { purchaseOrderId: { in: orderIds } }, select: { id: true } })
    : [];
  const receiptIds = receipts.map(({ id }) => id);
  const movements = receiptIds.length
    ? await prisma.inventoryMovement.findMany({ where: { documentType: "PURCHASE_RECEIPT", documentId: { in: receiptIds } }, select: { id: true } })
    : [];
  const movementIds = movements.map(({ id }) => id);
  const inventoryEventIds = [fixture.storageLocationId, fixture.receivingLocationId].filter(Boolean).map((locationId) => `${fixture.productId}:${locationId}`);
  const traceRows = movementIds.length
    ? await prisma.traceRecord.findMany({ where: { originMovementId: { in: movementIds } }, select: { id: true } })
    : [];
  const traceIds = traceRows.map(({ id }) => id);

  const entityIds = [fixture.proposalId, fixture.purchaseOrderId, fixture.policyId, fixture.productId, fixture.warehouseId, ...receiptIds, ...movementIds, ...inventoryEventIds].filter(Boolean);
  if (entityIds.length) await prisma.auditLog.deleteMany({ where: { entityId: { in: entityIds } } });
  if (inventoryEventIds.length) await prisma.syncEvent.deleteMany({ where: { entityType: "INVENTORY", entityId: { in: inventoryEventIds } } });
  if (traceIds.length) await prisma.labelPrintJob.deleteMany({ where: { traceRecordId: { in: traceIds } } });
  if (traceIds.length) await prisma.traceRecord.deleteMany({ where: { id: { in: traceIds } } });
  if (movementIds.length) await prisma.inventoryMovement.deleteMany({ where: { id: { in: movementIds } } });
  if (receiptIds.length) await prisma.purchaseReceiptLine.deleteMany({ where: { purchaseReceiptId: { in: receiptIds } } });
  if (receiptIds.length) await prisma.purchaseReceipt.deleteMany({ where: { id: { in: receiptIds } } });
  if (orderIds.length) await prisma.purchaseOrderDocument.deleteMany({ where: { purchaseOrderId: { in: orderIds } } });
  if (orderIds.length) await prisma.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: { in: orderIds } } });
  if (orderIds.length) await prisma.purchaseOrder.deleteMany({ where: { id: { in: orderIds } } });
  if (fixture.proposalId) await prisma.replenishmentProposal.deleteMany({ where: { id: fixture.proposalId } });
  if (fixture.policyId) await prisma.replenishmentPolicy.deleteMany({ where: { id: fixture.policyId } });
  if (fixture.productId) {
    await prisma.inventory.deleteMany({ where: { productId: fixture.productId } });
    await prisma.product.deleteMany({ where: { id: fixture.productId } });
  }
  if (fixture.storageLocationId || fixture.receivingLocationId) {
    await prisma.location.deleteMany({ where: { id: { in: [fixture.storageLocationId, fixture.receivingLocationId].filter(Boolean) } } });
  }
  if (fixture.warehouseId) await prisma.warehouse.deleteMany({ where: { id: fixture.warehouseId } });
  if (fixture.supplierId) await prisma.supplier.deleteMany({ where: { id: fixture.supplierId } });
}

async function writeManifest(during: Record<string, unknown>, after: Record<string, unknown>) {
  const directory = process.env.WMS_AWS_EVIDENCE_DIR ?? path.join("output", `purchasing-${tag.toLowerCase()}`);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "purchasing-fixture-manifest.json"), JSON.stringify({ before: beforeManifest, during, after }, null, 2), "utf8");
}

async function loginFresh(page: Page, role: "MANAGER" | "WAREHOUSE_OPERATOR" | "SALES_EXECUTIVE", callbackUrl: string) {
  await page.goto("about:blank");
  await page.context().clearCookies();
  await loginAs(page, role, callbackUrl, callbackUrl);
}

async function setMobileTheme(page: Page, theme: "light" | "dark") {
  const current = await page.locator("html").getAttribute("data-theme");
  if (current === theme) return;
  await page.getByRole("button", { name: "Abrir navegacion" }).click();
  const navigationDialog = page.getByRole("dialog", { name: "WMS ERP" });
  await navigationDialog.getByRole("button", { name: "Cambiar tema" }).click();
  await navigationDialog.getByRole("button", { name: "Cerrar navegacion" }).click();
  await expect.poll(() => page.locator("html").getAttribute("data-theme")).toBe(theme);
}

test.describe.serial("AWS purchasing proposal to receipt acceptance", () => {
  test.beforeAll(async () => {
    beforeManifest = await captureManifest();
    const baselineRows = Object.entries((beforeManifest as { records: Record<string, unknown[]> }).records)
      .filter(([key]) => key !== "labelTemplates")
      .map(([, rows]) => rows);
    if (baselineRows.some((rows) => rows.length > 0)) {
      throw new Error(`UUID fixture collision detected before writes: ${tag}`);
    }
    const labelTemplates = (beforeManifest as { records: { labelTemplates: Array<{ code: string; isActive: boolean }> } }).records.labelTemplates;
    if (labelTemplates.length !== systemLabelTemplateCodes.length || labelTemplates.some((template) => !template.isActive)) {
      throw new Error("Receipt E2E requires the canonical active label templates to exist; refusing to create or repair shared templates in public");
    }
    const supplier = await prisma.supplier.create({ data: { code: fixture.supplierCode, name: `${tag} supplier`, isActive: true, paymentTerms: "QA only" } });
    fixture.supplierId = supplier.id;
    const warehouse = await prisma.warehouse.create({ data: { code: fixture.warehouseCode, name: `${tag} warehouse`, address: "E2E disposable fixture", isActive: true } });
    fixture.warehouseId = warehouse.id;
    const product = await prisma.product.create({ data: { sku: fixture.sku, name: `${tag} product`, type: "ACCESSORY", unitLabel: "unidad", purchaseUnitFactor: 1 } });
    fixture.productId = product.id;
    await prisma.product.update({ where: { id: product.id }, data: { primarySupplierId: supplier.id } });

    const storage = await prisma.location.create({ data: { code: fixture.storageCode, name: `${tag} storage`, zone: "QA", usageType: "STORAGE", isActive: true, warehouseId: warehouse.id } });
    fixture.storageLocationId = storage.id;
    const receiving = await prisma.location.create({ data: { code: fixture.receivingCode, name: `${tag} receiving`, zone: "QA", usageType: "RECEIVING", isActive: true, warehouseId: warehouse.id } });
    fixture.receivingLocationId = receiving.id;
    await prisma.inventory.create({ data: { productId: product.id, locationId: storage.id, quantity: 0, reserved: 0, available: 0 } });

    const policy = await prisma.replenishmentPolicy.create({
      data: { productId: product.id, warehouseId: warehouse.id, minimumStock: 5, maximumStock: 10, leadTimeDays: 0, reviewWindowDays: 30, active: true },
    });
    fixture.policyId = policy.id;
    const proposal = await prisma.replenishmentProposal.create({
      data: {
        policyId: policy.id,
        productId: product.id,
        warehouseId: warehouse.id,
        status: "PROPOSED",
        availableStock: 0,
        incomingQuantity: 0,
        consumedQuantity: 0,
        windowDays: 30,
        averageDailyConsumption: 0,
        recommendedQuantity: 10,
        purchaseUnitFactor: 1,
        reason: `Propuesta exclusiva de prueba ${tag}`,
      },
    });
    fixture.proposalId = proposal.id;
  });

  test.afterAll(async () => {
    try {
      const during = await captureManifest();
      await cleanupFixture();
      const after = await captureManifest();
      await writeManifest(during, after);
      const records = after.records as Record<string, unknown[]>;
      expect(Object.entries(records).filter(([key]) => key !== "labelTemplates").every(([, rows]) => rows.length === 0)).toBe(true);
      const beforeTemplates = (beforeManifest as { records: { labelTemplates: unknown[] } }).records.labelTemplates;
      expect(JSON.stringify(records.labelTemplates)).toBe(JSON.stringify(beforeTemplates));
    } finally {
      await prisma.$disconnect();
    }
  });

  test("Manager convierte únicamente su propuesta, confirma OC y conserva PDF accesible en móvil y ambos temas", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginFresh(page, "MANAGER", "/purchasing");
    await expect(page.getByRole("heading", { name: "Propuestas de reabasto" })).toBeVisible();
    const proposalCard = page.getByRole("article").filter({ has: page.getByText(fixture.sku, { exact: true }) });
    await proposalCard.scrollIntoViewIfNeeded();
    await expect(proposalCard).toBeVisible();
    await expect(proposalCard.getByText(fixture.sku, { exact: true })).toBeVisible();
    await expect(proposalCard).toContainText("10");
    await proposalCard.getByRole("button", { name: "Aprobar y crear OC" }).click();
    await expect(page).toHaveURL(new RegExp(`/purchasing/orders/[^/?]+`));
    fixture.purchaseOrderId = page.url().match(/\/purchasing\/orders\/([^/?]+)/)?.[1] ?? "";
    expect(fixture.purchaseOrderId).toBeTruthy();
    const purchaseOrderLine = page.getByRole("article").filter({ has: page.getByText(fixture.sku, { exact: true }) });
    await purchaseOrderLine.scrollIntoViewIfNeeded();
    await expect(purchaseOrderLine).toBeVisible();
    await expect(purchaseOrderLine.getByText(fixture.sku, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Confirmar OC" }).click();
    await expect(page.getByText("Confirmada", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Descargar PDF/i })).toBeVisible();

    await setMobileTheme(page, "light");
    await expect.poll(() => page.locator("html").getAttribute("data-theme")).toBe("light");
    const pdfAction = page.getByRole("link", { name: /Descargar PDF/i });
    const pdfBox = await pdfAction.boundingBox();
    expect(pdfBox).not.toBeNull();
    expect(pdfBox!.x).toBeGreaterThanOrEqual(0);
    expect(pdfBox!.x + pdfBox!.width).toBeLessThanOrEqual(391);
    const axeLight = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(axeLight.violations.filter((issue) => issue.impact === "critical" || issue.impact === "serious")).toEqual([]);
    expect(axeLight.violations.filter((issue) => issue.id === "color-contrast")).toEqual([]);

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: /Descargar PDF/i }).click();
    expect((await downloadPromise).suggestedFilename()).toMatch(/\.pdf$/i);

    await setMobileTheme(page, "dark");
    await expect.poll(() => page.locator("html").getAttribute("data-theme")).toBe("dark");
    const axeDark = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(axeDark.violations.filter((issue) => issue.impact === "critical" || issue.impact === "serious")).toEqual([]);
    expect(axeDark.violations.filter((issue) => issue.id === "color-contrast")).toEqual([]);
  });

  test("Warehouse Operator registra recepción física y sólo unidades buenas aumentan inventario; Sales no puede operar Compras", async ({ page }) => {
    expect(fixture.purchaseOrderId).toBeTruthy();
    await page.setViewportSize({ width: 390, height: 844 });
    await loginFresh(page, "WAREHOUSE_OPERATOR", `/purchasing/orders/${fixture.purchaseOrderId}/receive`);
    await expect(page.getByRole("heading", { name: "Recibir Mercancía" })).toBeVisible();
    const receiptLine = page.getByRole("article").filter({ has: page.getByText(fixture.sku, { exact: true }) });
    await receiptLine.scrollIntoViewIfNeeded();
    await expect(receiptLine).toBeVisible();
    await expect(receiptLine.getByText(fixture.sku, { exact: true })).toBeVisible();
    await page.getByLabel("Zona de recepción *").selectOption(fixture.receivingLocationId);
    await page.getByRole("button", { name: "Recibir todo lo pendiente" }).click();
    await page.getByRole("button", { name: "Revisar recepción" }).click();
    await expect(page.getByRole("dialog", { name: "Confirmar recepción" })).toBeVisible();
    await page.getByRole("button", { name: "Confirmar recepción" }).click();
    await expect(page).toHaveURL(/\/labels\/document\/PURCHASE_RECEIPT\/[^/?]+(?:\?|$)/);

    const orderLine = await prisma.purchaseOrderLine.findFirstOrThrow({ where: { purchaseOrderId: fixture.purchaseOrderId, productId: fixture.productId } });
    const inventory = await prisma.inventory.findUniqueOrThrow({ where: { productId_locationId: { productId: fixture.productId, locationId: fixture.receivingLocationId } } });
    const receiveAudit = await prisma.auditLog.findFirst({ where: { entityType: "PURCHASE_ORDER", entityId: fixture.purchaseOrderId, action: "RECEIVE" } });
    expect(orderLine.qtyReceived).toBe(10);
    expect(inventory).toMatchObject({ quantity: 10, available: 10, reserved: 0 });
    expect(receiveAudit?.actorUserId).toBeTruthy();
    expect(receiveAudit?.source).toBe("purchasing/receive");

    await loginFresh(page, "SALES_EXECUTIVE", "/home/sales");
    await page.goto(`/purchasing/orders/${fixture.purchaseOrderId}`);
    await expect(page).toHaveURL(/\/forbidden/);
    await expect(page.getByText("Acceso denegado")).toBeVisible();
  });
});
