export type OperationalPresetId =
  | "URGENTES"
  | "VENCEN_HOY"
  | "SIN_ASIGNAR"
  | "SIN_MOVIMIENTO"
  | "BLOQUEADOS"
  | "LISTOS_PARA_ENTREGA";

export type OperationalPresetReasonCode =
  | "OVERDUE"
  | "DUE_TODAY"
  | "UNASSIGNED"
  | "STALE"
  | "PARTIAL_PICK"
  | "ASSEMBLY_PENDING"
  | "UNRELEASED"
  | "READY_FOR_DELIVERY";

export type OperationalPresetReason = {
  code: OperationalPresetReasonCode;
  message: string;
  evidence: Record<string, unknown>;
};

export type OperationalPresetFacts = {
  dueDate?: string | Date | null;
  assignedToUserId?: string | null;
  flowStage?: string | null;
  isPartial?: boolean;
  isUnreleased?: boolean;
  assemblyBlocked?: boolean;
  canMarkDelivered?: boolean;
  isStale?: boolean;
  lastOperationalUpdateAt?: string | Date | null;
  staleHours?: number;
  timezone?: string;
};

export type OperationalPresetEvaluation = {
  primaryPreset: OperationalPresetId | null;
  secondaryPresets: OperationalPresetId[];
  reasons: OperationalPresetReason[];
  facts: OperationalPresetFacts;
};

export type OperationalPresetFilter = "urgentes" | "vencen_hoy" | "sin_asignar" | "sin_movimiento" | "bloqueados" | "listos_para_entrega";

export type EvaluateOperationalPresetsInput = {
  dueDate: Date | null;
  assignedToUserId: string | null;
  flowStage: string | null;
  isPartial: boolean;
  isUnreleased: boolean;
  assemblyBlocked: boolean;
  canMarkDelivered: boolean;
  isStale: boolean;
  lastOperationalUpdateAt: Date | null;
  inActiveQueue?: boolean;
};

type EvaluateOperationalPresetsOptions = {
  now?: Date;
  timezone?: string;
  staleHours?: number;
};

const DEFAULT_TIMEZONE = "America/Mexico_City";
const DEFAULT_STALE_HOURS = 4;

const FILTER_TO_PRESET: Record<OperationalPresetFilter, OperationalPresetId> = {
  urgentes: "URGENTES",
  vencen_hoy: "VENCEN_HOY",
  sin_asignar: "SIN_ASIGNAR",
  sin_movimiento: "SIN_MOVIMIENTO",
  bloqueados: "BLOQUEADOS",
  listos_para_entrega: "LISTOS_PARA_ENTREGA",
};

const PRESET_LABELS: Record<OperationalPresetId, string> = {
  URGENTES: "Urgentes",
  VENCEN_HOY: "Vencen hoy",
  SIN_ASIGNAR: "Sin asignar",
  SIN_MOVIMIENTO: "Sin movimiento",
  BLOQUEADOS: "Bloqueados",
  LISTOS_PARA_ENTREGA: "Listos para entrega",
};

const PRESET_PRECEDENCE: OperationalPresetId[] = [
  "BLOQUEADOS",
  "URGENTES",
  "SIN_MOVIMIENTO",
  "VENCEN_HOY",
  "SIN_ASIGNAR",
  "LISTOS_PARA_ENTREGA",
];

function toTimezoneDateKey(value: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(value);
}

function isDueToday(dueDate: Date | null, now: Date, timezone: string) {
  if (!dueDate) return false;
  return toTimezoneDateKey(dueDate, timezone) === toTimezoneDateKey(now, timezone);
}

function isOverdue(dueDate: Date | null, now: Date, timezone: string) {
  if (!dueDate) return false;
  return toTimezoneDateKey(dueDate, timezone) < toTimezoneDateKey(now, timezone);
}

function toEvidence(input: EvaluateOperationalPresetsInput, facts: OperationalPresetFacts) {
  return {
    dueDate: facts.dueDate ?? null,
    isPartial: input.isPartial,
    isUnreleased: input.isUnreleased,
    assemblyBlocked: input.assemblyBlocked,
    flowStage: input.flowStage,
    canMarkDelivered: input.canMarkDelivered,
    isStale: input.isStale,
    lastOperationalUpdateAt: facts.lastOperationalUpdateAt ?? null,
  };
}

