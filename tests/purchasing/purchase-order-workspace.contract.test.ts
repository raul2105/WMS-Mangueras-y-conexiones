import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { purchaseOrderCreateLinesSchema } from "@/lib/schemas/wms";
import {
  buildPurchaseOrderPresetWhere,
  getPurchaseOrderPresetLabel,
  matchesPurchaseOrderPreset,
} from "@/lib/purchasing/purchase-order-presets";

function read(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("purchase order workspace", () => {
  it("requires at least one unique product before creating the order", () => {
    expect(purchaseOrderCreateLinesSchema.safeParse([]).success).toBe(false);
    expect(purchaseOrderCreateLinesSchema.safeParse([
      { productId: "product-1", qtyOrdered: 2, unitPrice: null },
      { productId: "product-1", qtyOrdered: 3, unitPrice: 10 },
    ]).success).toBe(false);
    expect(purchaseOrderCreateLinesSchema.safeParse([
      { productId: "product-1", qtyOrdered: 2, unitPrice: null },
      { productId: "product-2", qtyOrdered: 3, unitPrice: 10 },
    ]).success).toBe(true);
  });

  it("creates the header and product lines in one transaction", () => {
    const page = read("app/(shell)/purchasing/orders/new/page.tsx");
    const form = read("components/purchasing/PurchaseOrderCreateForm.tsx");

    expect(page).toContain("purchaseOrderCreateLinesSchema.safeParse");
    expect(page).toContain("prisma.$transaction");
    expect(page).toContain("lines: {");
    expect(form).toContain('name="linesJson"');
    expect(form).toContain("Agrega todos los productos antes de crear la orden");
    expect(form).toContain("disabled={suppliers.length === 0 || warehouses.length === 0 || lines.length === 0}");
  });

  it("uses role-friendly receiving buckets without depending on AWS", () => {
    expect(getPurchaseOrderPresetLabel("por_recibir")).toBe("Por recibir");
    expect(getPurchaseOrderPresetLabel("recepcion_parcial")).toBe("Recepción parcial");
    expect(buildPurchaseOrderPresetWhere("por_recibir")).toEqual({
      status: { in: ["CONFIRMADA", "EN_TRANSITO"] },
    });
    expect(matchesPurchaseOrderPreset({ status: "PARCIAL", expectedDate: null }, "recepcion_parcial")).toBe(true);
  });

  it("keeps internal Jira keys out of the Manager purchase-order detail", () => {
    const detail = read("app/(shell)/purchasing/orders/[id]/page.tsx");

    expect(detail).not.toContain("KAN-88:");
    expect(detail).not.toContain("Contrato preparado para KAN-85");
    expect(detail).toContain("Marcar en tránsito");
    expect(detail).toContain("La recepción física continúa en la bandeja del Operador");
  });
});
