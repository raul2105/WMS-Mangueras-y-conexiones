import { describe, expect, it } from "vitest";
import { checkCurrentAvailability } from "@/lib/sales/availability-validator";

describe("current availability inventory scope", () => {
  it("includes storage rows whose quantity is fully reserved", async () => {
    const result = await checkCurrentAvailability({
      inventory: {
        findMany: async () => [
          { available: 0, reserved: 5 },
          { available: 3, reserved: 2 },
        ],
      },
    } as never, "product-1", "warehouse-1");

    expect(result.availableQuantity).toBe(3);
    expect(result.reservedQuantity).toBe(7);
  });
});
