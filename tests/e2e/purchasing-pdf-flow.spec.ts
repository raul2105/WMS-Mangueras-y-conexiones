import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { updatePurchaseOrderStatusWithDocument } from "@/lib/purchasing/purchase-order-document-service";
import { loginAs, resolveAuditActorForRole } from "./lib/auth.helpers";

const prisma = new PrismaClient();
const tag = `E2E-PDF-${randomUUID().replaceAll("-", "").toUpperCase()}`;

let orderWithDocumentId = "";
let orderWithoutDocumentId = "";
let supplierId = "";
let productId = "";
let beforeManifest: Record<string, unknown> = {};

async function captureManifest() {
  const [{ schema }] = await prisma.$queryRaw<Array<{ schema: string }>>`SELECT current_schema() AS schema`;
  const [suppliers, products, orders] = await Promise.all([
    prisma.supplier.findMany({ where: { code: `${tag}-SUP` }, select: { id: true, code: true } }),
    prisma.product.findMany({ where: { sku: `${tag}-SKU` }, select: { id: true, sku: true } }),
    prisma.purchaseOrder.findMany({ where: { folio: { in: [`${tag}-DOC`, `${tag}-NODOC`] } }, select: { id: true, folio: true, status: true } }),
  ]);
  const orderIds = orders.map((order) => order.id);
  const [documents, receipts, audits] = await Promise.all([
    orderIds.length ? prisma.purchaseOrderDocument.findMany({ where: { purchaseOrderId: { in: orderIds } }, select: { id: true, purchaseOrderId: true, versionNumber: true } }) : Promise.resolve([]),
    orderIds.length ? prisma.purchaseReceipt.findMany({ where: { purchaseOrderId: { in: orderIds } }, select: { id: true, purchaseOrderId: true } }) : Promise.resolve([]),
    orderIds.length ? prisma.auditLog.findMany({ where: { entityId: { in: orderIds } }, select: { id: true, entityType: true, entityId: true, action: true } }) : Promise.resolve([]),
  ]);
  return { capturedAt: new Date().toISOString(), schema, uniqueTag: tag, identities: { supplierId, productId, orderWithDocumentId, orderWithoutDocumentId }, records: { suppliers, products, orders, documents, receipts, audits } };
}

async function writeManifest(after: Record<string, unknown>) {
  const directory = process.env.WMS_AWS_EVIDENCE_DIR ?? path.join("output", `purchasing-${tag.toLowerCase()}`);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "purchasing-pdf-manifest.json"), JSON.stringify({ before: beforeManifest, after }, null, 2), "utf8");
}

async function cleanupFixtures() {
  const ownedOrders = await prisma.purchaseOrder.findMany({
    where: { folio: { in: [`${tag}-DOC`, `${tag}-NODOC`] } },
    select: { id: true },
  });
  const orderIds = ownedOrders.map((order) => order.id);
  if (orderIds.length > 0) {
    await prisma.auditLog.deleteMany({ where: { entityId: { in: orderIds } } });
    await prisma.purchaseOrderDocument.deleteMany({ where: { purchaseOrderId: { in: orderIds } } });
    await prisma.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: { in: orderIds } } });
    await prisma.purchaseOrder.deleteMany({ where: { id: { in: orderIds } } });
  }
  await prisma.supplier.deleteMany({ where: { code: `${tag}-SUP` } });
  await prisma.product.deleteMany({ where: { sku: `${tag}-SKU` } });
}

