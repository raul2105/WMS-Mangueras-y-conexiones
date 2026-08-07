import { describe, expect, it } from "vitest";
import { calculateReservationDeltas } from "@/lib/sales/reservation-reconciliation";

describe("reservation reconciliation", () => {
  it("calculates pending reservation after picked and short quantities", () => {
    expect(
      calculateReservationDeltas(
        [{ productId: "p1", locationId: "l1", reservedQty: 5, pickedQty: 2, shortQty: 1 }],
        [{ productId: "p1", locationId: "l1", reserved: 1 }],
      ),
    ).toEqual([{ productId: "p1", locationId: "l1", expected: 2, actual: 1, delta: 1 }]);
  });

  it("aggregates multiple tasks for the same product and location", () => {
    expect(
      calculateReservationDeltas(
        [
          { productId: "p1", locationId: "l1", reservedQty: 2, pickedQty: 0, shortQty: 0 },
          { productId: "p1", locationId: "l1", reservedQty: 3, pickedQty: 1, shortQty: 0 },
        ],
        [{ productId: "p1", locationId: "l1", reserved: 4 }],
      ),
    ).toEqual([{ productId: "p1", locationId: "l1", expected: 4, actual: 4, delta: 0 }]);
  });

  it("reports an over-reserved inventory row without silently releasing it", () => {
    expect(
      calculateReservationDeltas(
        [{ productId: "p1", locationId: "l1", reservedQty: 1, pickedQty: 0, shortQty: 0 }],
        [{ productId: "p1", locationId: "l1", reserved: 2 }],
      ),
    ).toEqual([{ productId: "p1", locationId: "l1", expected: 1, actual: 2, delta: -1 }]);
  });

  it("is idempotent when the persisted reservation already matches", () => {
    expect(
      calculateReservationDeltas(
        [{ productId: "p1", locationId: "l1", reservedQty: 1, pickedQty: 0, shortQty: 0 }],
        [{ productId: "p1", locationId: "l1", reserved: 1 }],
      ).every((row) => row.delta === 0),
    ).toBe(true);
  });
});
