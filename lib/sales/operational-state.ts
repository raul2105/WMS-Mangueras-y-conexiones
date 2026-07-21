import type { FulfillmentBlockingCause, QueueSignals } from "@/lib/dashboard/fulfillment-dashboard";

export type OperationalUxStateKey =
  | "ready_to_pick"
  | "in_progress"
  | "blocked"
  | "verify"
  | "ready_to_deliver"
  | "attention"
  | "delivered"
  | "cancelled"
  | "capture";

export type OperationalUxStateVariant = "neutral" | "accent" | "warning" | "success" | "danger";

export type OperationalUxState = {
  key: OperationalUxStateKey;
  label: string;
  description: string;
  nextAction: string;
  variant: OperationalUxStateVariant;
};

const BLOCKING_STATE: Record<Exclude<FulfillmentBlockingCause, "NONE">, OperationalUxState> = {
  OVERDUE_UNRELEASED: {
    key: "blocked",
    label: "Bloqueado",
    description: "Pedido vencido sin liberación de surtido.",
    nextAction: "Liberar o reasignar surtido",
    variant: "danger",
  },
  DUE_TODAY_UNRELEASED: {
    key: "attention",
    label: "Por surtir",
    description: "Vence hoy y aún no tiene surtido liberado.",
    nextAction: "Liberar surtido",
    variant: "warning",
  },
  STALE_PICK: {
    key: "blocked",
    label: "Bloqueado",
    description: "El surtido activo no registra movimiento reciente.",
    nextAction: "Revisar actividad",
    variant: "danger",
  },
  PICK_PARTIAL: {
    key: "verify",
    label: "Verificar",
    description: "El surtido quedó parcial y requiere resolver el faltante.",
    nextAction: "Resolver faltante",
    variant: "warning",
  },
  ASSEMBLY_PENDING: {
    key: "in_progress",
    label: "En proceso",
    description: "El pedido tiene un ensamble ligado pendiente.",
    nextAction: "Completar ensamble",
    variant: "accent",
  },
  UNASSIGNED: {
    key: "ready_to_pick",
    label: "Por surtir",
    description: "Pedido confirmado sin responsable operativo.",
    nextAction: "Tomar o asignar tarea",
    variant: "accent",
  },
};

export function getOperationalUxState(signals: Pick<QueueSignals, "blockingCause" | "isPartial" | "assemblyBlocked" | "isUnreleased"> & { latestPickStatus?: string | null; canMarkDelivered?: boolean; isDelivered?: boolean; isCancelled?: boolean; hasLines?: boolean }): OperationalUxState {
  if (signals.isDelivered) {
    return { key: "delivered", label: "Entregado", description: "Pedido finalizado; consulta el historial si necesitas comprobarlo.", nextAction: "Ver historial", variant: "success" };
  }
  if (signals.isCancelled) {
    return { key: "cancelled", label: "Cancelado", description: "Pedido cerrado sin operación pendiente.", nextAction: "Ver historial", variant: "danger" };
  }
  if (signals.hasLines === false) {
    return { key: "capture", label: "Completar pedido", description: "Agrega un producto o ensamble antes de confirmar.", nextAction: "Agregar productos", variant: "neutral" };
  }
  if (signals.canMarkDelivered) {
    return {
      key: "ready_to_deliver",
      label: "Listo para entrega",
      description: "Surtido y ensamble cumplen las condiciones de entrega.",
      nextAction: "Verificar y registrar entrega",
      variant: "success",
    };
  }

  if (signals.blockingCause !== "NONE") {
    return BLOCKING_STATE[signals.blockingCause];
  }

  if (signals.isPartial) {
    return BLOCKING_STATE.PICK_PARTIAL;
  }

  if (signals.assemblyBlocked) {
    return BLOCKING_STATE.ASSEMBLY_PENDING;
  }

  if (signals.latestPickStatus === "IN_PROGRESS" || signals.latestPickStatus === "RELEASED") {
    return {
      key: "in_progress",
      label: "En proceso",
      description: "El surtido está activo.",
      nextAction: "Continuar surtido",
      variant: "accent",
    };
  }

  if (signals.isUnreleased || !signals.latestPickStatus) {
    return {
      key: "ready_to_pick",
      label: "Por surtir",
      description: "El pedido está listo para iniciar la ejecución física.",
      nextAction: "Liberar o tomar surtido",
      variant: "accent",
    };
  }

  return {
    key: "verify",
    label: "Verificar",
    description: "Revisar el resultado del movimiento antes de avanzar.",
    nextAction: "Verificar pedido",
    variant: "warning",
  };
}

export function getOperationalStateForBlockingCause(cause: FulfillmentBlockingCause): OperationalUxState {
  if (cause === "NONE") {
    return {
      key: "ready_to_pick",
      label: "Por surtir",
      description: "Sin bloqueo crítico registrado.",
      nextAction: "Revisar siguiente tarea",
      variant: "accent",
    };
  }
  return BLOCKING_STATE[cause];
}
