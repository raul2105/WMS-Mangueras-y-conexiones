import { describe, expect, it } from "vitest";
import { evaluateOperationalPresets, matchOperationalPreset } from "@/lib/dashboard/fulfillment-operational-presets";

describe("fulfillment operational presets", () => {
  const now = new Date("2026-05-10T15:00:00.000Z");
  const timezone = "America/Mexico_City";

  it("classifies BLOQUEADOS as primary when unreleased", () => {
    const result = evaluateOperationalPresets(
      {
        dueDate: new Date("2026-05-09T14:00:00.000Z"),
        assignedToUserId: null,
        flowStage: "por_asignar",
        isPartial: false,
        isUnreleased: true,
        assemblyBlocked: false,
        canMarkDelivered: false,
        isStale: false,
        lastOperationalUpdateAt: new Date("2026-05-10T12:00:00.000Z"),
        inActiveQueue: true,
      },
      { now, timezone, staleHours: 4 },
    );

    expect(result.primaryPreset).toBe("BLOQUEADOS");
    expect(result.secondaryPresets).toContain("URGENTES");
    expect(result.reasons.some((reason) => reason.code === "OVERDUE")).toBe(true);
    expect(result.reasons.some((reason) => reason.code === "UNRELEASED")).toBe(true);
  });

  it("classifies VENCEN_HOY when due today without urgency friction", () => {
    const result = evaluateOperationalPresets(
      {
        dueDate: new Date("2026-05-10T20:00:00.000Z"),
        assignedToUserId: "u-1",
        flowStage: "en_surtido",
        isPartial: false,
        isUnreleased: false,
        assemblyBlocked: false,
        canMarkDelivered: false,
        isStale: false,
        lastOperationalUpdateAt: new Date("2026-05-10T12:00:00.000Z"),
        inActiveQueue: true,
      },
      { now, timezone, staleHours: 4 },
    );

    expect(result.primaryPreset).toBe("VENCEN_HOY");
  });

  it("classifies SIN_ASIGNAR in active queue", () => {
    const result = evaluateOperationalPresets(
      {
        dueDate: null,
        assignedToUserId: null,
        flowStage: "por_asignar",
        isPartial: false,
        isUnreleased: false,
        assemblyBlocked: false,
        canMarkDelivered: false,
        isStale: false,
        lastOperationalUpdateAt: new Date("2026-05-10T12:00:00.000Z"),
        inActiveQueue: true,
      },
      { now, timezone, staleHours: 4 },
    );

    expect(result.primaryPreset).toBe("SIN_ASIGNAR");
  });

  it("classifies SIN_MOVIMIENTO when stale signal is active", () => {
    const result = evaluateOperationalPresets(
      {
        dueDate: null,
        assignedToUserId: "u-2",
        flowStage: "en_surtido",
        isPartial: false,
        isUnreleased: false,
        assemblyBlocked: false,
        canMarkDelivered: false,
        isStale: true,
        lastOperationalUpdateAt: new Date("2026-05-10T08:00:00.000Z"),
        inActiveQueue: true,
      },
      { now, timezone, staleHours: 4 },
    );

    expect(result.primaryPreset).toBe("SIN_MOVIMIENTO");
    expect(result.reasons.some((reason) => reason.code === "STALE")).toBe(true);
  });

  it("classifies LISTOS_PARA_ENTREGA when flow and eligibility are aligned", () => {
    const result = evaluateOperationalPresets(
      {
        dueDate: null,
        assignedToUserId: "u-3",
        flowStage: "listo_entrega",
        isPartial: false,
        isUnreleased: false,
        assemblyBlocked: false,
        canMarkDelivered: true,
        isStale: false,
        lastOperationalUpdateAt: new Date("2026-05-10T12:00:00.000Z"),
        inActiveQueue: true,
      },
      { now, timezone, staleHours: 4 },
    );

    expect(result.primaryPreset).toBe("LISTOS_PARA_ENTREGA");
    expect(result.reasons.some((reason) => reason.code === "READY_FOR_DELIVERY")).toBe(true);
  });

  it("keeps deterministic precedence and supports primary filter matching", () => {
    const result = evaluateOperationalPresets(
      {
        dueDate: new Date("2026-05-10T20:00:00.000Z"),
        assignedToUserId: null,
        flowStage: "listo_entrega",
        isPartial: true,
        isUnreleased: false,
        assemblyBlocked: false,
        canMarkDelivered: true,
        isStale: true,
        lastOperationalUpdateAt: new Date("2026-05-10T04:00:00.000Z"),
        inActiveQueue: true,
      },
      { now, timezone, staleHours: 4 },
    );

    expect(result.primaryPreset).toBe("BLOQUEADOS");
    expect(result.secondaryPresets).toEqual(expect.arrayContaining(["URGENTES", "SIN_MOVIMIENTO", "SIN_ASIGNAR", "LISTOS_PARA_ENTREGA"]));
    expect(matchOperationalPreset(result, "bloqueados", "primary")).toBe(true);
    expect(matchOperationalPreset(result, "sin_movimiento", "primary")).toBe(false);
    expect(matchOperationalPreset(result, "sin_movimiento", "secondaryOrPrimary")).toBe(true);
    expect(result.facts.timezone).toBe(timezone);
    expect(result.facts.staleHours).toBe(4);
  });
});
