import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("operator safe receipt flow", () => {
  it("keeps every operator exit in the receipt queue and sends successful receipts to their document", () => {
    const page = read("app/(shell)/purchasing/orders/[id]/receive/page.tsx");

    expect(page).toContain('const RECEIPT_QUEUE_HREF = "/purchasing/orders?preset=por_recibir"');
    expect(page).toContain("cancelHref={RECEIPT_QUEUE_HREF}");
    expect(page).toContain("redirect(`${RECEIPT_QUEUE_HREF}&ok=");
    expect(page).toContain('redirect(`/labels/document/PURCHASE_RECEIPT/${receiptId}`)');
  });

  it("only accepts controlled receipt locations and persists line discrepancies", () => {
    const page = read("app/(shell)/purchasing/orders/[id]/receive/page.tsx");
    const schema = read("prisma/postgresql/schema.prisma");

    expect(page).toContain('receivingLocation.code.startsWith("RECV")');
    expect(page).toContain('code: { startsWith: "RECV" }');
    expect(page).toContain("qtyDamaged: item.qtyDamaged");
    expect(page).toContain("discrepancyReason: item.discrepancyReason");
    expect(page).toContain("lineParsed.data.discrepancyReason ?? null");
    expect(page).toContain("const accounted = qty + qtyDamaged + qtyMissing + qtyRejected");
    expect(schema).toMatch(/qtyDamaged\s+Float\s+@default\(0\)/);
    expect(schema).toMatch(/discrepancyReason\s+String\?/);
  });

  it("uses mobile-safe line cards, deliberate receive-all, and review confirmation", () => {
    const form = read("components/purchasing/PurchaseReceiptForm.tsx");

    expect(form).toContain("defaultValue=\"0\"");
    expect(form).toContain("Recibir todo lo pendiente");
    expect(form).toContain("Registrar diferencia de esta línea");
    expect(form).toContain("role=\"dialog\"");
    expect(form).toContain("Confirmar recepción");
    expect(form).toContain("Unidades con diferencia");
    expect(form).not.toContain("Alias operativo");
  });
});
