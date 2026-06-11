import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import { updatePurchaseOrderStatusWithDocument } from "@/lib/purchasing/purchase-order-document-service";
import { loginAs } from "./lib/auth.helpers";

const prisma = new PrismaClient();
const unique = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

let orderWithDocumentId = "";
let orderWithoutDocumentId = "";

async function cleanupFixtures() {
  const orderIds = [orderWithDocumentId, orderWithoutDocumentId].filter(Boolean);
  if (orderIds.length === 0) return;

  await prisma.purchaseOrderDocument.deleteMany({ where: { purchaseOrderId: { in: orderIds } } });
  await prisma.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: { in: orderIds } } });
  await prisma.purchaseOrder.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.supplier.deleteMany({ where: { code: { startsWith: "E2E-PDF-SUP-" } } });
  await prisma.product.deleteMany({ where: { sku: { startsWith: "E2E-PDF-SKU-" } } });
}

test.describe("PDF Flow - Purchase Order Document", () => {
  test.beforeAll(async () => {
    await cleanupFixtures();

    const supplier = await prisma.supplier.create({
      data: {
        code: `E2E-PDF-SUP-${unique()}`,
        name: "Proveedor PDF E2E",
        email: "pdf-e2e@example.com",
        isActive: true,
      },
      select: { id: true },
    });

    const product = await prisma.product.create({
      data: {
        sku: `E2E-PDF-SKU-${unique()}`,
        name: "Producto PDF E2E",
        type: "HOSE",
      },
      select: { id: true },
    });

    const orderWithDocument = await prisma.purchaseOrder.create({
      data: {
        folio: `E2E-OC-${unique()}`,
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

    await updatePurchaseOrderStatusWithDocument({
      purchaseOrderId: orderWithDocument.id,
      newStatus: "CONFIRMADA",
      prismaClient: prisma,
    });

    const orderWithoutDocument = await prisma.purchaseOrder.create({
      data: {
        folio: `E2E-OC-${unique()}`,
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

    orderWithDocumentId = orderWithDocument.id;
    orderWithoutDocumentId = orderWithoutDocument.id;
  });

  test.afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
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
    await expect(page.locator(".glass-card")).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(/No existe un documento oficial persistido para esta OC/i)).toBeVisible();
  });

  test("KAN-93 detail page keeps contract-only actions accessible on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, "MANAGER", `/purchasing/orders/${orderWithDocumentId}`);
    await page.goto(`/purchasing/orders/${orderWithDocumentId}`);

    await expect(page.getByText(/Contrato preparado para KAN-85/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: /Línea de tiempo operativa/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Siguiente acción/i })).toBeVisible();
    const detailLink = page.getByRole("link", { name: /Ver documento oficial/i });
    const downloadLink = page.getByRole("link", { name: /Descargar PDF/i });
    const disabledEmailButton = page.getByRole("button", { name: /Envío por correo deshabilitado/i });

    await detailLink.scrollIntoViewIfNeeded();
    await downloadLink.scrollIntoViewIfNeeded();
    await disabledEmailButton.scrollIntoViewIfNeeded();

    await expect(detailLink).toBeVisible();
    await expect(downloadLink).toBeVisible();
    await expect(disabledEmailButton).toBeVisible();

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
