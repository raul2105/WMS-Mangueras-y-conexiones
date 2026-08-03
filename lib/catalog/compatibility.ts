export type CompatibilityRuleRecord = {
  productId: string;
  compatibleProductId: string;
  ruleType: string;
  description: string;
  severity: string;
};

export type CompatibilityDecision = {
  status: "allowed" | "review" | "blocked";
  matchedRules: CompatibilityRuleRecord[];
};

function isPair(rule: CompatibilityRuleRecord, productIds: Set<string>) {
  return productIds.has(rule.productId) && productIds.has(rule.compatibleProductId) && rule.productId !== rule.compatibleProductId;
}

/**
 * Evaluates only explicit, active rules. A BLOCK rule is a hard stop; a WARN
 * rule remains visible as review-required without silently becoming a block.
 */
export function evaluateCompatibilityRules(
  productIds: string[],
  rules: CompatibilityRuleRecord[],
): CompatibilityDecision {
  const uniqueProductIds = new Set(productIds);
  const matchedRules = rules.filter((rule) => isPair(rule, uniqueProductIds));
  if (matchedRules.some((rule) => rule.severity.toUpperCase() === "BLOCK")) {
    return { status: "blocked", matchedRules };
  }
  if (matchedRules.length > 0) {
    return { status: "review", matchedRules };
  }
  return { status: "allowed", matchedRules: [] };
}

type CompatibilityDb = {
  productCompatibilityRule: {
    findMany: (args: {
      where: {
        active: boolean;
        productId: { in: string[] };
        compatibleProductId: { in: string[] };
      };
      select: {
        productId: true;
        compatibleProductId: true;
        ruleType: true;
        description: true;
        severity: true;
      };
    }) => Promise<CompatibilityRuleRecord[]>;
  };
};

export async function getAssemblyCompatibilityDecision(
  db: CompatibilityDb,
  productIds: string[],
) {
  const uniqueProductIds = Array.from(new Set(productIds));
  if (uniqueProductIds.length < 2) {
    return { status: "allowed" as const, matchedRules: [] as CompatibilityRuleRecord[] };
  }

  const rules = await db.productCompatibilityRule.findMany({
    where: {
      active: true,
      productId: { in: uniqueProductIds },
      compatibleProductId: { in: uniqueProductIds },
    },
    select: {
      productId: true,
      compatibleProductId: true,
      ruleType: true,
      description: true,
      severity: true,
    },
  });
  return evaluateCompatibilityRules(uniqueProductIds, rules);
}
