import { describe, expect, it } from "vitest";
import { getSalesOrderFlowNarrative, getSalesOrderFlowStage } from "@/lib/sales/internal-orders";

describe("sales internal order flow stage", () => {
  it("returns captura for draft orders", () => {
    expect(getSalesOrderFlowStage({ status: "BORRADOR" })).toBe("captura");
  });

  it("returns por_asignar for confirmed unassigned orders", () => {
    expect(getSalesOrderFlowStage({ status: "CONFIRMADA", assignedToUserId: null })).toBe("por_asignar");
  });

  it("returns en_surtido when assigned but direct pick is pending", () => {
    expect(
      getSalesOrderFlowStage({
        status: "CONFIRMADA",
        assignedToUserId: "user-1",
        latestPickStatus: "IN_PROGRESS",
        hasProductLines: true,
      }),
    ).toBe("en_surtido");
  });

  it("returns listo_entrega when direct pick and assembly are complete", () => {
    expect(
      getSalesOrderFlowStage({
        status: "CONFIRMADA",
        assignedToUserId: "user-1",
        latestPickStatus: "COMPLETED",
        hasProductLines: true,
        hasAssemblyLines: true,
        hasCompletedConfiguredAssembly: true,
      }),
    ).toBe("listo_entrega");
  });

  it("returns entregado when delivered timestamp exists", () => {
    expect(
      getSalesOrderFlowStage({
        status: "CONFIRMADA",
        deliveredToCustomerAt: new Date("2026-05-01T00:00:00.000Z"),
      }),
    ).toBe("entregado");
  });

  it("keeps en_surtido when configured assembly lines are not fully linked/completed", () => {
    expect(
      getSalesOrderFlowStage({
        status: "CONFIRMADA",
        assignedToUserId: "user-1",
        latestPickStatus: "COMPLETED",
        hasProductLines: true,
        hasAssemblyLines: true,
        hasCompletedConfiguredAssembly: false,
      }),
    ).toBe("en_surtido");
  });

  it("recommends taking the order when it is unassigned and take is allowed", () => {
    const narrative = getSalesOrderFlowNarrative({
      orderId: "ord-1",
      status: "CONFIRMADA",
      assignedToUserId: null,
      takeEligibility: { canTakeOrder: true, takeBlockedReason: null },
    });

    expect(narrative.nextRecommendedAction.label).toBe("Tomar pedido");
    expect(narrative.nextRecommendedAction.href).toBe("/production/requests/ord-1");
  });

  it("recommends mark delivered when flow is ready and delivery is allowed", () => {
    const narrative = getSalesOrderFlowNarrative({
      orderId: "ord-2",
      status: "CONFIRMADA",
      assignedToUserId: "user-1",
      pulledAt: new Date("2026-05-01T00:00:00.000Z"),
      latestPickStatus: "COMPLETED",
      hasProductLines: true,
      hasAssemblyLines: true,
      hasCompletedConfiguredAssembly: true,
      deliveredEligibility: { canMarkDelivered: true, deliveredBlockedReason: null },
    });

    expect(narrative.flowStage).toBe("listo_entrega");
    expect(narrative.nextRecommendedAction.label).toBe("Marcar entrega");
  });
});
