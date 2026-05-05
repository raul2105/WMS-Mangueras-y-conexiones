import { describe, expect, it } from "vitest";
import { evaluateFulfillmentSignals } from "@/lib/dashboard/fulfillment-dashboard";

describe("fulfillment signals", () => {
  it("flags overdue unreleased as high risk", () => {
    const now = new Date("2026-05-10T12:00:00.000Z");
    const result = evaluateFulfillmentSignals({
      dueDate: new Date("2026-05-09T12:00:00.000Z"),
      orderUpdatedAt: new Date("2026-05-10T11:00:00.000Z"),
      assignedToUserId: null,
      hasProductLines: true,
      hasAssemblyLines: false,
      latestPickStatus: null,
      latestPickUpdatedAt: null,
      linkedAssemblyTotal: 0,
      linkedAssemblyOpen: 0,
      linkedAssemblyUpdatedAt: null,
      now,
      staleHours: 4,
    });

    expect(result.riskLevel).toBe("ALTO");
    expect(result.blockingCause).toBe("OVERDUE_UNRELEASED");
    expect(result.isOverdue).toBe(true);
    expect(result.isUnreleased).toBe(true);
  });

  it("flags assembly blocked as medium risk", () => {
    const now = new Date("2026-05-10T12:00:00.000Z");
    const result = evaluateFulfillmentSignals({
      dueDate: new Date("2026-05-11T12:00:00.000Z"),
      orderUpdatedAt: new Date("2026-05-10T11:00:00.000Z"),
      assignedToUserId: "user-1",
      hasProductLines: false,
      hasAssemblyLines: true,
      latestPickStatus: null,
      latestPickUpdatedAt: null,
      linkedAssemblyTotal: 1,
      linkedAssemblyOpen: 1,
      linkedAssemblyUpdatedAt: new Date("2026-05-10T11:30:00.000Z"),
      now,
      staleHours: 4,
    });

    expect(result.riskLevel).toBe("MEDIO");
    expect(result.blockingCause).toBe("ASSEMBLY_PENDING");
    expect(result.assemblyBlocked).toBe(true);
  });
});
