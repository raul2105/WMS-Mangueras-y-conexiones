import { describe, expect, it } from "vitest";
import {
  getMarkDeliveredEligibility,
  getSalesOrderFlowStage,
  resolveSalesOrderPrimaryCta,
} from "@/lib/sales/internal-orders";

describe("prepared for delivery sales order contract", () => {
  const completedWork = {
    status: "CONFIRMADA" as const,
    assignedToUserId: "sales-1",
    pulledAt: new Date("2026-07-16T10:00:00.000Z"),
    hasCompletedDirectPick: true,
    hasCompletedConfiguredAssembly: true,
  };

  it("keeps a completed order in fulfillment until an operator records the delivery area", () => {
    expect(
      getSalesOrderFlowStage({
        ...completedWork,
        hasProductLines: true,
        hasAssemblyLines: true,
      }),
    ).toBe("en_surtido");

    expect(getMarkDeliveredEligibility(completedWork)).toMatchObject({
      canMarkDelivered: false,
      deliveredBlockedReason: "El pedido debe estar preparado en el área de entrega",
    });
  });

  it("allows the warehouse operator to prepare a fully completed order", () => {
    const cta = resolveSalesOrderPrimaryCta({
      orderId: "order-ready",
      roles: ["WAREHOUSE_OPERATOR"],
      flowStage: "en_surtido",
      hasProductLines: true,
      latestPickStatus: "COMPLETED",
      hasAssemblyLines: true,
      hasCompletedConfiguredAssembly: true,
    });

    expect(cta).toMatchObject({
      code: "PREPARE_DELIVERY",
      action: { label: "Preparar pedido", href: "/production/requests/order-ready" },
      isAllowed: true,
    });
  });

  it("keeps an assembly-only order on its linked assembly until the work is complete", () => {
    const cta = resolveSalesOrderPrimaryCta({
      orderId: "order-assembly-only",
      roles: ["WAREHOUSE_OPERATOR"],
      flowStage: "en_surtido",
      hasProductLines: false,
      hasAssemblyLines: true,
      hasCompletedConfiguredAssembly: false,
      assemblyHref: "/production/orders/assembly-order-1",
    });

    expect(cta).toMatchObject({
      code: "COMPLETE_ASSEMBLY",
      action: { href: "/production/orders/assembly-order-1" },
      isAllowed: true,
    });
    expect(
      getMarkDeliveredEligibility({
        ...completedWork,
        hasCompletedConfiguredAssembly: false,
        preparedForDeliveryAt: new Date("2026-07-16T10:20:00.000Z"),
      }),
    ).toMatchObject({
      canMarkDelivered: false,
      deliveredBlockedReason: "Todas las órdenes de ensamble ligadas deben estar completadas",
    });
  });

  it("exposes prepared for delivery only after the physical area is recorded", () => {
    const preparedAt = new Date("2026-07-16T10:20:00.000Z");
    expect(
      getSalesOrderFlowStage({
        ...completedWork,
        hasProductLines: true,
        hasAssemblyLines: true,
        latestPickStatus: "COMPLETED",
        hasCompletedConfiguredAssembly: true,
        preparedForDeliveryAt: preparedAt,
      }),
    ).toBe("listo_entrega");
    expect(
      getMarkDeliveredEligibility({ ...completedWork, preparedForDeliveryAt: preparedAt }),
    ).toMatchObject({ canMarkDelivered: true, deliveredBlockedReason: null });
  });
});
