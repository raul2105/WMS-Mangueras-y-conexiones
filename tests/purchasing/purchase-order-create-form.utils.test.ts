import { describe, expect, it } from "vitest";
import { getMexicoCityDateInputValue } from "@/components/purchasing/purchase-order-date";

describe("purchase order calendar-date input", () => {
  it("uses Mexico City business date across UTC midnight", () => {
    expect(getMexicoCityDateInputValue(new Date("2026-01-01T05:30:00.000Z"))).toBe("2025-12-31");
    expect(getMexicoCityDateInputValue(new Date("2026-01-01T06:30:00.000Z"))).toBe("2026-01-01");
  });
});
