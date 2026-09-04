export type CompatibilityRuleDecision = "APPROVED" | "BLOCKED" | "REQUIRES_REVIEW";

export type CompatibilityRuleRecord = {
  productId: string;
  compatibleProductId: string;
  ruleType: string;
  description: string;
  severity: string;
  decision?: string | null;
  governanceStatus?: string | null;
  ruleRevision?: number | null;
  validFrom?: Date | string | null;
  validTo?: Date | string | null;
  maxWorkingPressureBar?: unknown;
  minTemperatureC?: unknown;
  maxTemperatureC?: unknown;
  medium?: string | null;
  application?: string | null;
  assemblyMethod?: string | null;
  source?: {
    supplierName: string;
    documentRef: string;
    documentVersion: string | null;
    sourceUrl?: string | null;
    status: string;
  } | null;
};

export type CompatibilityEvaluationContext = {
  evaluatedAt?: Date;
  workingPressureBar?: number | null;
  operatingTemperatureC?: number | null;
  medium?: string | null;
  application?: string | null;
  assemblyMethod?: string | null;
};

export type CompatibilityDecision = {
  status: CompatibilityRuleDecision;
  reasonCode:
    | "SINGLE_COMPONENT"
    | "APPROVED_RULE_SET"
    | "NO_APPROVED_RULE"
    | "INCOMPLETE_RULE_SET"
    | "RULE_REQUIRES_REVIEW"
    | "RULE_BLOCKED"
    | "OUTSIDE_APPROVED_LIMITS"
    | "MISSING_OPERATING_CONTEXT";
  explanation: string;
  matchedRules: CompatibilityRuleRecord[];
  missingProductIds: string[];
  reviewOverrideAllowed: boolean;
};

function isPair(rule: CompatibilityRuleRecord, productIds: Set<string>) {
  return productIds.has(rule.productId) && productIds.has(rule.compatibleProductId) && rule.productId !== rule.compatibleProductId;
}

function asNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizedText(value: string | null | undefined) {
  return value?.trim().toLocaleUpperCase("es-MX") || null;
}

function normalizeDecision(rule: CompatibilityRuleRecord): CompatibilityRuleDecision {
  const explicit = rule.decision?.toUpperCase();
  if (explicit === "APPROVED" || explicit === "BLOCKED" || explicit === "REQUIRES_REVIEW") return explicit;
  return rule.severity.toUpperCase() === "BLOCK" ? "BLOCKED" : "REQUIRES_REVIEW";
}

function isRuleCurrent(rule: CompatibilityRuleRecord, evaluatedAt: Date) {
  if (rule.governanceStatus?.toUpperCase() === "RETIRED") return false;
  const validFrom = rule.validFrom ? new Date(rule.validFrom) : null;
  const validTo = rule.validTo ? new Date(rule.validTo) : null;
  if (validFrom && !Number.isNaN(validFrom.getTime()) && validFrom > evaluatedAt) return false;
  if (validTo && !Number.isNaN(validTo.getTime()) && validTo < evaluatedAt) return false;
  return true;
}

function inspectApprovedLimits(rule: CompatibilityRuleRecord, context: CompatibilityEvaluationContext) {
  const missing: string[] = [];
  const violations: string[] = [];
  const maxPressure = asNumber(rule.maxWorkingPressureBar);
  const minTemperature = asNumber(rule.minTemperatureC);
  const maxTemperature = asNumber(rule.maxTemperatureC);

  if (maxPressure !== null) {
    if (context.workingPressureBar === null || context.workingPressureBar === undefined) missing.push("presión de trabajo");
    else if (context.workingPressureBar > maxPressure) violations.push(`presión ${context.workingPressureBar} bar > ${maxPressure} bar`);
  }
  if (minTemperature !== null || maxTemperature !== null) {
    if (context.operatingTemperatureC === null || context.operatingTemperatureC === undefined) missing.push("temperatura de operación");
    else {
      if (minTemperature !== null && context.operatingTemperatureC < minTemperature) violations.push(`temperatura ${context.operatingTemperatureC} °C < ${minTemperature} °C`);
      if (maxTemperature !== null && context.operatingTemperatureC > maxTemperature) violations.push(`temperatura ${context.operatingTemperatureC} °C > ${maxTemperature} °C`);
    }
  }

  for (const [label, expected, actual] of [
    ["medio", rule.medium, context.medium],
    ["aplicación", rule.application, context.application],
    ["método de ensamble", rule.assemblyMethod, context.assemblyMethod],
  ] as const) {
    if (!expected) continue;
    if (!actual) missing.push(label);
    else if (normalizedText(expected) !== normalizedText(actual)) violations.push(`${label} fuera de la regla aprobada`);
  }

  return { missing, violations };
}

