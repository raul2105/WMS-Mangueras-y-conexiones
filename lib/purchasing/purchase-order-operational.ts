import { getMexicoCityDayBounds } from "@/lib/purchasing/purchase-order-presets";

export type PurchaseOrderOperationalTone = "neutral" | "accent" | "success" | "warning" | "danger";

export type PurchaseOrderOperationalInput = {
  status: string;
  expectedDate: Date | string | null | undefined;
  lines?: Array<{ qtyOrdered: number; qtyReceived: number }>;
};

export type PurchaseOrderOperationalState = {
  receivedPercent: number;
  riskLabel: string;
  riskTone: PurchaseOrderOperationalTone;
  nextAction: string;
  priority: number;
  isOverdue: boolean;
  isDueToday: boolean;
};

const OPEN_STATUSES = new Set(["BORRADOR", "CONFIRMADA", "EN_TRANSITO", "PARCIAL"]);

function toDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getPurchaseOrderReceivedPercent(lines: PurchaseOrderOperationalInput["lines"] = []) {
  const totalOrdered = lines.reduce((sum, line) => sum + line.qtyOrdered, 0);
  const totalReceived = lines.reduce((sum, line) => sum + line.qtyReceived, 0);
  if (totalOrdered <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((totalReceived / totalOrdered) * 100)));
}

export function getPurchaseOrderOperationalState(
  order: PurchaseOrderOperationalInput,
  now = new Date(),
): PurchaseOrderOperationalState {
  const receivedPercent = getPurchaseOrderReceivedPercent(order.lines);
  const expectedDate = toDate(order.expectedDate);
  const { start, end } = getMexicoCityDayBounds(now);
  const isOpen = OPEN_STATUSES.has(order.status);
  const isOverdue = Boolean(isOpen && expectedDate && expectedDate < start);
  const isDueToday = Boolean(isOpen && expectedDate && expectedDate >= start && expectedDate < end);

  if (order.status === "RECIBIDA") {
    return {
      receivedPercent,
      riskLabel: "Cerrada",
      riskTone: "success",
      nextAction: "Consultar evidencia",
      priority: 90,
      isOverdue: false,
      isDueToday: false,
    };
  }

  if (order.status === "CANCELADA") {
    return {
      receivedPercent,
      riskLabel: "Cancelada",
      riskTone: "neutral",
      nextAction: "Consultar historial",
      priority: 100,
      isOverdue: false,
      isDueToday: false,
    };
  }

  if (isOverdue) {
    return {
      receivedPercent,
      riskLabel: "Vencida",
      riskTone: "danger",
      nextAction: order.status === "PARCIAL" ? "Completar recepción vencida" : "Atender vencimiento",
      priority: 0,
      isOverdue,
      isDueToday,
    };
  }

  if (order.status === "PARCIAL") {
    return {
      receivedPercent,
      riskLabel: "Recepción parcial",
      riskTone: "warning",
      nextAction: isDueToday ? "Completar recepción hoy" : "Completar recepción",
      priority: isDueToday ? 5 : 10,
      isOverdue,
      isDueToday,
    };
  }

  if (isDueToday) {
    return {
      receivedPercent,
      riskLabel: "Recibir hoy",
      riskTone: "warning",
      nextAction: "Coordinar recepción hoy",
      priority: 15,
      isOverdue,
      isDueToday,
    };
  }

  if (order.status === "EN_TRANSITO") {
    return {
      receivedPercent,
      riskLabel: "En tránsito",
      riskTone: "accent",
      nextAction: "Dar seguimiento y recibir",
      priority: 20,
      isOverdue,
      isDueToday,
    };
  }

  if (order.status === "CONFIRMADA") {
    return {
      receivedPercent,
      riskLabel: expectedDate ? "Programada" : "Sin fecha esperada",
      riskTone: expectedDate ? "accent" : "warning",
      nextAction: expectedDate ? "Coordinar envío o recepción" : "Definir fecha esperada",
      priority: expectedDate ? 30 : 25,
      isOverdue,
      isDueToday,
    };
  }

  if (order.status === "BORRADOR") {
    return {
      receivedPercent,
      riskLabel: "Por completar",
      riskTone: "neutral",
      nextAction: "Completar y confirmar OC",
      priority: 40,
      isOverdue,
      isDueToday,
    };
  }

  return {
    receivedPercent,
    riskLabel: "Revisar",
    riskTone: "neutral",
    nextAction: "Revisar orden",
    priority: 50,
    isOverdue,
    isDueToday,
  };
}

export function comparePurchaseOrderOperationalPriority<
  T extends PurchaseOrderOperationalInput,
>(left: T, right: T, now = new Date()) {
  const leftState = getPurchaseOrderOperationalState(left, now);
  const rightState = getPurchaseOrderOperationalState(right, now);
  if (leftState.priority !== rightState.priority) return leftState.priority - rightState.priority;

  const leftDate = toDate(left.expectedDate)?.getTime() ?? Number.POSITIVE_INFINITY;
  const rightDate = toDate(right.expectedDate)?.getTime() ?? Number.POSITIVE_INFINITY;
  return leftDate - rightDate;
}
