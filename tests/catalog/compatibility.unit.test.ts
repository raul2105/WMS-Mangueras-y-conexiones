import { describe, expect, it } from "vitest";
import { evaluateCompatibilityRules } from "@/lib/catalog/compatibility";

describe("technical compatibility contract", () => {
  const baseRule = {
    productId: "entry",
    compatibleProductId: "hose",
    ruleType: "THREAD_MISMATCH",
    description: "La rosca no corresponde",
    severity: "BLOCK",
  };

  it("blocks a configured combination when an explicit block rule matches", () => {
    const result = evaluateCompatibilityRules(["entry", "hose", "exit"], [baseRule]);

    expect(result.status).toBe("blocked");
    expect(result.matchedRules).toHaveLength(1);
  });

  it("keeps warnings visible as review instead of silently treating them as safe", () => {
    const result = evaluateCompatibilityRules(["entry", "hose"], [{ ...baseRule, severity: "WARN" }]);

    expect(result.status).toBe("review");
  });

  it("allows combinations with no explicit rule", () => {
    expect(evaluateCompatibilityRules(["entry", "hose"], []).status).toBe("allowed");
  });
});
