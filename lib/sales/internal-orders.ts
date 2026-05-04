import type { Prisma, PrismaClient, SalesInternalOrderStatus } from "@prisma/client";

const SALES_INTERNAL_ORDER_PREFIX = "PI";
const GENERATED_PRODUCTION_ORDER_PREFIX = "SOE";
const SALES_PICK_LIST_PREFIX = "PK-SUR";

export const SALES_INTERNAL_ORDER_STATUS_LABELS: Record<SalesInternalOrderStatus, string> = {
  BORRADOR: "Borrador",
  CONFIRMADA: "Confirmada",
  CANCELADA: "Cancelada",
};

export const SALES_INTERNAL_ORDER_STATUS_STYLES: Record<SalesInternalOrderStatus, string> = {
  BORRADOR: "text-slate-300 bg-slate-500/20",
  CONFIRMADA: "text-emerald-300 bg-emerald-500/20",
  CANCELADA: "text-red-300 bg-red-500/20",
};

export type SalesOrderFlowStage =
  | "captura"
  | "por_asignar"
  | "en_surtido"
  | "listo_entrega"
  | "entregado"
  | "cancelado";

export const SALES_ORDER_FLOW_STAGE_LABELS: Record<SalesOrderFlowStage, string> = {
  captura: "Captura",
  por_asignar: "Por asignar",
  en_surtido: "En surtido",
  listo_entrega: "Listo para entrega",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

export type SalesOrderFlowBadgeVariant = "neutral" | "accent" | "warning" | "success" | "danger";

export const SALES_ORDER_FLOW_STAGE_BADGE_VARIANTS: Record<SalesOrderFlowStage, SalesOrderFlowBadgeVariant> = {
  captura: "neutral",
  por_asignar: "accent",
  en_surtido: "warning",
  listo_entrega: "success",
  entregado: "success",
  cancelado: "danger",
};

export type FlowRiskLevel = "ALTO" | "MEDIO" | "BAJO";

export const FLOW_RISK_LEVEL_LABELS: Record<FlowRiskLevel, string> = {
  ALTO: "Alto",
  MEDIO: "Medio",
  BAJO: "Bajo",
};

type CodeDb = PrismaClient | Prisma.TransactionClient;

export async function getNextSalesInternalOrderCode(db: CodeDb, now = new Date()) {
  const year = now.getFullYear();
  const prefix = `${SALES_INTERNAL_ORDER_PREFIX}-${year}-`;
  const lastOrder = await db.salesInternalOrder.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: "desc" },
    select: { code: true },
  });

  const lastSequence = lastOrder?.code ? Number.parseInt(lastOrder.code.slice(prefix.length), 10) : 0;
  const nextSequence = Number.isFinite(lastSequence) ? lastSequence + 1 : 1;
  return `${prefix}${String(nextSequence).padStart(4, "0")}`;
}

export async function getNextGeneratedProductionOrderCode(db: CodeDb, now = new Date()) {
  const year = now.getFullYear();
  const prefix = `${GENERATED_PRODUCTION_ORDER_PREFIX}-${year}-`;
  const lastOrder = await db.productionOrder.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: "desc" },
    select: { code: true },
  });

  const lastSequence = lastOrder?.code ? Number.parseInt(lastOrder.code.slice(prefix.length), 10) : 0;
  const nextSequence = Number.isFinite(lastSequence) ? lastSequence + 1 : 1;
  return `${prefix}${String(nextSequence).padStart(4, "0")}`;
}

export async function getNextSalesPickListCode(db: CodeDb, now = new Date()) {
  const year = now.getFullYear();
  const prefix = `${SALES_PICK_LIST_PREFIX}-${year}-`;
  const lastPickList = await db.salesInternalOrderPickList.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: "desc" },
    select: { code: true },
  });

  const lastSequence = lastPickList?.code ? Number.parseInt(lastPickList.code.slice(prefix.length), 10) : 0;
  const nextSequence = Number.isFinite(lastSequence) ? lastSequence + 1 : 1;
  return `${prefix}${String(nextSequence).padStart(4, "0")}`;
}

