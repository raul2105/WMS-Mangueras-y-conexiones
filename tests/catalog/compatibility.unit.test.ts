import { describe, expect, it } from "vitest";
import { evaluateCompatibilityRules, getAssemblyCompatibilityDecision } from "@/lib/catalog/compatibility";
import { validateAssemblyCompatibility } from "@/lib/assembly/availability-service";

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

  it("blocks assembly configuration until a warning rule is explicitly handled", async () => {
    const db = {
      productCompatibilityRule: {
        findMany: async () => [{ ...baseRule, severity: "WARN" }],
      },
    };

    await expect(validateAssemblyCompatibility(db, {
      warehouseId: "warehouse-1",
      entryFittingProductId: "entry",
      hoseProductId: "hose",
      exitFittingProductId: "exit",
      hoseLength: 1,
      assemblyQuantity: 1,
    })).rejects.toMatchObject({ code: "COMPATIBILITY_REVIEW_REQUIRED" });
  });

  it("allows a warning only with an explicit review approval", async () => {
    const db = {
      productCompatibilityRule: {
        findMany: async () => [{ ...baseRule, severity: "WARN" }],
      },
    };

    const result = await validateAssemblyCompatibility(db, {
      warehouseId: "warehouse-1",
      entryFittingProductId: "entry",
      hoseProductId: "hose",
      exitFittingProductId: "exit",
      hoseLength: 1,
      assemblyQuantity: 1,
    }, { allowReview: true });

    expect(result.status).toBe("review");
    expect(result.matchedRules).toHaveLength(1);
  });

  it("only loads active rules backed by an approved technical source", async () => {
    let capturedWhere: unknown;
    const db = {
      productCompatibilityRule: {
        findMany: async (args: { where: unknown }) => {
          capturedWhere = args.where;
          return [];
        },
      },
    };

    await getAssemblyCompatibilityDecision(db, ["entry", "hose"]);

    expect(capturedWhere).toEqual({
      active: true,
      productId: { in: ["entry", "hose"] },
      compatibleProductId: { in: ["entry", "hose"] },
      source: { status: "APPROVED" },
    });
  });
});
