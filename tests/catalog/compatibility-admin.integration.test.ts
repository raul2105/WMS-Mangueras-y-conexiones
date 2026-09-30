import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  approveCompatibilityRule,
  createCompatibilityRuleDraft,
  createProductEquivalence,
  reviewCompatibilityRule,
  reviseCompatibilityRuleDraft,
  retireCompatibilityRule,
  setProductEquivalenceActive,
} from "@/lib/catalog/compatibility-admin";
import { getAssemblyCompatibilityDecision } from "@/lib/catalog/compatibility";
import { PRODUCT_SUBSTITUTION_RULE_TYPE } from "@/lib/catalog/compatibility";

const describePostgres = process.env.RUN_POSTGRES_TESTS === "1" ? describe : describe.skip;
let prisma: PrismaClient;

async function createUserWithRole(email: string, roleCode: "MANAGER" | "SYSTEM_ADMIN") {
  const role = await prisma.role.upsert({
    where: { code: roleCode },
    update: { isActive: true, name: roleCode },
    create: { code: roleCode, name: roleCode, isActive: true },
    select: { id: true },
  });
  return prisma.user.create({
    data: {
      email, name: roleCode, passwordHash: "test-hash", isActive: true,
      userRoles: { create: [{ roleId: role.id }] },
    },
    select: { id: true, name: true },
  });
}