export function summarizeProductionStatus(status: string | null | undefined) {
  if (!status) return "Sin orden de ensamble";
  switch (status) {
    case "BORRADOR":
      return "Orden de ensamble en borrador";
    case "ABIERTA":
      return "Orden de ensamble abierta";
    case "EN_PROCESO":
      return "Orden de ensamble en proceso";
    case "COMPLETADA":
      return "Orden de ensamble completada";
    case "CANCELADA":
      return "Orden de ensamble cancelada";
    default:
      return status;
  }
}

export function summarizePickListStatus(status: string | null | undefined) {
  switch (status) {
    case "DRAFT":
      return "Borrador";
    case "RELEASED":
      return "Liberado";
    case "IN_PROGRESS":
      return "En progreso";
    case "PARTIAL":
      return "Parcial";
    case "COMPLETED":
      return "Completado";
    case "CANCELLED":
      return "Cancelado";
    default:
      return status ?? "Sin surtido";
  }
}

type TakeOrderEligibilityInput = {
  roles: string[];
  status: SalesInternalOrderStatus;
  assignedToUserId?: string | null;
  isCreatedByManager: boolean;
};

export function getTakeOrderEligibility(input: TakeOrderEligibilityInput) {
  if (!input.roles.includes("SALES_EXECUTIVE")) {
    return { canTakeOrder: false, takeBlockedReason: "Solo un ejecutivo de ventas puede tomar el pedido" };
  }

  if (input.status === "CANCELADA") {
    return { canTakeOrder: false, takeBlockedReason: "El pedido está cancelado" };
  }

  if (input.assignedToUserId) {
    return { canTakeOrder: false, takeBlockedReason: "El pedido ya está asignado" };
  }

  if (!input.isCreatedByManager) {
    return { canTakeOrder: false, takeBlockedReason: "Solo se pueden tomar pedidos creados por manager" };
  }

  return { canTakeOrder: true, takeBlockedReason: null };
}

type MarkDeliveredEligibilityInput = {
  status: SalesInternalOrderStatus;
  deliveredToCustomerAt?: Date | string | null;
  assignedToUserId?: string | null;
  pulledAt?: Date | string | null;
  hasCompletedDirectPick: boolean;
  hasCompletedConfiguredAssembly: boolean;
};

export function getMarkDeliveredEligibility(input: MarkDeliveredEligibilityInput) {
  if (input.deliveredToCustomerAt) {
    return { canMarkDelivered: false, deliveredBlockedReason: "El pedido ya fue marcado como entregado" };
  }

  if (input.status !== "CONFIRMADA") {
    return { canMarkDelivered: false, deliveredBlockedReason: "El pedido debe estar confirmado" };
  }

  if (!input.assignedToUserId || !input.pulledAt) {
    return { canMarkDelivered: false, deliveredBlockedReason: "El pedido debe estar tomado y asignado" };
  }

  if (!input.hasCompletedDirectPick) {
    return { canMarkDelivered: false, deliveredBlockedReason: "El surtido directo debe estar completado" };
  }

  if (!input.hasCompletedConfiguredAssembly) {
    return { canMarkDelivered: false, deliveredBlockedReason: "Todas las órdenes de ensamble ligadas deben estar completadas" };
  }

  return { canMarkDelivered: true, deliveredBlockedReason: null };
}

type FlowStageInput = {
  status: SalesInternalOrderStatus;
  assignedToUserId?: string | null;
  deliveredToCustomerAt?: Date | string | null;
  latestPickStatus?: string | null;
  hasProductLines?: boolean;
  hasAssemblyLines?: boolean;
  hasCompletedConfiguredAssembly?: boolean;
};

export function getSalesOrderFlowStage(input: FlowStageInput): SalesOrderFlowStage {
  if (input.status === "CANCELADA") return "cancelado";
  if (input.deliveredToCustomerAt) return "entregado";
  if (input.status === "BORRADOR") return "captura";
  if (!input.assignedToUserId) return "por_asignar";

  const hasProductLines = input.hasProductLines ?? true;
  const hasAssemblyLines = input.hasAssemblyLines ?? false;
  const directPickCompleted = !hasProductLines || input.latestPickStatus === "COMPLETED";
  const assemblyCompleted = !hasAssemblyLines || input.hasCompletedConfiguredAssembly === true;

  if (directPickCompleted && assemblyCompleted) return "listo_entrega";
  return "en_surtido";
}

