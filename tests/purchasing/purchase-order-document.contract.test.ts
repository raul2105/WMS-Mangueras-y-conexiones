import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

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
  });
});