export function evaluateOperationalPresets(
  input: EvaluateOperationalPresetsInput,
  options: EvaluateOperationalPresetsOptions = {},
): OperationalPresetEvaluation {
  const now = options.now ?? new Date();
  const timezone = options.timezone ?? DEFAULT_TIMEZONE;
  const staleHours = options.staleHours ?? DEFAULT_STALE_HOURS;
  const activeQueue = input.inActiveQueue ?? true;
  const dueToday = isDueToday(input.dueDate, now, timezone);
  const overdue = isOverdue(input.dueDate, now, timezone);

  const flags: Record<OperationalPresetId, boolean> = {
    BLOQUEADOS: input.isPartial || input.assemblyBlocked || input.isUnreleased,
    URGENTES: overdue || (dueToday && (input.isUnreleased || input.isPartial || input.assemblyBlocked)),
    SIN_MOVIMIENTO: input.isStale,
    VENCEN_HOY: dueToday && !(overdue || (dueToday && (input.isUnreleased || input.isPartial || input.assemblyBlocked))),
    SIN_ASIGNAR: activeQueue && !input.assignedToUserId,
    LISTOS_PARA_ENTREGA: input.flowStage === "listo_entrega" && input.canMarkDelivered,
  };

  const facts: OperationalPresetFacts = {
    dueDate: input.dueDate,
    assignedToUserId: input.assignedToUserId,
    flowStage: input.flowStage,
    isPartial: input.isPartial,
    isUnreleased: input.isUnreleased,
    assemblyBlocked: input.assemblyBlocked,
    canMarkDelivered: input.canMarkDelivered,
    isStale: input.isStale,
    lastOperationalUpdateAt: input.lastOperationalUpdateAt,
    staleHours,
    timezone,
  };

  const commonEvidence = toEvidence(input, facts);
  const reasonsByCode = new Map<OperationalPresetReasonCode, OperationalPresetReason>();
  const addReason = (code: OperationalPresetReasonCode, message: string, evidence: Record<string, unknown>) => {
    if (!reasonsByCode.has(code)) reasonsByCode.set(code, { code, message, evidence });
  };

  if (overdue) addReason("OVERDUE", "Pedido vencido respecto al día operativo.", commonEvidence);
  if (dueToday) addReason("DUE_TODAY", "Pedido con vencimiento en el día operativo actual.", commonEvidence);
  if (!input.assignedToUserId && activeQueue) addReason("UNASSIGNED", "Pedido sin responsable asignado en cola activa.", commonEvidence);
  if (input.isStale) addReason("STALE", "Pedido sin movimiento operativo sobre el umbral configurado.", commonEvidence);
  if (input.isPartial) addReason("PARTIAL_PICK", "Pedido con surtido parcial pendiente de destrabe.", commonEvidence);
  if (input.assemblyBlocked) addReason("ASSEMBLY_PENDING", "Pedido con ensamble ligado pendiente.", commonEvidence);
  if (input.isUnreleased) addReason("UNRELEASED", "Pedido sin liberación de surtido directo.", commonEvidence);
  if (input.flowStage === "listo_entrega" && input.canMarkDelivered) {
    addReason("READY_FOR_DELIVERY", "Pedido listo para entrega y habilitado para marcar entrega.", commonEvidence);
  }

  const matching = PRESET_PRECEDENCE.filter((preset) => flags[preset]);
  const primaryPreset = matching[0] ?? null;
  const secondaryPresets = primaryPreset ? matching.filter((preset) => preset !== primaryPreset) : matching;

  return {
    primaryPreset,
    secondaryPresets,
    reasons: Array.from(reasonsByCode.values()),
    facts,
  };
}

export function isOperationalPresetFilter(value: string | undefined): value is OperationalPresetFilter {
  return value === "urgentes"
    || value === "vencen_hoy"
    || value === "sin_asignar"
    || value === "sin_movimiento"
    || value === "bloqueados"
    || value === "listos_para_entrega";
}

export function matchOperationalPreset(
  evaluation: OperationalPresetEvaluation,
  presetFilter: OperationalPresetFilter,
  mode: "primary" | "secondaryOrPrimary" = "primary",
) {
  const target = FILTER_TO_PRESET[presetFilter];
  if (mode === "primary") return evaluation.primaryPreset === target;
  return evaluation.primaryPreset === target || evaluation.secondaryPresets.includes(target);
}

export function getOperationalPresetLabel(id: OperationalPresetId) {
  return PRESET_LABELS[id];
}
