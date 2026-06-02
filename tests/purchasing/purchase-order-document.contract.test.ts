import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildPurchaseOrderPdfFilename, getSupplierDisplayLines } from "@/lib/purchasing/purchase-order-pdf";

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
    });

    expect(distinct.primary).toBe("Parker Industrial");
    expect(distinct.secondary).toBe("Parker México SA de CV");
  });

  it("exposes supplier-facing labels and hides internal receiving headers in the PDF source", () => {
    const content = readWorkspaceFile("lib/purchasing/purchase-order-pdf.tsx");
    expect(content).toContain("Cantidad");
    expect(content).toContain("Unidad");
    expect(content).toContain("Precio unitario");
    expect(content).toContain("Importe");
    expect(content).not.toContain("Ped.");
    expect(content).not.toContain("Rec.");
    expect(content).not.toContain("Pend.");
  });
});
