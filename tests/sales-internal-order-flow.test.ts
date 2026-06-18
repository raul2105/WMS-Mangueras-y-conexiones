import { describe, expect, it } from "vitest";
import { getSalesOrderFlowNarrative, getSalesOrderFlowStage, resolveSalesOrderPrimaryCta } from "@/lib/sales/internal-orders";
import {
  getSalesConsoleStageProgress,
  getSalesConsoleTimelineItems,
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

  it("keeps the sales flow narrative matrix coherent across stage, action, and filters", () => {
    const cases = [
      {
        name: "draft/capture",
        input: {
          orderId: "ord-capture",
          roles: ["SALES_EXECUTIVE"],
          status: "BORRADOR" as const,
        },
        expected: {
          flowStage: "captura",
          listLabel: "Captura",
          detailTimelineLabel: "Captura",
          nextAction: "Revisar bloqueo",
          filterBucket: "Borrador / Captura",
          deliveryEligibility: false,
          meaning: "capture",
        },
      },
      {
        name: "confirmed/assignment",
        input: {
          orderId: "ord-assignment",
          roles: ["SALES_EXECUTIVE"],
          status: "CONFIRMADA" as const,
          assignedToUserId: null,
          takeEligibility: { canTakeOrder: true, takeBlockedReason: null },
        },
        expected: {
          flowStage: "por_asignar",
          listLabel: "Por asignar",
          detailTimelineLabel: "Asignación",
          nextAction: "Tomar pedido",
          filterBucket: "Sin asignar",
          deliveryEligibility: false,
          meaning: "confirmed / ready for assignment",
        },
      },
      {
        name: "assigned/in-fulfillment",
        input: {
          orderId: "ord-fulfillment",
          roles: ["SALES_EXECUTIVE"],
          status: "CONFIRMADA" as const,
          assignedToUserId: "user-1",
          latestPickStatus: "IN_PROGRESS",
          hasProductLines: true,
          deliveredEligibility: {
            canMarkDelivered: false,
            deliveredBlockedReason: "El surtido directo debe estar completado",
          },
        },
        expected: {
          flowStage: "en_surtido",
          listLabel: "En surtido",
          detailTimelineLabel: "Surtido / fulfillment",
          nextAction: "Revisar bloqueo",
          filterBucket: "En surtido",
          deliveryEligibility: false,
          meaning: "assigned / in fulfillment",
        },
      },
      {
        name: "partially-fulfilled",
        input: {
          orderId: "ord-partial",
          roles: ["SALES_EXECUTIVE"],
          status: "CONFIRMADA" as const,
          assignedToUserId: "user-1",
          latestPickStatus: "PARTIAL",
          hasProductLines: true,
          deliveredEligibility: {
            canMarkDelivered: false,
            deliveredBlockedReason: "El surtido directo debe estar completado",
          },
        },
        expected: {
          flowStage: "en_surtido",
          listLabel: "En surtido",
          detailTimelineLabel: "Surtido / fulfillment",
          nextAction: "Revisar bloqueo",
          filterBucket: "Parciales",
          deliveryEligibility: false,
          meaning: "partially fulfilled",
        },
      },
      {
        name: "ready-for-delivery",
        input: {
          orderId: "ord-ready",
          roles: ["SALES_EXECUTIVE"],
          status: "CONFIRMADA" as const,
          assignedToUserId: "user-1",
          pulledAt: new Date("2026-05-01T00:00:00.000Z"),
          latestPickStatus: "COMPLETED",
          hasProductLines: true,
          hasAssemblyLines: false,
          hasCompletedConfiguredAssembly: true,
          takeEligibility: { canTakeOrder: false, takeBlockedReason: "El pedido ya está asignado" },
          deliveredEligibility: { canMarkDelivered: true, deliveredBlockedReason: null },
        },
        expected: {
          flowStage: "listo_entrega",
          listLabel: "Listo para entrega",
          detailTimelineLabel: "Entrega",
          nextAction: "Marcar entrega",
          filterBucket: "Listos para entrega",
          deliveryEligibility: true,
          meaning: "ready for delivery",
        },
      },
      {
        name: "delivered",
        input: {
          orderId: "ord-delivered",
          roles: ["SALES_EXECUTIVE"],
          status: "CONFIRMADA" as const,
          assignedToUserId: "user-1",
          pulledAt: new Date("2026-05-01T00:00:00.000Z"),
          deliveredToCustomerAt: new Date("2026-05-02T00:00:00.000Z"),
        },
        expected: {
          flowStage: "entregado",
          listLabel: "Entregado",
          detailTimelineLabel: "Entrega",
          nextAction: "Revisar bloqueo",
          filterBucket: "Entregado",
          deliveryEligibility: false,
          meaning: "delivered",
        },
      },
      {
        name: "cancelled",
        input: {
          orderId: "ord-cancelled",
          roles: ["SALES_EXECUTIVE"],
          status: "CANCELADA" as const,
          cancelledAt: new Date("2026-05-03T00:00:00.000Z"),
        },
        expected: {
          flowStage: "cancelado",
          listLabel: "Cancelado",
          detailTimelineLabel: "Cancelación",
          nextAction: "Revisar bloqueo",
          filterBucket: "Cancelada",
          deliveryEligibility: false,
          meaning: "cancelled",
        },
      },
      {
        name: "blocked / missing data",
        input: {
          orderId: "ord-blocked",
          roles: ["SALES_EXECUTIVE"],
          status: "CONFIRMADA" as const,
          assignedToUserId: "user-1",
          latestPickStatus: "DRAFT",
          hasProductLines: true,
          hasAssemblyLines: true,
          hasCompletedConfiguredAssembly: false,
          deliveredEligibility: {
            canMarkDelivered: false,
            deliveredBlockedReason: "Todas las órdenes de ensamble ligadas deben estar completadas",
          },
        },
        expected: {
          flowStage: "en_surtido",
          listLabel: "En surtido",
          detailTimelineLabel: "Surtido / fulfillment",
          nextAction: "Revisar bloqueo",
          filterBucket: "Bloqueados",
          deliveryEligibility: false,
          meaning: "blocked / missing data",
        },
      },
    ];

    const timelineLabels = getSalesConsoleTimelineItems({
      createdAt: new Date("2026-04-30T12:00:00.000Z"),
      confirmedAt: new Date("2026-05-01T12:00:00.000Z"),
      assignedAt: new Date("2026-05-01T13:00:00.000Z"),
      pulledAt: new Date("2026-05-01T14:00:00.000Z"),
      latestPickStatus: "COMPLETED",
      latestPickUpdatedAt: new Date("2026-05-01T15:00:00.000Z"),
      deliveredAt: new Date("2026-05-02T12:00:00.000Z"),
      cancelledAt: new Date("2026-05-03T12:00:00.000Z"),
    }).map((item) => item.label);

    expect(timelineLabels).toEqual([
      "Captura",
      "Asignación",
      "Surtido / fulfillment",
      "Entrega",
      "Cancelación",
    ]);

    for (const row of cases) {
      const flowNarrative = getSalesOrderFlowNarrative({
        ...(row.input as Parameters<typeof getSalesOrderFlowNarrative>[0]),
        takeEligibility:
          "takeEligibility" in row.input
            ? row.input.takeEligibility
            : row.expected.flowStage === "por_asignar"
              ? { canTakeOrder: true, takeBlockedReason: null }
              : undefined,
        deliveredEligibility:
          "deliveredEligibility" in row.input
            ? row.input.deliveredEligibility
            : row.expected.flowStage === "listo_entrega"
              ? { canMarkDelivered: true, deliveredBlockedReason: null }
              : { canMarkDelivered: false, deliveredBlockedReason: "El pedido debe estar confirmado" },
      });

      expect(flowNarrative.flowStage).toBe(row.expected.flowStage);
      expect(flowNarrative.flowStageLabel).toBe(row.expected.listLabel);
      expect(flowNarrative.nextRecommendedAction.label).toBe(row.expected.nextAction);
      expect(flowNarrative.primaryCta.action.label).toBe(row.expected.nextAction);
      expect(flowNarrative.primaryCta.reason.length).toBeGreaterThan(0);
      expect(getSalesConsoleStageProgress(flowNarrative.flowStage).find((step) => step.isCurrent)?.label).toBe(row.expected.listLabel);
      expect(row.expected.detailTimelineLabel).toBeTruthy();
      expect(row.expected.filterBucket).toBeTruthy();
      expect(row.expected.meaning).toBeTruthy();

      if (row.expected.deliveryEligibility) {
        expect(flowNarrative.flowStage).toBe("listo_entrega");
      }
    }
  });
});
