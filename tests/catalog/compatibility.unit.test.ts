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
  const approvedRule = {
    ...baseRule,
    severity: "INFO",
    decision: "APPROVED",
    governanceStatus: "APPROVED",
    source: {
      supplierName: "Proveedor",
      documentRef: "FICHA-001",
      documentVersion: "1",
      status: "APPROVED",
    },
  };

  it("blocks a configured combination when an explicit block rule matches", () => {
    const result = evaluateCompatibilityRules(["entry", "hose"], [baseRule]);
    expect(result.status).toBe("BLOCKED");
    expect(result.reasonCode).toBe("RULE_BLOCKED");
    expect(result.matchedRules).toHaveLength(1);
  });

  it("fails closed when there is no approved technical rule", () => {
    const result = evaluateCompatibilityRules(["entry", "hose"], []);
    expect(result.status).toBe("REQUIRES_REVIEW");
    expect(result.reasonCode).toBe("NO_APPROVED_RULE");
    expect(result.reviewOverrideAllowed).toBe(false);
  });

  it("approves only a governed and complete rule set", () => {
    const result = evaluateCompatibilityRules(["entry", "hose", "exit"], [
      approvedRule,
      { ...approvedRule, productId: "hose", compatibleProductId: "exit" },
    ]);
    expect(result.status).toBe("APPROVED");
    expect(result.reasonCode).toBe("APPROVED_RULE_SET");
  });

  it("requires review when approved rules do not cover every component", () => {
    const result = evaluateCompatibilityRules(["entry", "hose", "exit"], [approvedRule]);
    expect(result.status).toBe("REQUIRES_REVIEW");
    expect(result.reasonCode).toBe("INCOMPLETE_RULE_SET");
    expect(result.missingProductIds).toContain("exit");
  });

  it("blocks values outside approved operating limits", () => {
    const result = evaluateCompatibilityRules(["entry", "hose"], [{
      ...approvedRule,
      maxWorkingPressureBar: 120,
    }], { workingPressureBar: 150 });
    expect(result.status).toBe("BLOCKED");
    expect(result.reasonCode).toBe("OUTSIDE_APPROVED_LIMITS");
  });

  it("requires operating context when a governed limit needs it", () => {
    const result = evaluateCompatibilityRules(["entry", "hose"], [{
      ...approvedRule,
      maxWorkingPressureBar: 120,
    }]);
    expect(result.status).toBe("REQUIRES_REVIEW");
    expect(result.reasonCode).toBe("MISSING_OPERATING_CONTEXT");
    expect(result.reviewOverrideAllowed).toBe(false);
  });

  it("uses the captured operating context when configuring an assembly", async () => {
    const db = {
      productCompatibilityRule: {
        findMany: async () => [{ ...approvedRule, maxWorkingPressureBar: 120 }],
      },
    };
    await expect(validateAssemblyCompatibility(db, {
      warehouseId: "warehouse-1",
      entryFittingProductId: "entry",
      hoseProductId: "hose",
      exitFittingProductId: "entry",
      hoseLength: 1,
      assemblyQuantity: 1,
      workingPressureBar: 100,
    })).resolves.toMatchObject({ status: "APPROVED" });
  });

  it("permits an explicit override only for a current review rule", async () => {
    const db = {
      productCompatibilityRule: {
        findMany: async () => [{
          ...baseRule,
          severity: "WARN",
          decision: "REQUIRES_REVIEW",
          governanceStatus: "APPROVED",
        }],
      },
    };
    const input = {
      warehouseId: "warehouse-1",
      entryFittingProductId: "entry",
      hoseProductId: "hose",
      exitFittingProductId: "entry",
      hoseLength: 1,
      assemblyQuantity: 1,
    };

    await expect(validateAssemblyCompatibility(db, input)).rejects.toMatchObject({ code: "COMPATIBILITY_REVIEW_REQUIRED" });
    await expect(validateAssemblyCompatibility(db, input, {
      allowReview: true,
      reviewReason: "Validación técnica documentada",
      reviewerRoles: ["MANAGER"],
      reviewedByUserId: "manager-1",
    })).resolves.toMatchObject({
      status: "REQUIRES_REVIEW",
      reviewOverrideAllowed: true,
    });
  });

  it("does not permit an override for an absent rule", async () => {
    const db = { productCompatibilityRule: { findMany: async () => [] } };
    await expect(validateAssemblyCompatibility(db, {
      warehouseId: "warehouse-1",
      entryFittingProductId: "entry",
      hoseProductId: "hose",
      exitFittingProductId: "exit",
      hoseLength: 1,
      assemblyQuantity: 1,
    }, { allowReview: true })).rejects.toMatchObject({ code: "COMPATIBILITY_REVIEW_REQUIRED" });
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