describePostgres("KAN-19/21 compatibility governance (PostgreSQL)", () => {
  beforeAll(() => { prisma = new PrismaClient(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it("requires approved versioned sources, separates Manager review/Admin approval, and retires by CAS", async () => {
    const manager = await createUserWithRole("compatibility-manager@wms-test.invalid", "MANAGER");
    const admin = await createUserWithRole("compatibility-admin@wms-test.invalid", "SYSTEM_ADMIN");
    const hose = await prisma.product.create({
      data: { sku: "KAN19-HOSE-XB", name: "Manguera cross brand", type: "HOSE", brand: "Marca A", attributes: JSON.stringify({ series: "X" }) },
      select: { id: true },
    });
    const fitting = await prisma.product.create({
      data: { sku: "KAN19-FITTING-XB", name: "Conexión cross brand", type: "FITTING", brand: "Marca B", attributes: JSON.stringify({ series: "Y" }) },
      select: { id: true },
    });
    const invalidSource = await prisma.productTechnicalSource.create({
      data: { supplierName: "Fabricante", documentRef: "CAT-INVALID", status: "APPROVED", reviewedAt: new Date(), reviewedByUserId: admin.id },
      select: { id: true },
    });
    const source = await prisma.productTechnicalSource.create({
      data: {
        supplierName: "Fabricante de la combinación",
        documentRef: "CAT-HOSE-FITTING-42",
        documentVersion: "Rev. C",
        sourceUrl: "https://manufacturer.example/specs/42",
        status: "APPROVED",
        reviewedAt: new Date(),
        reviewedByUserId: admin.id,
      },
      select: { id: true },
    });
    const draftInput = {
      productId: hose.id,
      compatibleProductId: fitting.id,
      ruleType: "ASSEMBLY_PAIR",
      description: "Combinación exacta aprobada en el catálogo técnico del fabricante.",
      decision: "REQUIRES_REVIEW" as const,
      sourceId: source.id,
      maxWorkingPressureBar: 240,
      minTemperatureC: -20,
      maxTemperatureC: 100,
      medium: "ACEITE HIDRÁULICO",
      assemblyMethod: "CRIMPADO",
      validFrom: new Date("2026-01-01T00:00:00.000Z"),
      validTo: new Date("2027-01-01T00:00:00.000Z"),
    };

    await expect(createCompatibilityRuleDraft(prisma, { ...draftInput, sourceId: invalidSource.id }, { actorUserId: manager.id }))
      .rejects.toMatchObject({ code: "TECHNICAL_SOURCE_NOT_APPROVED" });
    await expect(createCompatibilityRuleDraft(prisma, { ...draftInput, ruleType: PRODUCT_SUBSTITUTION_RULE_TYPE }, { actorUserId: manager.id }))
      .rejects.toMatchObject({ code: "INVALID_RULE_PURPOSE" });

    const draft = await createCompatibilityRuleDraft(prisma, draftInput, { actorUserId: manager.id, actor: "spoofed label" });
    expect(draft).toMatchObject({ governanceStatus: "DRAFT", decision: "REQUIRES_REVIEW", ruleRevision: 1 });
    const operatingContext = {
      workingPressureBar: 180,
      operatingTemperatureC: 20,
      medium: "ACEITE HIDRÁULICO",
      assemblyMethod: "CRIMPADO",
    };
    await expect(getAssemblyCompatibilityDecision(prisma, [hose.id, fitting.id], operatingContext)).resolves.toMatchObject({ status: "REQUIRES_REVIEW" });

    const reviewed = await reviewCompatibilityRule(prisma, { ruleId: draft.id, expectedRevision: 1, reviewer: { actorUserId: manager.id } });
    expect(reviewed.governanceStatus).toBe("REVIEWED");
    await expect(approveCompatibilityRule(prisma, { ruleId: draft.id, expectedRevision: 1, decision: "APPROVED", approver: { actorUserId: manager.id } }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    const approved = await approveCompatibilityRule(prisma, { ruleId: draft.id, expectedRevision: 1, decision: "APPROVED", approver: { actorUserId: admin.id } });
    expect(approved).toMatchObject({ governanceStatus: "APPROVED", decision: "APPROVED", ruleRevision: 2 });
    await expect(getAssemblyCompatibilityDecision(prisma, [hose.id, fitting.id], operatingContext)).resolves.toMatchObject({ status: "APPROVED" });

    await prisma.productCompatibilityRule.update({ where: { id: draft.id }, data: { validTo: new Date("2020-01-01T00:00:00.000Z") } });
    await expect(getAssemblyCompatibilityDecision(prisma, [hose.id, fitting.id], operatingContext)).resolves.toMatchObject({ status: "REQUIRES_REVIEW" });
    const revised = await reviseCompatibilityRuleDraft(prisma, {
      ruleId: draft.id,
      expectedRevision: 2,
      actor: { actorUserId: manager.id },
      input: draftInput,
    });
    expect(revised).toMatchObject({ ruleRevision: 3, governanceStatus: "DRAFT", decision: "REQUIRES_REVIEW" });
    const reReviewed = await reviewCompatibilityRule(prisma, { ruleId: draft.id, expectedRevision: 3, reviewer: { actorUserId: manager.id } });
    expect(reReviewed.governanceStatus).toBe("REVIEWED");
    const reApproved = await approveCompatibilityRule(prisma, { ruleId: draft.id, expectedRevision: 3, decision: "APPROVED", approver: { actorUserId: admin.id } });
    expect(reApproved.ruleRevision).toBe(4);

    await expect(retireCompatibilityRule(prisma, {
      ruleId: draft.id, expectedRevision: 3, reason: "Regla obsoleta", actor: { actorUserId: admin.id },
    })).rejects.toMatchObject({ code: "STALE_RULE" });
    await retireCompatibilityRule(prisma, {
      ruleId: draft.id, expectedRevision: 4, reason: "El fabricante publicó una revisión nueva.", actor: { actorUserId: admin.id },
    });
    await expect(getAssemblyCompatibilityDecision(prisma, [hose.id, fitting.id])).resolves.toMatchObject({ status: "REQUIRES_REVIEW" });

    const equivalence = await createProductEquivalence(prisma, {
      productId: hose.id,
      equivProductId: fitting.id,
      basisNorm: "ISO 12345",
      sourceSheet: "Boletín comercial Rev. C, página 4",
      actor: { actorUserId: manager.id },
    });
    await setProductEquivalenceActive(prisma, {
      equivalenceId: equivalence.id, active: false, reason: "Retirada por cambio en el catálogo comercial.", actor: { actorUserId: manager.id },
    });
    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "PRODUCT_EQUIVALENCE", entityId: equivalence.id, action: "RETIRE" },
      select: { actorUserId: true },
    });
    expect(audit?.actorUserId).toBe(manager.id);

    const governanceAudits = await prisma.auditLog.findMany({
      where: {
        OR: [
          { entityType: "PRODUCT_COMPATIBILITY_RULE", entityId: draft.id, action: { in: ["CREATE_DRAFT", "REVIEW", "APPROVE", "REVISE", "RETIRE"] } },
          { entityType: "PRODUCT_EQUIVALENCE", entityId: equivalence.id, action: { in: ["CREATE", "RETIRE"] } },
        ],
      },
      select: { action: true, before: true, after: true },
    });
    expect(governanceAudits.length).toBeGreaterThanOrEqual(8);
    for (const row of governanceAudits) {
      for (const value of [row.before, row.after]) {
        if (value === null) continue;
        const parsed = JSON.parse(value) as unknown;
        expect(parsed).not.toBeNull();
        expect(typeof parsed).toBe("object");
      }
    }
  });
});
