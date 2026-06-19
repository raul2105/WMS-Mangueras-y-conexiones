import type {
  SalesOrderFlowNarrative,
  SalesOrderFlowStage,
  SalesOrderPrimaryCtaCode,
} from "@/lib/sales/internal-orders";
import {
  SALES_ORDER_FLOW_STAGE_LABELS,
  summarizePickListStatus,
} from "@/lib/sales/internal-orders";

export const SALES_CONSOLE_STAGE_FLOW: SalesOrderFlowStage[] = [
  "captura",
  "por_asignar",
  "en_surtido",
  "listo_entrega",
  "entregado",
  "cancelado",
];

export type SalesConsoleWorkTypeVariant = "neutral" | "accent" | "warning" | "success" | "danger";

export type SalesConsoleWorkType = {
  label: string;
  detail: string;
  variant: SalesConsoleWorkTypeVariant;
};

export type SalesConsoleStageProgressItem = {
  stage: SalesOrderFlowStage;
  label: string;
  step: number;
  variant: SalesConsoleWorkTypeVariant;
  isCurrent: boolean;
};

export type SalesConsolePrimaryActionState = {
  state: "allowed" | "blocked" | "informational";
  label: string;
  reason: string;
  blockedReason?: string;
  href: string;
  code: SalesOrderPrimaryCtaCode;
  requiresFormSubmit: boolean;
};

export type SalesConsoleTimelineStage =
  | "captura"
  | "asignacion"
  | "surtido"
  | "entrega"
  | "cancelacion";

export type SalesConsoleTimelineItem = {
  stage: SalesConsoleTimelineStage;
  label: string;
  detail: string;
  at: Date | string | null;
  variant: SalesConsoleWorkTypeVariant;
};

export function getSalesConsoleWorkType(input: {
  flowStage: SalesOrderFlowStage;
  hasProductLines: boolean;
  hasAssemblyLines: boolean;
}): SalesConsoleWorkType {
  switch (input.flowStage) {
    case "captura":
      return input.hasProductLines || input.hasAssemblyLines
        ? {
            label: "En captura",
            detail: "Pedido en borrador con líneas comerciales abiertas.",
            variant: "accent",
          }
        : {
            label: "Captura sin líneas",
            detail: "Aún no tiene productos ni ensambles para confirmar.",
            variant: "warning",
          };
    case "por_asignar":
      return {
        label: "Por asignar",
        detail: "Pedido confirmado sin responsable asignado.",
        variant: "warning",
      };
    case "en_surtido":
      return {
        label: "En surtido",
        detail: "Asignado a almacén, surtido en proceso.",
        variant: "success",
      };
    case "listo_entrega":
      return {
        label: "Listo para entregar",
        detail: "Surtido y ensambles completados, pendiente entrega.",
        variant: "success",
      };
    case "entregado":
      return {
        label: "Entregado",
        detail: "Pedido entregado al cliente y cerrado.",
        variant: "neutral",
      };
    case "cancelado":
      return {
        label: "Cancelado",
        detail: "Pedido cancelado, sin acción operativa.",
        variant: "danger",
      };
  }
}

export function getSalesConsoleStageProgress(currentStage: SalesOrderFlowStage): SalesConsoleStageProgressItem[] {
  const currentIndex = SALES_CONSOLE_STAGE_FLOW.indexOf(currentStage);
  return SALES_CONSOLE_STAGE_FLOW.map((stage, index) => ({
    stage,
    label: SALES_ORDER_FLOW_STAGE_LABELS[stage],
    step: index + 1,
    variant:
      stage === currentStage
        ? currentStage === "cancelado"
          ? "danger"
          : currentStage === "captura"
            ? "accent"
            : currentStage === "por_asignar"
              ? "warning"
              : currentStage === "en_surtido"
                ? "warning"
                : "success"
        : currentIndex >= 0 && index < currentIndex && currentStage !== "cancelado"
          ? "success"
          : "neutral",
    isCurrent: stage === currentStage,
  }));
}

