import { describe, expect, it } from "vitest";
import { firstErrorMessage, purchaseReceiptLineDiscrepancySchema } from "@/lib/schemas/wms";

describe("purchase receipt validation boundary", () => {
  it("accepts an omitted discrepancy reason when there is no discrepancy", () => {
    expect(purchaseReceiptLineDiscrepancySchema.safeParse({
      lineId: "line-1",
      qtyReceived: 3,
      qtyDamaged: 0,
      qtyMissing: 0,
      qtyRejected: 0,
      qtySurplusReported: 0,
      discrepancyReason: undefined,
    }).success).toBe(true);
  });

  it("keeps null type errors out of the operator-facing message", () => {
    const result = purchaseReceiptLineDiscrepancySchema.safeParse({
      lineId: "line-1",
      qtyReceived: 3,
      discrepancyReason: null,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(firstErrorMessage(result.error)).toBe("Revisa el motivo de la diferencia");
    }
  });
});