export type SalesOrderRecommendedAction = {
  label: "Tomar pedido" | "Operar surtido" | "Completar ensamble" | "Marcar entrega" | "Revisar bloqueo";
  href: string;
  blockedReason?: string;
};

type SalesOrderFlowNarrativeInput = {
  orderId: string;
  status: SalesInternalOrderStatus;
  assignedToUserId?: string | null;
  deliveredToCustomerAt?: Date | string | null;
  pulledAt?: Date | string | null;
  latestPickStatus?: string | null;
  hasProductLines?: boolean;
  hasAssemblyLines?: boolean;
  hasCompletedConfiguredAssembly?: boolean;
  takeEligibility?: ReturnType<typeof getTakeOrderEligibility>;
  deliveredEligibility?: ReturnType<typeof getMarkDeliveredEligibility>;
};

export type SalesOrderFlowNarrative = {
  flowStage: SalesOrderFlowStage;
  flowStageLabel: string;
  flowBadgeVariant: SalesOrderFlowBadgeVariant;
  riskLevel: FlowRiskLevel;
  riskLabel: string;
  nextRecommendedAction: SalesOrderRecommendedAction;
};

export function getSalesOrderFlowNarrative(input: SalesOrderFlowNarrativeInput): SalesOrderFlowNarrative {
  const flowStage = getSalesOrderFlowStage({
    status: input.status,
    assignedToUserId: input.assignedToUserId,
    deliveredToCustomerAt: input.deliveredToCustomerAt,
    latestPickStatus: input.latestPickStatus,
    hasProductLines: input.hasProductLines,
    hasAssemblyLines: input.hasAssemblyLines,
    hasCompletedConfiguredAssembly: input.hasCompletedConfiguredAssembly,
  });

  let riskLevel: FlowRiskLevel = "BAJO";
  if (flowStage === "por_asignar") riskLevel = "MEDIO";
  if (flowStage === "en_surtido") riskLevel = "ALTO";

  let nextRecommendedAction: SalesOrderRecommendedAction = {
    label: "Revisar bloqueo",
    href: `/production/requests/${input.orderId}`,
  };

  if (flowStage === "por_asignar") {
    if (input.takeEligibility?.canTakeOrder) {
      nextRecommendedAction = { label: "Tomar pedido", href: `/production/requests/${input.orderId}` };
    } else {
      nextRecommendedAction = {
        label: "Revisar bloqueo",
        href: `/production/requests/${input.orderId}`,
        blockedReason: input.takeEligibility?.takeBlockedReason ?? "Pedido pendiente de asignación",
      };
    }
  } else if (flowStage === "en_surtido") {
    const needsAssembly = Boolean(input.hasAssemblyLines && !input.hasCompletedConfiguredAssembly);
    const needsDirectPick = Boolean(input.hasProductLines && input.latestPickStatus !== "COMPLETED");
    if (needsAssembly) {
      nextRecommendedAction = { label: "Completar ensamble", href: `/production/requests/${input.orderId}` };
    } else if (needsDirectPick) {
      nextRecommendedAction = { label: "Operar surtido", href: `/production/fulfillment/${input.orderId}` };
    } else {
      nextRecommendedAction = { label: "Revisar bloqueo", href: `/production/requests/${input.orderId}` };
    }
  } else if (flowStage === "listo_entrega") {
    if (input.deliveredEligibility?.canMarkDelivered) {
      nextRecommendedAction = { label: "Marcar entrega", href: `/production/requests/${input.orderId}` };
    } else {
      nextRecommendedAction = {
        label: "Revisar bloqueo",
        href: `/production/requests/${input.orderId}`,
        blockedReason: input.deliveredEligibility?.deliveredBlockedReason ?? "Revisar estado operativo del pedido",
      };
    }
  }

  return {
    flowStage,
    flowStageLabel: SALES_ORDER_FLOW_STAGE_LABELS[flowStage],
    flowBadgeVariant: SALES_ORDER_FLOW_STAGE_BADGE_VARIANTS[flowStage],
    riskLevel,
    riskLabel: FLOW_RISK_LEVEL_LABELS[riskLevel],
    nextRecommendedAction,
  };
}
