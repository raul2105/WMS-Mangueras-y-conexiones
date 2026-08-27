import { describe, expect, it } from "vitest";
import {
  assertAssemblyOperationalCompatibility,
  compatibilityRulesFingerprint,
} from "@/lib/assembly/compatibility-guard";

const approvedRule = {
  productId: "entry",
  compatibleProductId: "hose",
  ruleType: "ASSEMBLY",
  description: "Regla aprobada",
  severity: "INFO",
  decision: "APPROVED",
  governanceStatus: "APPROVED",
  ruleRevision: 1,
  validFrom: null,
  validTo: null,
  maxWorkingPressureBar: null,
  minTemperatureC: null,
  maxTemperatureC: null,
  medium: null,
  application: null,
  assemblyMethod: null,
  source: { supplierName: "Proveedor", documentRef: "DOC-1", documentVersion: "1", sourceUrl: null, status: "APPROVED" },
};

const reviewRule = { ...approvedRule, decision: "REQUIRES_REVIEW", description: "Revisión autorizable" };

function configuredOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    assemblyConfiguration: {
      compatibilityStatus: "APPROVED",
      compatibilityReviewApproved: false,
      compatibilityReviewReason: null,
      compatibilityReviewedByUserId: null,
      compatibilityReviewRules: null,
      ...overrides,
    },
    assemblyWorkOrder: {
      lines: [
        { componentRole: "ENTRY_FITTING", productId: "entry" },
        { componentRole: "HOSE", productId: "hose" },
        { componentRole: "EXIT_FITTING", productId: "exit" },
      ],
    },
  };
}

function mockDb(order: ReturnType<typeof configuredOrder> | { id: string; assemblyConfiguration: null; assemblyWorkOrder: { lines: never[] } }, rules: unknown[]) {
  return {
    productionOrder: { findUnique: async () => order },
    productCompatibilityRule: { findMany: async () => rules },
  } as never;
}

describe("assembly operational compatibility guard", () => {
  it("classifies historical orders without structured configuration without blocking them", async () => {
    const result = await assertAssemblyOperationalCompatibility(
      mockDb({ id: "legacy", assemblyConfiguration: null, assemblyWorkOrder: { lines: [] } }, []),
      "legacy",
      "RELEASE_PICK_LIST",
    );
    expect(result.status).toBe("LEGACY_NOT_APPLICABLE");
  });

  it("accepts a complete approved rule set for the actual work-order components", async () => {
    const rules = [
      approvedRule,
      { ...approvedRule, productId: "hose", compatibleProductId: "exit", description: "Regla aprobada 2" },
    ];
    const result = await assertAssemblyOperationalCompatibility(mockDb(configuredOrder(), rules), "order-1", "CONFIRM_PICK");
    expect(result).toMatchObject({ status: "APPROVED", applicability: "CONFIGURED", productIds: ["entry", "hose", "exit"] });
  });

  it("blocks a substitution that no longer has an approved rule set", async () => {
    const order = configuredOrder();
    order.assemblyWorkOrder.lines[2].productId = "substitute";
    await expect(assertAssemblyOperationalCompatibility(mockDb(order, [approvedRule]), "order-1", "CONFIRM_PICK"))
      .rejects.toMatchObject({ code: "COMPATIBILITY_REVIEW_REQUIRED" });
  });

  it("blocks a configured order when a current rule explicitly forbids the combination", async () => {
    const blockedRule = { ...approvedRule, decision: "BLOCKED", severity: "BLOCK", description: "Combinación insegura" };
    await expect(assertAssemblyOperationalCompatibility(mockDb(configuredOrder(), [blockedRule]), "order-1", "RELEASE_PICK_LIST"))
      .rejects.toMatchObject({ code: "INCOMPATIBLE_COMPONENTS" });
  });

  it("reuses only a governed override whose rule snapshot still matches", async () => {
    const order = configuredOrder({
      compatibilityStatus: "REQUIRES_REVIEW",
      compatibilityReviewApproved: true,
      compatibilityReviewReason: "Revisión técnica documentada",
      compatibilityReviewedByUserId: "manager-1",
      compatibilityReviewRules: JSON.stringify([reviewRule]),
    });
    const result = await assertAssemblyOperationalCompatibility(mockDb(order, [reviewRule]), "order-1", "CLOSE_ASSEMBLY");
    expect(result).toMatchObject({ status: "REQUIRES_REVIEW", overrideReused: true });
  });

  it("invalidates an override when the governed rule snapshot changes", async () => {
    const order = configuredOrder({
      compatibilityStatus: "REQUIRES_REVIEW",
      compatibilityReviewApproved: true,
      compatibilityReviewReason: "Revisión técnica documentada",
      compatibilityReviewedByUserId: "manager-1",
      compatibilityReviewRules: JSON.stringify([reviewRule]),
    });
    const revisedRule = { ...reviewRule, ruleRevision: 2 };
    await expect(assertAssemblyOperationalCompatibility(mockDb(order, [revisedRule]), "order-1", "CLOSE_ASSEMBLY"))
      .rejects.toMatchObject({ code: "COMPATIBILITY_REVIEW_REQUIRED" });
  });

  it("generates a stable fingerprint independent of object key and rule order", () => {
    expect(compatibilityRulesFingerprint([{ b: 2, a: 1, validFrom: new Date("2026-01-01T00:00:00.000Z") }, { c: 3 }]))
      .toBe(compatibilityRulesFingerprint([{ c: 3 }, { validFrom: "2026-01-01T00:00:00.000Z", a: 1, b: 2 }]));
  });
});
