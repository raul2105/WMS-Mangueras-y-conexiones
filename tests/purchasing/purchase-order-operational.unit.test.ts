import { describe, expect, it } from "vitest";
import {
  comparePurchaseOrderOperationalPriority,
  getPurchaseOrderOperationalState,
  getPurchaseOrderReceivedPercent,
} from "@/lib/purchasing/purchase-order-operational";

const NOW = new Date("2026-08-15T18:00:00.000Z");

function order(overrides: Partial<{
  status: string;
  expectedDate: Date | string | null;
  lines: Array<{ qtyOrdered: number; qtyReceived: number }>;
}> = {}) {
  return {
    status: "CONFIRMADA",
    expectedDate: "2026-08-16T18:00:00.000Z",
    lines: [{ qtyOrdered: 10, qtyReceived: 0 }],
    ...overrides,
  };
}

describe("purchase order operational state", () => {
  it("calculates received progress without exceeding 100 percent", () => {
    expect(getPurchaseOrderReceivedPercent([
      { qtyOrdered: 10, qtyReceived: 4 },
      { qtyOrdered: 5, qtyReceived: 5 },
    ])).toBe(60);
    expect(getPurchaseOrderReceivedPercent([{ qtyOrdered: 5, qtyReceived: 8 }])).toBe(100);
    expect(getPurchaseOrderReceivedPercent([])).toBe(0);
  });

  it("raises overdue open orders above other work", () => {
    const overdue = getPurchaseOrderOperationalState(order({
      expectedDate: "2026-08-14T18:00:00.000Z",
    }), NOW);
    const scheduled = getPurchaseOrderOperationalState(order(), NOW);

    expect(overdue.isOverdue).toBe(true);
    expect(overdue.riskLabel).toBe("Vencida");
    expect(overdue.riskTone).toBe("danger");
    expect(overdue.nextAction).toBe("Atender vencimiento");
    expect(overdue.priority).toBeLessThan(scheduled.priority);
  });

  it("surfaces an open order without lines as a blocking data risk", () => {
    const state = getPurchaseOrderOperationalState(order({ lines: [] }), NOW);

    expect(state.riskLabel).toBe("Sin líneas");
    expect(state.riskTone).toBe("danger");
    expect(state.nextAction).toBe("Corregir líneas de OC");
    expect(state.priority).toBe(1);
  });

  it("makes partial and due-today work explicit", () => {
    const partial = getPurchaseOrderOperationalState(order({
      status: "PARCIAL",
      expectedDate: "2026-08-15T18:00:00.000Z",
      lines: [{ qtyOrdered: 10, qtyReceived: 4 }],
    }), NOW);

    expect(partial.isDueToday).toBe(true);
    expect(partial.receivedPercent).toBe(40);
    expect(partial.riskLabel).toBe("Recepción parcial");
    expect(partial.nextAction).toBe("Completar recepción hoy");
  });

  it("flags confirmed orders without an expected date for manager attention", () => {
    const state = getPurchaseOrderOperationalState(order({ expectedDate: null }), NOW);

    expect(state.riskLabel).toBe("Sin fecha esperada");
    expect(state.riskTone).toBe("warning");
    expect(state.nextAction).toBe("Definir fecha esperada");
  });

  it("sorts overdue, partial, due today and normal work in that order", () => {
    const items = [
      order({ status: "BORRADOR", expectedDate: null }),
      order({ status: "CONFIRMADA", expectedDate: "2026-08-15T18:00:00.000Z" }),
      order({ status: "PARCIAL", expectedDate: "2026-08-16T18:00:00.000Z" }),
      order({ status: "EN_TRANSITO", expectedDate: "2026-08-14T18:00:00.000Z" }),
    ].sort((left, right) => comparePurchaseOrderOperationalPriority(left, right, NOW));

    expect(items.map((item) => item.status)).toEqual([
      "EN_TRANSITO",
      "PARCIAL",
      "CONFIRMADA",
      "BORRADOR",
    ]);
  });
});
