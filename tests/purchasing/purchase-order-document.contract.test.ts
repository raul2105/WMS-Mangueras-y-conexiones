import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildPurchaseOrderPdfFilename,
  getPurchaseOrderPdfLineTypography,
  getSupplierDisplayLines,
  injectSoftBreaks,
} from "@/lib/purchasing/purchase-order-pdf";

function readWorkspaceFile(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("purchase order document contracts", () => {
  it("guards the detail page and exposes document actions", () => {
    const content = readWorkspaceFile("app/(shell)/purchasing/orders/[id]/page.tsx");
    expect(content).toContain('pageGuard("purchasing.manage")');
    expect(content).toContain("Documento oficial disponible al confirmar.");
    expect(content).toContain("Ver documento oficial");
    expect(content).toContain("Descargar PDF");
    expect(content).toContain("Documento oficial no generado para esta OC. Revisión requerida.");
  });

  it("guards the document preview page and print action", () => {
    const content = readWorkspaceFile("app/(shell)/purchasing/orders/[id]/document/page.tsx");
    const buttonContent = readWorkspaceFile("components/purchasing/PurchaseOrderDocumentPrintButton.tsx");
    expect(content).toContain('pageGuard("purchasing.manage")');
    expect(content).toContain("PurchaseOrderDocumentPrintButton");
    expect(buttonContent).toContain("Imprimir / Guardar PDF");
    expect(content).toContain("snapshot.purchaseOrder.deliveryAddressSnapshot");
    expect(content).toContain("snapshot.supplier.paymentTerms");
  });

  it("pdf route returns application/pdf with attachment disposition", () => {
    const content = readWorkspaceFile("app/api/purchasing/orders/[id]/pdf/route.ts");
    expect(content).toContain('requirePermission("purchasing.manage")');
    expect(content).toContain('export const runtime = "nodejs"');
    expect(content).toContain('"Content-Type": "application/pdf"');
    expect(content).toContain('attachment; filename="${filename}"');
    expect(content).toContain("buildPurchaseOrderPdfFilename");
  });

  it("builds sanitized filenames without double OC prefixes", () => {
    expect(buildPurchaseOrderPdfFilename("OC-2026-0004")).toBe("OC-2026-0004.pdf");
    expect(buildPurchaseOrderPdfFilename("2026-0004")).toBe("OC-2026-0004.pdf");
    expect(buildPurchaseOrderPdfFilename("OC-2026/0004?*")).toBe("OC-2026-0004.pdf");
  });

  it("collapses identical supplier display values", () => {
    const identical = getSupplierDisplayLines({
      code: "SUP-001",
      name: "Parker",
      businessName: "Parker",
      legalName: "Parker",
      taxId: null,
      email: null,
      phone: null,
      address: null,
      paymentTerms: null,
    });

    expect(identical.primary).toBe("Parker");
    expect(identical.secondary).toBeNull();

    const distinct = getSupplierDisplayLines({
      code: "SUP-002",
      name: "Parker México",
      businessName: "Parker Industrial",
      legalName: "Parker México SA de CV",
      taxId: null,
      email: null,
      phone: null,
      address: null,
      paymentTerms: null,
    });

    expect(distinct.primary).toBe("Parker Industrial");
    expect(distinct.secondary).toBe("Parker México SA de CV");
  });

  it("exposes supplier-facing labels and hides internal receiving headers in the PDF source", () => {
    const content = readWorkspaceFile("lib/purchasing/purchase-order-pdf.tsx");
    expect(content).toContain('size="LETTER"');
    expect(content).toContain('orientation="portrait"');
    expect(content).toContain("wrap={false}");
    expect(content).toContain("getPurchaseOrderPdfLineTypography");
    expect(content).toContain("Folio:");
    expect(content).toContain("formatSingleLineText(line.sku)");
    expect(content).toContain("injectSoftBreaks(line.name)");
    expect(content).toContain("lineSku:");
    expect(content).toContain("width: \"15%\"");
    expect(content).toContain("lineProduct:");
    expect(content).toContain("width: \"34%\"");
    expect(content).toContain("lineQty:");
    expect(content).toContain("width: \"10%\"");
    expect(content).toContain("lineQtyHeaderText");
    expect(content).toContain("productLineHeight: 1.0");
    expect(content).toContain("Director general");
    expect(content).toContain("Encargado de almacén");
    expect(content).toContain("headerAccent");
    expect(content).toContain("documentInfoBand");
    expect(content).toContain("documentInfoDivider");
    expect(content).toContain("documentInfoLabel");
    expect(content).toContain("documentInfoValue");
    expect(content).toContain("documentInfoLabel:");
    expect(content).not.toContain('documentInfoValue: {\n    fontSize: 8.7,\n    fontWeight: 700,');
    expect(content).toContain("documentBottomBand");
    expect(content).toContain("lineBodyAlt");
    expect(content).toContain("documentNotesSection");
    expect(content).toContain("documentTotalsSection");
    expect(content).toContain("documentTotalsEmphasis");
    expect(content).toContain("documentTotalsLabel");
    expect(content).toContain("documentTotalsValue");
    expect(content).toContain("Fecha esperada");
    expect(content).toContain("Moneda");
    expect(content).toContain("Dirección de entrega");
    expect(content).toContain("Términos de pago");
    expect(content).toContain("Cantidad");
    expect(content).toContain("Unidad");
    expect(content).toContain("Precio unitario");
    expect(content).toContain("Importe");
    expect(content).not.toContain('<Text style={styles.subtitle}>WMS Mangueras y Conexiones</Text>');
    expect(content).not.toContain('<Text style={styles.metaLabel}>Compra</Text>');
    expect(content).not.toContain('<Text style={styles.metaLabel}>Versión documento</Text>');
    expect(content).not.toContain("Gerente general");
    expect(content).not.toContain("documentMetaStrip");
    expect(content).not.toContain("documentMetaItem");
    expect(content).not.toContain("metaLabel");
    expect(content).not.toContain("metaValue");
    expect(content).not.toContain("Ped.");
    expect(content).not.toContain("Rec.");
    expect(content).not.toContain("Pend.");
    expect(content).not.toContain("injectSoftBreaks(line.sku)");

    const bandIndex = content.indexOf('<View style={styles.documentInfoBand}>');
    const linesIndex = content.indexOf('<Text style={styles.sectionTitle}>Líneas</Text>');
    const notesIndex = content.indexOf('<Text style={styles.sectionTitle}>Notas</Text>');
    const subtotalIndex = content.indexOf('<Text style={styles.documentTotalsLabel}>Subtotal</Text>');
    const ivaIndex = content.indexOf('<Text style={styles.documentTotalsLabel}>IVA</Text>');
    const totalIndex = content.indexOf('<Text style={styles.documentTotalsLabel}>Total</Text>');

    expect(bandIndex).toBeGreaterThan(-1);
    expect(linesIndex).toBeGreaterThan(-1);
    expect(notesIndex).toBeGreaterThan(-1);
    expect(bandIndex).toBeGreaterThan(-1);
    expect(bandIndex).toBeLessThan(linesIndex);
    expect(subtotalIndex).toBeGreaterThan(notesIndex);
    expect(ivaIndex).toBeGreaterThan(subtotalIndex);
    expect(totalIndex).toBeGreaterThan(ivaIndex);
    expect(notesIndex).toBeGreaterThan(linesIndex);
  });

  it("adapts line typography for long SKU and product names", () => {
    const short = getPurchaseOrderPdfLineTypography({
      sku: "SKU-01",
      name: "Manguera industrial",
    });
    const long = getPurchaseOrderPdfLineTypography({
      sku: "SKU-2026-VERY-LONG-CODE-1234567890",
      name: "Manguera industrial de alta presión con especificación extendida para proveedor externo",
    });

    expect(long.skuFontSize).toBeLessThan(short.skuFontSize);
    expect(long.productFontSize).toBeLessThan(short.productFontSize);
    expect(long.rowMinHeight).toBeGreaterThan(short.rowMinHeight);
    expect(injectSoftBreaks("SKU-2026/0004-LOREM")).toContain("\u200B");
    expect(injectSoftBreaks("Manguera industrial")).toContain("Manguera");
  });

  it("wires delivery warehouse selection and supplier payment terms into purchasing forms", () => {
    const orderCreateContent = readWorkspaceFile("app/(shell)/purchasing/orders/new/page.tsx");
    const supplierCreateContent = readWorkspaceFile("app/(shell)/purchasing/suppliers/new/page.tsx");
    const supplierDetailContent = readWorkspaceFile("app/(shell)/purchasing/suppliers/[id]/page.tsx");
    const orderDetailContent = readWorkspaceFile("app/(shell)/purchasing/orders/[id]/page.tsx");

    expect(orderCreateContent).toContain("deliveryWarehouseId");
    expect(orderCreateContent).toContain("Almacén destino");
    expect(supplierCreateContent).toContain("paymentTerms");
    expect(supplierDetailContent).toContain("Términos de pago");
    expect(orderDetailContent).toContain("updateDraftMetadata");
    expect(orderDetailContent).toContain("Entrega y términos oficiales");
  });
});