test.describe("PDF Flow - Purchase Order Document", () => {
  test.beforeAll(async () => {
    beforeManifest = await captureManifest();
    const baselineRecords = Object.values((beforeManifest as { records: Record<string, unknown[]> }).records);
    if (baselineRecords.some((records) => records.length > 0)) throw new Error(`UUID fixture collision detected before writes: ${tag}`);
    const supplier = await prisma.supplier.create({
      data: {
        code: `${tag}-SUP`,
        name: "Proveedor PDF E2E",
        email: `${tag.toLowerCase()}@example.invalid`,
        isActive: true,
      },
      select: { id: true },
    });
    supplierId = supplier.id;

    const product = await prisma.product.create({
      data: {
        sku: `${tag}-SKU`,
        name: "Producto PDF E2E",
        type: "HOSE",
      },
      select: { id: true },
    });
    productId = product.id;

    const orderWithDocument = await prisma.purchaseOrder.create({
      data: {
        folio: `${tag}-DOC`,
        supplierId: supplier.id,
        status: "BORRADOR",
        notes: "Fixture determinista para PDF E2E",
        lines: {
          create: [{
            productId: product.id,
            qtyOrdered: 2,
            qtyReceived: 0,
            unitPrice: 20,
            currency: "MXN",
          }],
        },
      },
      select: { id: true },
    });

    orderWithDocumentId = orderWithDocument.id;
    const auditActor = await resolveAuditActorForRole(prisma, "MANAGER");
    await updatePurchaseOrderStatusWithDocument({
      purchaseOrderId: orderWithDocument.id,
      newStatus: "CONFIRMADA",
      auditActor,
      prismaClient: prisma,
    });

    const orderWithoutDocument = await prisma.purchaseOrder.create({
      data: {
        folio: `${tag}-NODOC`,
        supplierId: supplier.id,
        status: "CONFIRMADA",
        notes: "Fixture sin documento oficial",
        lines: {
          create: [{
            productId: product.id,
            qtyOrdered: 1,
            qtyReceived: 0,
            unitPrice: 10,
            currency: "MXN",
          }],
        },
      },
      select: { id: true },
    });

    orderWithoutDocumentId = orderWithoutDocument.id;
  });

  test.afterAll(async () => {
    try {
      await cleanupFixtures();
      const after = await captureManifest();
      await writeManifest(after);
      const records = after.records as Record<string, unknown[]>;
      expect(Object.values(records).every((rows) => rows.length === 0)).toBe(true);
    } finally {
      await prisma.$disconnect();
    }
  });

  test("debe generar y descargar PDF para OC valida", async ({ page }) => {
     await loginAs(page, "MANAGER");
     await page.goto(`/purchasing/orders/${orderWithDocumentId}/document`);
     await expect(page.getByRole("heading", { name: /Orden de Compra oficial/i })).toBeVisible({ timeout: 30000 });
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: /Descargar PDF/i }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toContain(".pdf");
  });

  test("debe manejar OC inexistente en endpoint PDF", async ({ page }) => {
    await loginAs(page, "MANAGER");

    const response = await page.goto("/api/purchasing/orders/00000000-0000-0000-0000-000000000000/pdf", {
      waitUntil: "commit",
    });

    expect(response?.status()).toBe(404);
  });

  test("documento page debe mostrar fallback si no hay documento", async ({ page }) => {
    await loginAs(page, "MANAGER");
    await page.goto(`/purchasing/orders/${orderWithoutDocumentId}/document`);
    await expect(page.getByRole("heading", { name: "Documento oficial de OC" })).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(/No existe un documento oficial persistido para esta OC/i)).toBeVisible();
  });

  test("detail page keeps official-document actions accessible on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(
      page,
      "MANAGER",
      `/purchasing/orders/${orderWithDocumentId}`,
      `/purchasing/orders/${orderWithDocumentId}`,
    );
    await page.goto(`/purchasing/orders/${orderWithDocumentId}`);

    await expect(page.getByText(/Avance comercial de la orden/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: /Línea de tiempo operativa/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Siguiente acción/i })).toBeVisible();
    const detailLink = page.getByRole("link", { name: /Ver documento oficial/i });
    const downloadLink = page.getByRole("link", { name: /Descargar PDF/i });
    await detailLink.scrollIntoViewIfNeeded();
    await downloadLink.scrollIntoViewIfNeeded();

    await expect(detailLink).toBeVisible();
    await expect(downloadLink).toBeVisible();

    const viewport = page.viewportSize();
    const detailBox = await detailLink.boundingBox();
    const downloadBox = await downloadLink.boundingBox();

    expect(viewport).not.toBeNull();
    expect(detailBox).not.toBeNull();
    expect(downloadBox).not.toBeNull();
    expect(detailBox!.x).toBeGreaterThanOrEqual(0);
    expect(detailBox!.x + detailBox!.width).toBeLessThanOrEqual((viewport?.width ?? 0) + 1);
    expect(downloadBox!.x).toBeGreaterThanOrEqual(0);
    expect(downloadBox!.x + downloadBox!.width).toBeLessThanOrEqual((viewport?.width ?? 0) + 1);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(results.violations.filter((v) => v.impact === "critical")).toHaveLength(0);
    expect(results.violations.filter((v) => v.id === "color-contrast")).toHaveLength(0);
  });
});
