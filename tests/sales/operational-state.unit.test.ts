import { describe, expect, it } from "vitest";
import { getOperationalStateForBlockingCause, getOperationalUxState } from "@/lib/sales/operational-state";
import { OPERATIONAL_FLOW_FIXTURES, ROLE_FIXTURES } from "@/tests/fixtures/operational-flow.fixtures";
import { mockAvailability, mockBlockedOrder, mockRole, mockStaging } from "@/tests/fixtures/operational-flow.mocks";

describe("operational UX state contract", () => {
  it.each([
    ["OVERDUE_UNRELEASED", "Bloqueado", "danger"],
    ["PICK_PARTIAL", "Verificar", "warning"],
    ["ASSEMBLY_PENDING", "En proceso", "accent"],
  ] as const)("maps %s to an explicit state", (cause, label, variant) => {
    const state = getOperationalStateForBlockingCause(cause);
    expect(state.label).toBe(label);
    expect(state.variant).toBe(variant);
    expect(state.nextAction).not.toBe("");
  });

  it("prioritizes ready-for-delivery when delivery is eligible", () => {
    expect(
      getOperationalUxState({
        blockingCause: "NONE",
        isPartial: false,
        assemblyBlocked: false,
        isUnreleased: false,
        latestPickStatus: "COMPLETED",
        canMarkDelivered: true,
      }),
    ).toMatchObject({ key: "ready_to_deliver", label: "Listo para entrega" });
  });

  it("keeps partial work actionable without a database", () => {
    expect(
      getOperationalUxState({
        blockingCause: "NONE",
        isPartial: true,
        assemblyBlocked: false,
        isUnreleased: false,
        latestPickStatus: "PARTIAL",
      }),
    ).toMatchObject({ key: "verify", nextAction: "Resolver faltante" });
  });

  it("gives closed and empty orders a truthful non-operational state", () => {
    const base = {
      blockingCause: "NONE" as const,
      isPartial: false,
      assemblyBlocked: false,
      isUnreleased: false,
      latestPickStatus: null,
    };

    expect(getOperationalUxState({ ...base, isDelivered: true })).toMatchObject({
      key: "delivered",
      nextAction: "Ver historial",
    });
    expect(getOperationalUxState({ ...base, isCancelled: true })).toMatchObject({
      key: "cancelled",
      nextAction: "Ver historial",
    });
    expect(getOperationalUxState({ ...base, hasLines: false })).toMatchObject({
      key: "capture",
      nextAction: "Agregar productos",
    });
  });

  it("keeps reusable role fixtures explicit", () => {
    expect(ROLE_FIXTURES.SALES_EXECUTIVE.canExecutePick).toBe(false);
    expect(ROLE_FIXTURES.WAREHOUSE_OPERATOR.canExecutePick).toBe(true);
    expect(OPERATIONAL_FLOW_FIXTURES.availability.status).toBe("promise_safe");
    expect(OPERATIONAL_FLOW_FIXTURES.staging.verified).toBe(true);
    expect(mockAvailability({ availableQuantity: 4 }).availableQuantity).toBe(4);
    expect(mockBlockedOrder().blockingCause).toBe("PICK_PARTIAL");
    expect(mockStaging({ verified: false }).verified).toBe(false);
    expect(mockRole("WAREHOUSE_OPERATOR")).toMatchObject({ canExecutePick: true });
  });
});
