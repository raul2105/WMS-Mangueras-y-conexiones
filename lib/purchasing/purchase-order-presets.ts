import type { Prisma } from "@prisma/client";

export const PURCHASE_ORDER_PRESET_FILTERS = [
  "todas",
  "borrador",
  "confirmadas",
  "en_transito",
  "parciales",
  "recibidas",
  "vencidas",
  "por_recibir",
  "recepcion_parcial",
  "por_recibir_hoy",
] as const;

export type PurchaseOrderPresetFilter = (typeof PURCHASE_ORDER_PRESET_FILTERS)[number];

const OPEN_STATUSES = ["BORRADOR", "CONFIRMADA", "EN_TRANSITO", "PARCIAL"] as const;
const MEXICO_CITY_TIME_ZONE = "America/Mexico_City";
const MEXICO_CITY_UTC_OFFSET_HOURS = 6;

type PurchaseOrderTimingLike = {
  status: string;
  expectedDate: Date | string | null | undefined;
};

function getMexicoCityDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MEXICO_CITY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = Number(parts.find((part) => part.type === "year")?.value ?? "0");
  const month = Number(parts.find((part) => part.type === "month")?.value ?? "0");
  const day = Number(parts.find((part) => part.type === "day")?.value ?? "0");

  return { year, month, day };
}

export function getMexicoCityDayBounds(date = new Date()) {
  const { year, month, day } = getMexicoCityDateParts(date);
  const start = new Date(Date.UTC(year, month - 1, day, MEXICO_CITY_UTC_OFFSET_HOURS, 0, 0));
  const end = new Date(Date.UTC(year, month - 1, day + 1, MEXICO_CITY_UTC_OFFSET_HOURS, 0, 0));
  return { start, end };
}

export function isPurchaseOrderPresetFilter(value: unknown): value is PurchaseOrderPresetFilter {
  return typeof value === "string" && PURCHASE_ORDER_PRESET_FILTERS.includes(value as PurchaseOrderPresetFilter);
}

export function getPurchaseOrderPresetLabel(filter: PurchaseOrderPresetFilter) {
  switch (filter) {
    case "todas":
      return "Todas";
    case "borrador":
      return "Borrador";
    case "confirmadas":
      return "Confirmadas";
    case "en_transito":
      return "En tránsito";
    case "parciales":
      return "Parciales";
    case "recibidas":
      return "Recibidas";
    case "vencidas":
      return "Vencidas";
    case "por_recibir":
      return "Por recibir";
    case "recepcion_parcial":
      return "Recepción parcial";
    case "por_recibir_hoy":
      return "Por recibir hoy";
    default:
      return filter;
  }
}

export function buildPurchaseOrderPresetWhere(
  filter: PurchaseOrderPresetFilter | undefined,
): Prisma.PurchaseOrderWhereInput {
  if (!filter || filter === "todas") return {};

  switch (filter) {
    case "borrador":
      return { status: "BORRADOR" };
    case "confirmadas":
      return { status: "CONFIRMADA" };
    case "en_transito":
      return { status: "EN_TRANSITO" };
    case "parciales":
      return { status: "PARCIAL" };
    case "recibidas":
      return { status: "RECIBIDA" };
    case "vencidas": {
      const { start } = getMexicoCityDayBounds();
      return {
        status: { in: [...OPEN_STATUSES] },
        expectedDate: { lt: start },
      };
    }
    case "por_recibir":
      return { status: { in: ["CONFIRMADA", "EN_TRANSITO"] } };
    case "recepcion_parcial":
      return { status: "PARCIAL" };
    case "por_recibir_hoy": {
      const { start, end } = getMexicoCityDayBounds();
      return {
        status: { in: [...OPEN_STATUSES] },
        expectedDate: { gte: start, lt: end },
      };
    }
    default:
      return {};
  }
}

export function matchesPurchaseOrderPreset(
  order: PurchaseOrderTimingLike,
  filter: PurchaseOrderPresetFilter | undefined,
) {
  if (!filter || filter === "todas") return true;

  const status = order.status;
  const expectedDate = order.expectedDate ? new Date(order.expectedDate) : null;
  const { start, end } = getMexicoCityDayBounds();

  switch (filter) {
    case "borrador":
      return status === "BORRADOR";
    case "confirmadas":
      return status === "CONFIRMADA";
    case "en_transito":
      return status === "EN_TRANSITO";
    case "parciales":
      return status === "PARCIAL";
    case "recibidas":
      return status === "RECIBIDA";
    case "vencidas":
      return Boolean(expectedDate && OPEN_STATUSES.includes(status as typeof OPEN_STATUSES[number]) && expectedDate < start);
    case "por_recibir":
      return status === "CONFIRMADA" || status === "EN_TRANSITO";
    case "recepcion_parcial":
      return status === "PARCIAL";
    case "por_recibir_hoy":
      return Boolean(expectedDate && OPEN_STATUSES.includes(status as typeof OPEN_STATUSES[number]) && expectedDate >= start && expectedDate < end);
    default:
      return false;
  }
}
