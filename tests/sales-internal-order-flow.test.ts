import { describe, expect, it } from "vitest";
import { getSalesOrderFlowNarrative, getSalesOrderFlowStage, resolveSalesOrderPrimaryCta } from "@/lib/sales/internal-orders";
import {
  getSalesConsoleStageProgress,
  getSalesConsoleWorkType,
  resolveSalesConsolePrimaryActionState,
} from "@/lib/sales/console";

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

  it("returns cancelado for cancelled orders", () => {
    expect(getSalesOrderFlowStage({ status: "CANCELADA" })).toBe("cancelado");
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
      roles: ["SALES_EXECUTIVE"],
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
      roles: ["SALES_EXECUTIVE"],
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
    expect(narrative.primaryCta.code).toBe("MARK_DELIVERED");
    expect(narrative.primaryCta.isAllowed).toBe(true);
    expect(narrative.nextRecommendedAction.label).toBe("Marcar entrega");
  });

  it("resolves one allowed CTA for warehouse operator in pick stage", () => {
    const cta = resolveSalesOrderPrimaryCta({
      orderId: "ord-3",
      roles: ["WAREHOUSE_OPERATOR"],
      flowStage: "en_surtido",
      hasProductLines: true,
      latestPickStatus: "IN_PROGRESS",
      hasAssemblyLines: false,
      hasCompletedConfiguredAssembly: false,
    });
    expect(cta.code).toBe("OPERATE_PICK");
    expect(cta.isAllowed).toBe(true);
    expect(cta.action.label).toBe("Operar surtido");
  });

  it("blocks assembly CTA for sales executive when assembly is pending", () => {
    const cta = resolveSalesOrderPrimaryCta({
      orderId: "ord-4",
      roles: ["SALES_EXECUTIVE"],
      flowStage: "en_surtido",
      hasProductLines: false,
      latestPickStatus: "COMPLETED",
      hasAssemblyLines: true,
      hasCompletedConfiguredAssembly: false,
    });
    expect(cta.code).toBe("REVIEW_BLOCK");
    expect(cta.isAllowed).toBe(false);
    expect(cta.action.label).toBe("Revisar bloqueo");
  });

  it("allows assembly CTA for warehouse operator when assembly is pending", () => {
    const cta = resolveSalesOrderPrimaryCta({
      orderId: "ord-5",
      roles: ["WAREHOUSE_OPERATOR"],
      flowStage: "en_surtido",
      hasProductLines: false,
      latestPickStatus: "COMPLETED",
      hasAssemblyLines: true,
      hasCompletedConfiguredAssembly: false,
    });
    expect(cta.code).toBe("COMPLETE_ASSEMBLY");
    expect(cta.isAllowed).toBe(true);
    expect(cta.action.label).toBe("Completar ensamble");
  });

  it("allows delivery CTA for manager and system admin when delivery is eligible", () => {
    const managerCta = resolveSalesOrderPrimaryCta({
      orderId: "ord-6",
      roles: ["MANAGER"],
      flowStage: "listo_entrega",
      hasProductLines: true,
      latestPickStatus: "COMPLETED",
      hasAssemblyLines: true,
      hasCompletedConfiguredAssembly: true,
      deliveredEligibility: { canMarkDelivered: true, deliveredBlockedReason: null },
    });
    const adminCta = resolveSalesOrderPrimaryCta({
      orderId: "ord-7",
      roles: ["SYSTEM_ADMIN"],
      flowStage: "listo_entrega",
      hasProductLines: true,
      latestPickStatus: "COMPLETED",
      hasAssemblyLines: false,
      hasCompletedConfiguredAssembly: true,
      deliveredEligibility: { canMarkDelivered: true, deliveredBlockedReason: null },
    });

    expect(managerCta.code).toBe("MARK_DELIVERED");
    expect(managerCta.isAllowed).toBe(true);
    expect(adminCta.code).toBe("MARK_DELIVERED");
    expect(adminCta.isAllowed).toBe(true);
  });

  it("blocks delivery CTA when eligibility fails even on delivery stage", () => {
    const cta = resolveSalesOrderPrimaryCta({
      orderId: "ord-8",
      roles: ["MANAGER"],
      flowStage: "listo_entrega",
      hasProductLines: true,
      latestPickStatus: "COMPLETED",
      hasAssemblyLines: true,
      hasCompletedConfiguredAssembly: false,
      deliveredEligibility: {
        canMarkDelivered: false,
        deliveredBlockedReason: "Todas las órdenes de ensamble ligadas deben estar completadas",
      },
    });

    expect(cta.code).toBe("REVIEW_BLOCK");
    expect(cta.isAllowed).toBe(false);
    expect(cta.blockedReason).toContain("ensamble");
  });

  it("maps cockpit work types and stage progress from the shared flow stage", () => {
    expect(
      getSalesConsoleWorkType({
        flowStage: "captura",
        hasProductLines: false,
        hasAssemblyLines: false,
      }).label,
    ).toBe("Cotización pendiente");
    expect(
      getSalesConsoleWorkType({
        flowStage: "en_surtido",
        hasProductLines: true,
        hasAssemblyLines: false,
      }).label,
    ).toBe("Orden confirmada");

    const stageProgress = getSalesConsoleStageProgress("listo_entrega");
    expect(stageProgress.find((step) => step.isCurrent)?.stage).toBe("listo_entrega");
    expect(stageProgress[0].label).toBe("Captura");
    expect(stageProgress[stageProgress.length - 1]?.label).toBe("Cancelado");
  });

  it("keeps the cockpit next action blocked or informational instead of inventing new rules", () => {
    const reviewNarrative = getSalesOrderFlowNarrative({
      orderId: "ord-9",
      roles: ["SALES_EXECUTIVE"],
      status: "BORRADOR",
    });
    const reviewState = resolveSalesConsolePrimaryActionState({
      flowNarrative: reviewNarrative,
      canExecuteSalesActions: false,
      canExecuteProductionActions: false,
    });
    expect(reviewState.state).toBe("informational");
    expect(reviewState.code).toBe("REVIEW_BLOCK");

    const deliverNarrative = getSalesOrderFlowNarrative({
      orderId: "ord-10",
      roles: ["SALES_EXECUTIVE"],
      status: "CONFIRMADA",
      assignedToUserId: "user-1",
      pulledAt: new Date("2026-05-01T00:00:00.000Z"),
      latestPickStatus: "COMPLETED",
      hasProductLines: true,
      hasAssemblyLines: false,
      hasCompletedConfiguredAssembly: true,
      deliveredEligibility: { canMarkDelivered: true, deliveredBlockedReason: null },
    });
    const blockedState = resolveSalesConsolePrimaryActionState({
      flowNarrative: deliverNarrative,
      canExecuteSalesActions: false,
      canExecuteProductionActions: false,
    });
    expect(blockedState.state).toBe("blocked");
    expect(blockedState.blockedReason).toContain("escritura");

    const pickNarrative = getSalesOrderFlowNarrative({
      orderId: "ord-11",
      roles: ["WAREHOUSE_OPERATOR"],
      status: "CONFIRMADA",
      assignedToUserId: "user-1",
      latestPickStatus: "IN_PROGRESS",
      hasProductLines: true,
      hasAssemblyLines: false,
      hasCompletedConfiguredAssembly: false,
    });
    const productionBlockedState = resolveSalesConsolePrimaryActionState({
      flowNarrative: pickNarrative,
      canExecuteSalesActions: false,
      canExecuteProductionActions: false,
    });
    expect(productionBlockedState.state).toBe("blocked");
    expect(productionBlockedState.blockedReason).toContain("operativos");
  });
});
