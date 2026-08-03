import { describe, expect, it } from "vitest";
import { summarizeFulfillmentMetrics } from "@/lib/dashboard/fulfillment-dashboard";

describe("fulfillment operational metrics", () => {
  it("calculates fill-rate, exactitud and cycles using closed work only", () => {
    const start = new Date("2026-07-31T08:00:00.000Z");
    const end = new Date("2026-07-31T10:00:00.000Z");

    const result = summarizeFulfillmentMetrics({
      pickTasks: [
        { requestedQty: 10, pickedQty: 10, shortQty: 0, status: "COMPLETED" },
        { requestedQty: 10, pickedQty: 8, shortQty: 2, status: "PARTIAL" },
        { requestedQty: 100, pickedQty: 0, shortQty: 0, status: "IN_PROGRESS" },
      ],
      pickCycles: [{ startAt: start, endAt: end }],
      assemblyCycles: [{ startAt: start, endAt: new Date("2026-07-31T14:00:00.000Z") }],
    });

    expect(result.fillRatePercent).toBe(90);
    expect(result.pickAccuracyPercent).toBe(50);
    expect(result.averagePickCycleHours).toBe(2);
    expect(result.averageAssemblyCycleHours).toBe(6);
    expect(result.measuredPickTasks).toBe(2);
  });

  it("returns empty metrics when there is no closed evidence", () => {
    const result = summarizeFulfillmentMetrics({ pickTasks: [], pickCycles: [], assemblyCycles: [] });

    expect(result.fillRatePercent).toBeNull();
    expect(result.pickAccuracyPercent).toBeNull();
    expect(result.averagePickCycleHours).toBeNull();
    expect(result.averageAssemblyCycleHours).toBeNull();
  });
});
