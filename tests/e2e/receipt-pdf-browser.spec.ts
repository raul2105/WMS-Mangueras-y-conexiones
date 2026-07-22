import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { loginAs } from "./lib/auth.helpers";

const prisma = new PrismaClient();
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

let supplierId = "";
let productId = "";
let warehouseId = "";
let locationId = "";
let orderId = "";
let receiptId = "";

async function cleanupFixture() {
  if (receiptId) {
    await prisma.purchaseReceiptLine.deleteMany({ where: { purchaseReceiptId: receiptId } });
    await prisma.purchaseReceipt.deleteMany({ where: { id: receiptId } });
  }
  if (orderId) {
    await prisma.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: orderId } });
    await prisma.purchaseOrder.deleteMany({ where: { id: orderId } });
  }
  if (locationId) await prisma.location.deleteMany({ where: { id: locationId } });
  if (warehouseId) await prisma.warehouse.deleteMany({ where: { id: warehouseId } });
  if (supplierId) await prisma.supplier.deleteMany({ where: { id: supplierId } });
  if (productId) await prisma.product.deleteMany({ where: { id: productId } });
}

test.describe.serial("Comprobante de recepción", () => {
  test.beforeAll(async () => {
    const supplier = await prisma.supplier.create({
      data: { code: `E2E-PDF-SUP-${suffix}`, name: "Proveedor evidencia PDF", isActive: true },
      select: { id: true },
    });
    supplierId = supplier.id;
    const product = await prisma.product.create({
      data: { sku: `E2E-PDF-SKU-${suffix}`, name: "Material evidencia PDF", type: "HOSE" },
      select: { id: true },
    });
    productId = product.id;
    const warehouse = await prisma.warehouse.create({
      data: { code: `E2E-PDF-WH-${suffix}`, name: "Almacén evidencia PDF" },
      select: { id: true },
    });
    warehouseId = warehouse.id;
    const location = await prisma.location.create({
      data: {
        code: `RECV-E2E-PDF-${suffix}`,
        name: "Recepción evidencia PDF",
        warehouseId,
        usageType: "RECEIVING",
      },
      select: { id: true },
    });
    locationId = location.id;
    const order = await prisma.purchaseOrder.create({
      data: {
        folio: `E2E-PDF-OC-${suffix}`,
        supplierId,
        deliveryWarehouseId: warehouseId,
        status: "RECIBIDA",
        lines: { create: { productId, qtyOrdered: 2, qtyReceived: 2, unitPrice: 125, currency: "MXN" } },
      },
      select: { id: true, lines: { select: { id: true } } },
    });
    orderId = order.id;
    const receipt = await prisma.purchaseReceipt.create({
      data: {
        purchaseOrderId: orderId,
        locationId,
        referenceDoc: `REM-E2E-${suffix}`,
        notes: "Fixture aislado para validar comprobante descargable.",
        lines: { create: { purchaseOrderLineId: order.lines[0].id, productId, qtyReceived: 2 } },
      },
      select: { id: true },
    });
    receiptId = receipt.id;
  });

  test.afterAll(async () => {
    await cleanupFixture();
    await prisma.$disconnect();
  });

  test("el responsable de recepción descarga el comprobante desde su cierre operativo", async ({ page }) => {
    await loginAs(
      page,
      "WAREHOUSE_OPERATOR",
      `/labels/document/PURCHASE_RECEIPT/${receiptId}`,
      `/labels/document/PURCHASE_RECEIPT/${receiptId}`,
    );
    await page.goto(`/labels/document/PURCHASE_RECEIPT/${receiptId}`);

    await expect(page.getByRole("heading", { name: "Etiquetas de recepción" })).toBeVisible();
    const receiptPdf = page.getByRole("link", { name: "Descargar comprobante" });
    await expect(receiptPdf).toHaveAttribute("href", `/api/purchasing/receipts/${receiptId}/pdf`);

    const downloadPromise = page.waitForEvent("download");
    await receiptPdf.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^recepcion-E2E-PDF-OC-.*\.pdf$/);
    await download.saveAs(`output/pdf/${download.suggestedFilename()}`);
  });
});
