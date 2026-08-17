import { describe, expect, it } from "vitest";
import { calculateReplenishmentProposal } from "@/lib/purchasing/replenishment";

const policy = {
  minimumStock: 10,
  maximumStock: 30,
  leadTimeDays: 5,
  reviewWindowDays: 30,
  purchaseUnitFactor: 5,
  purchaseMoq: 10,
};

describe("min-max replenishment policy", () => {
  it("does not propose when inventory position is above minimum", () => {
    const result = calculateReplenishmentProposal(policy, {
      availableStock: 12,
      incomingQuantity: 0,
      consumedQuantity: 30,
      windowDays: 30,
    });

    expect(result.status).toBe("NO_ACTION");
    expect(result.recommendedQuantity).toBe(0);
  });

  it("recovers the maximum and respects purchase unit and MOQ", () => {
    const result = calculateReplenishmentProposal(policy, {
      availableStock: 4,
      incomingQuantity: 0,
      consumedQuantity: 60,
      windowDays: 30,
    });

    expect(result.status).toBe("PROPOSED");
    expect(result.averageDailyConsumption).toBe(2);
    expect(result.recommendedQuantity).toBe(30);
  });

  it("accounts for inbound quantities before proposing", () => {
    const result = calculateReplenishmentProposal(policy, {
      availableStock: 4,
      incomingQuantity: 8,
      consumedQuantity: 0,
      windowDays: 30,
    });

    expect(result.status).toBe("NO_ACTION");
    expect(result.recommendedQuantity).toBe(0);
  });

  it("blocks an invalid policy instead of generating unsafe demand", () => {
    const result = calculateReplenishmentProposal({ ...policy, maximumStock: 5 }, {
      availableStock: 0,
      consumedQuantity: 10,
      windowDays: 30,
    });

    expect(result.status).toBe("BLOCKED");
    expect(result.recommendedQuantity).toBe(0);
  });
});
