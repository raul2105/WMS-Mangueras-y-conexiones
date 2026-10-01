import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isReceivingLocation } from "@/lib/purchasing/purchase-order-receiving";

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

  it("uses semantic receiving locations and persists line discrepancies", () => {
    const page = read("app/(shell)/purchasing/orders/[id]/receive/page.tsx");
    const receivingService = read("lib/purchasing/purchase-order-receiving.ts");
    const schema = read("prisma/postgresql/schema.prisma");

    expect(isReceivingLocation({ isActive: true, usageType: "RECEIVING", warehouseIsActive: true })).toBe(true);
    for (const usageType of ["STORAGE", "STAGING", "SHIPPING"] as const) {
      expect(isReceivingLocation({ isActive: true, usageType, warehouseIsActive: true })).toBe(false);
    }
    expect(isReceivingLocation({ isActive: false, usageType: "RECEIVING", warehouseIsActive: true })).toBe(false);
    expect(isReceivingLocation({ isActive: true, usageType: "RECEIVING", warehouseIsActive: false })).toBe(false);
    expect(isReceivingLocation(null)).toBe(false);
    expect(page).toContain("isReceivingLocation");
    expect(page).toContain('usageType: "RECEIVING"');
    expect(page).toContain("order.deliveryWarehouseId");
    expect(receivingService).toContain("order.deliveryWarehouseId");
    expect(receivingService).not.toContain('startsWith("RECV")');
    expect(page).toContain("qtyDamaged,");
    expect(page).toContain("lineParsed.data.discrepancyReason ?? null");
    expect(page).toContain("const accounted = qty + qtyDamaged + qtyMissing + qtyRejected");
    expect(page).toContain("lines: linesToReceive");
    expect(page).toContain("commitPurchaseOrderReceipt({");
    expect(receivingService).toContain("qtyDamaged: item.qtyDamaged");
    expect(receivingService).toContain("discrepancyReason: item.discrepancyReason");
    expect(schema).toMatch(/qtyDamaged\s+Float\s+@default\(0\)/);
    expect(schema).toMatch(/discrepancyReason\s+String\?/);
  });

  it("uses mobile-safe line cards, deliberate receive-all, and review confirmation", () => {
    const form = read("components/purchasing/PurchaseReceiptForm.tsx");

    expect(form).toContain("defaultValue=\"0\"");
    expect(form).toContain("Recibir todo lo pendiente");
    expect(form).toContain("Pedido");
    expect(form).toContain("Recibido");
    expect(form).toContain("Pendiente");
    expect(form).toContain("Registrar diferencia de esta línea");
    expect(form).toContain("role=\"dialog\"");
    expect(form).toContain("Confirmar recepción");
    expect(form).toContain("Unidades con diferencia");
    expect(form).not.toContain("Alias operativo");
  });
});