function getCoveredProducts(productIds: string[], approvedRules: CompatibilityRuleRecord[]) {
  const adjacency = new Map<string, Set<string>>(productIds.map((id) => [id, new Set<string>()]));
  for (const rule of approvedRules) {
    adjacency.get(rule.productId)?.add(rule.compatibleProductId);
    adjacency.get(rule.compatibleProductId)?.add(rule.productId);
  }
  const first = productIds[0];
  const visited = new Set<string>(first ? [first] : []);
  const queue = first ? [first] : [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of adjacency.get(current) ?? []) {
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return visited;
}

/** Only a current, governed and complete APPROVED rule set can authorize a combination. */
export function evaluateCompatibilityRules(
  productIds: string[],
  rules: CompatibilityRuleRecord[],
  context: CompatibilityEvaluationContext = {},
): CompatibilityDecision {
  const uniqueProductIds = Array.from(new Set(productIds.filter(Boolean)));
  if (uniqueProductIds.length < 2) {
    return {
      status: "APPROVED", reasonCode: "SINGLE_COMPONENT",
      explanation: "No se requiere una regla de compatibilidad para un solo componente.",
      matchedRules: [], missingProductIds: [], reviewOverrideAllowed: false,
    };
  }

  const evaluatedAt = context.evaluatedAt ?? new Date();
  const productIdSet = new Set(uniqueProductIds);
  const currentRules = rules
    .filter((rule) => isPair(rule, productIdSet))
    .filter((rule) => isRuleCurrent(rule, evaluatedAt));
  const blockedRules = currentRules.filter((rule) => normalizeDecision(rule) === "BLOCKED");
  if (blockedRules.length > 0) {
    return {
      status: "BLOCKED", reasonCode: "RULE_BLOCKED",
      explanation: blockedRules.map((rule) => rule.description).filter(Boolean).join("; ") || "Existe una regla técnica de bloqueo.",
      matchedRules: blockedRules, missingProductIds: [], reviewOverrideAllowed: false,
    };
  }

  const reviewRules = currentRules.filter((rule) => normalizeDecision(rule) === "REQUIRES_REVIEW");
  const approvedRules = currentRules.filter((rule) =>
    normalizeDecision(rule) === "APPROVED" && rule.governanceStatus?.toUpperCase() === "APPROVED"
  );
  const limitChecks = approvedRules.map((rule) => inspectApprovedLimits(rule, context));
  const violations = limitChecks.flatMap((result) => result.violations);
  if (violations.length > 0) {
    return {
      status: "BLOCKED", reasonCode: "OUTSIDE_APPROVED_LIMITS", explanation: violations.join("; "),
      matchedRules: approvedRules, missingProductIds: [], reviewOverrideAllowed: false,
    };
  }

  const missingContext = limitChecks.flatMap((result) => result.missing);
  if (missingContext.length > 0) {
    return {
      status: "REQUIRES_REVIEW", reasonCode: "MISSING_OPERATING_CONTEXT",
      explanation: `Falta capturar ${Array.from(new Set(missingContext)).join(", ")} para validar los límites técnicos.`,
      matchedRules: approvedRules, missingProductIds: [], reviewOverrideAllowed: false,
    };
  }

  if (reviewRules.length > 0) {
    return {
      status: "REQUIRES_REVIEW", reasonCode: "RULE_REQUIRES_REVIEW",
      explanation: reviewRules.map((rule) => rule.description).filter(Boolean).join("; ") || "Una regla vigente requiere revisión técnica.",
      matchedRules: reviewRules, missingProductIds: [], reviewOverrideAllowed: true,
    };
  }

  if (approvedRules.length === 0) {
    return {
      status: "REQUIRES_REVIEW", reasonCode: "NO_APPROVED_RULE",
      explanation: "No existe una regla técnica aprobada y vigente para esta combinación.",
      matchedRules: currentRules, missingProductIds: uniqueProductIds, reviewOverrideAllowed: false,
    };
  }

  const covered = getCoveredProducts(uniqueProductIds, approvedRules);
  const missingProductIds = uniqueProductIds.filter((id) => !covered.has(id));
  if (missingProductIds.length > 0) {
    return {
      status: "REQUIRES_REVIEW", reasonCode: "INCOMPLETE_RULE_SET",
      explanation: "Las reglas aprobadas no cubren todos los componentes de la combinación.",
      matchedRules: approvedRules, missingProductIds, reviewOverrideAllowed: false,
    };
  }

  return {
    status: "APPROVED", reasonCode: "APPROVED_RULE_SET",
    explanation: "La combinación está respaldada por reglas técnicas aprobadas y vigentes.",
    matchedRules: approvedRules, missingProductIds: [], reviewOverrideAllowed: false,
  };
}

type CompatibilityDb = { productCompatibilityRule: unknown };

export const compatibilityRuleSelect = {
  productId: true, compatibleProductId: true, ruleType: true, description: true, severity: true,
  decision: true, governanceStatus: true, ruleRevision: true, validFrom: true, validTo: true,
  maxWorkingPressureBar: true, minTemperatureC: true, maxTemperatureC: true,
  medium: true, application: true, assemblyMethod: true,
  source: { select: { supplierName: true, documentRef: true, documentVersion: true, sourceUrl: true, status: true } },
} as const;

export async function getAssemblyCompatibilityDecision(
  db: CompatibilityDb,
  productIds: string[],
  context: CompatibilityEvaluationContext = {},
) {
  const uniqueProductIds = Array.from(new Set(productIds.filter(Boolean)));
  if (uniqueProductIds.length < 2) return evaluateCompatibilityRules(uniqueProductIds, [], context);
  const ruleRepository = db.productCompatibilityRule as {
    findMany: (args: { where: Record<string, unknown>; select: Record<string, unknown> }) => PromiseLike<CompatibilityRuleRecord[]>;
  };
  const rules = await ruleRepository.findMany({
    where: {
      active: true,
      productId: { in: uniqueProductIds },
      compatibleProductId: { in: uniqueProductIds },
      source: { status: "APPROVED" },
    },
    select: compatibilityRuleSelect,
  });
  return evaluateCompatibilityRules(uniqueProductIds, rules, context);
}
