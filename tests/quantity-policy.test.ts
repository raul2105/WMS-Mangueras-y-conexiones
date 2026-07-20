import { describe, expect, it } from "vitest";
import {
  getAssemblyQuantityPolicy,
  getPurchaseUnitPolicy,
  getQuantityPolicy,
  normalizeUnitLabel,
  quantityValidationMessage,
} from "@/lib/quantity-policy";
import { purchaseOrderLineSchema } from "@/lib/schemas/wms";

describe("quantity policy", () => {
  it("keeps fittings and configured assemblies as whole units", () => {
    const fitting = getQuantityPolicy({ type: "FITTING", unitLabel: "pieza" });
    expect(fitting).toMatchObject({ increment: 1, displayDecimals: 0, isDiscrete: true });
    expect(quantityValidationMessage(0.5, fitting)).toMatch(/entero/i);
    expect(quantityValidationMessage(2, fitting)).toBeNull();
    expect(quantityValidationMessage(1.5, getAssemblyQuantityPolicy())).toMatch(/entero/i);
  });

  it("allows hose lengths by centimetre and normalizes metro labels", () => {
    const hose = getQuantityPolicy({ type: "HOSE", unitLabel: "metro" });
    expect(normalizeUnitLabel("metro")).toBe("m");
    expect(hose).toMatchObject({ unitLabel: "m", increment: 0.01, displayDecimals: 2 });
    expect(quantityValidationMessage(2.5, hose)).toBeNull();
    expect(quantityValidationMessage(2.555, hose)).toMatch(/múltiplos/i);
  });

  it("supports a product-level increment override stored in technical attributes", () => {
    const hose = getQuantityPolicy({
      type: "HOSE",
      unitLabel: "m",
      attributes: JSON.stringify({ quantityIncrement: 0.001, quantityDisplayDecimals: 3 }),
    });
    expect(quantityValidationMessage(2.555, hose)).toBeNull();
  });

  it("accepts fractional direct purchases and keeps roll purchases whole", () => {
    expect(
      purchaseOrderLineSchema.safeParse({
        purchaseOrderId: "oc-1",
        productId: "product-1",
        qtyOrderedRaw: "2.5",
      }).success,
    ).toBe(true);

    const roll = getPurchaseUnitPolicy({
      type: "HOSE",
      unitLabel: "m",
      purchaseUnitLabel: "rollo",
      purchaseUnitFactor: 50,
    });
    expect(roll).toMatchObject({ unitLabel: "rollo", increment: 1, isDiscrete: true });
    expect(quantityValidationMessage(1.5, roll)).toMatch(/entero/i);
  });
});