export function getSalesConsoleTimelineItems(input: {
  createdAt: Date | string;
  confirmedAt?: Date | string | null;
  assignedAt?: Date | string | null;
  pulledAt?: Date | string | null;
  latestPickStatus?: string | null;
  latestPickUpdatedAt?: Date | string | null;
  deliveredAt?: Date | string | null;
  cancelledAt?: Date | string | null;
}): SalesConsoleTimelineItem[] {
  const assignmentAt = input.assignedAt ?? input.confirmedAt ?? input.pulledAt ?? null;
  const fulfillmentAt = input.latestPickUpdatedAt ?? input.pulledAt ?? null;
  const fulfillmentDetail = input.latestPickStatus
    ? `Surtido directo: ${summarizePickListStatus(input.latestPickStatus)}`
    : "Sin surtido directo registrado";

  return [
    {
      stage: "captura",
      label: "Captura",
      detail: "Pedido registrado en la cola comercial",
      at: input.createdAt,
      variant: "accent",
    },
    {
      stage: "asignacion",
      label: "Asignación",
      detail: input.assignedAt
        ? "Pedido tomado por un responsable"
        : input.confirmedAt
          ? "Pedido confirmado, pendiente de asignación"
          : "Pendiente de confirmación y asignación",
      at: assignmentAt,
      variant: assignmentAt ? "warning" : "neutral",
    },
    {
      stage: "surtido",
      label: "Surtido / fulfillment",
      detail: fulfillmentDetail,
      at: fulfillmentAt,
      variant:
        input.latestPickStatus === "COMPLETED"
          ? "success"
          : input.latestPickStatus
            ? "warning"
            : "neutral",
    },
    {
      stage: "entrega",
      label: "Entrega",
      detail: input.deliveredAt
        ? "Entrega confirmada al cliente"
        : "Pendiente de entrega",
      at: input.deliveredAt ?? null,
      variant: input.deliveredAt ? "success" : "neutral",
    },
    {
      stage: "cancelacion",
      label: "Cancelación",
      detail: input.cancelledAt ? "Pedido cancelado" : "Solo aplica si se cancela",
      at: input.cancelledAt ?? null,
      variant: input.cancelledAt ? "danger" : "neutral",
    },
  ];
}

export function resolveSalesConsolePrimaryActionState(input: {
  flowNarrative: SalesOrderFlowNarrative;
  canExecuteSalesActions: boolean;
  canExecuteProductionActions: boolean;
}): SalesConsolePrimaryActionState {
  const { primaryCta } = input.flowNarrative;

  if (primaryCta.code === "REVIEW_BLOCK") {
    return {
      state: "informational",
      label: primaryCta.action.label,
      reason: primaryCta.reason,
      blockedReason: primaryCta.blockedReason,
      href: primaryCta.action.href,
      code: primaryCta.code,
      requiresFormSubmit: false,
    };
  }

  const needsSalesWrite = primaryCta.code === "TAKE_ORDER" || primaryCta.code === "MARK_DELIVERED";
  const canExecute = needsSalesWrite ? input.canExecuteSalesActions : input.canExecuteProductionActions;

  if (primaryCta.isAllowed && canExecute) {
    return {
      state: "allowed",
      label: primaryCta.action.label,
      reason: primaryCta.reason,
      href: primaryCta.action.href,
      code: primaryCta.code,
      requiresFormSubmit: primaryCta.code === "TAKE_ORDER",
    };
  }

  const fallbackReason = needsSalesWrite
    ? "Sin permisos de escritura para ejecutar esta accion"
    : "Sin permisos operativos para ejecutar esta accion";

  return {
    state: "blocked",
    label: primaryCta.action.label,
    reason: primaryCta.reason,
    blockedReason: primaryCta.blockedReason ?? fallbackReason,
    href: primaryCta.action.href,
    code: primaryCta.code,
    requiresFormSubmit: false,
  };
}
