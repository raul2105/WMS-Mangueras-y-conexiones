import type { Prisma, PrismaClient } from "@prisma/client";
import { createAuditLogRequiredWithDb } from "@/lib/audit-log";
import { ASSEMBLY_PAIR_RULE_TYPE, PRODUCT_SUBSTITUTION_RULE_TYPE } from "@/lib/catalog/compatibility";
import { InventoryServiceError } from "@/lib/inventory-service";

export type CatalogMutationActor = { actorUserId: string; actor?: string };
type Tx = Prisma.TransactionClient;
type RuleDraftInput = {
  productId: string;
  compatibleProductId: string;
  ruleType: string;
  description: string;
  decision: "BLOCKED" | "REQUIRES_REVIEW";
  sourceId: string;
  validFrom?: Date | null;
  validTo?: Date | null;
  maxWorkingPressureBar?: number | null;
  minTemperatureC?: number | null;
  maxTemperatureC?: number | null;
  medium?: string | null;
  application?: string | null;
  assemblyMethod?: string | null;
};

async function trustedActor(tx: Tx, actor: CatalogMutationActor, adminOnly = false) {
  const user = await tx.user.findUnique({
    where: { id: actor.actorUserId },
    select: {
      id: true, name: true, email: true, isActive: true,
      userRoles: { where: { role: { isActive: true } }, select: { role: { select: { code: true } } } },
    },
  });
  const roles = user?.userRoles.map(({ role }) => role.code) ?? [];
  const isAdmin = roles.includes("SYSTEM_ADMIN");
  if (!user?.isActive || (!isAdmin && !roles.includes("MANAGER")) || (adminOnly && !isAdmin)) {
    throw new InventoryServiceError("FORBIDDEN", "No tienes permiso para administrar compatibilidad técnica");
  }
  return { actorUserId: user.id, actor: user.name || user.email || user.id, roles };
}

async function approvedSource(tx: Tx, sourceId: string) {
  const source = await tx.productTechnicalSource.findUnique({
    where: { id: sourceId },
    select: {
      id: true, supplierName: true, documentRef: true, documentVersion: true,
      sourceUrl: true, status: true, reviewedAt: true, reviewedByUserId: true,
    },
  });
  if (!source || source.status !== "APPROVED" || !source.reviewedAt || !source.reviewedByUserId
    || !source.supplierName.trim() || !source.documentRef.trim() || !source.documentVersion?.trim()) {
    throw new InventoryServiceError("TECHNICAL_SOURCE_NOT_APPROVED", "Selecciona una fuente técnica aprobada con fabricante, documento y versión");
  }
  return source;
}

async function validateRuleInputs(tx: Tx, input: RuleDraftInput) {
  const ruleType = input.ruleType.trim();
  const description = input.description.trim();
  if (ruleType !== PRODUCT_SUBSTITUTION_RULE_TYPE && ruleType !== ASSEMBLY_PAIR_RULE_TYPE) {
    throw new InventoryServiceError("INVALID_RULE_PURPOSE", "La regla debe declarar sustitución de producto o par técnico de ensamble");
  }
  if (description.length < 12 || description.length > 2000) {
    throw new InventoryServiceError("INVALID_RULE", "La regla requiere una explicación técnica de 12 a 2000 caracteres");
  }
  if (input.productId === input.compatibleProductId) {
    throw new InventoryServiceError("INVALID_RULE", "Una regla debe relacionar dos productos distintos");
  }
  if (input.validFrom && input.validTo && input.validFrom > input.validTo) {
    throw new InventoryServiceError("INVALID_RULE", "La vigencia inicial debe preceder a la fecha final");
  }
  for (const [label, value] of [
    ["presión máxima", input.maxWorkingPressureBar],
    ["temperatura mínima", input.minTemperatureC],
    ["temperatura máxima", input.maxTemperatureC],
  ] as const) {
    if (value !== null && value !== undefined && !Number.isFinite(value)) {
      throw new InventoryServiceError("INVALID_RULE", `El valor de ${label} debe ser numérico`);
    }
  }
  if (input.maxWorkingPressureBar !== null && input.maxWorkingPressureBar !== undefined && input.maxWorkingPressureBar <= 0) {
    throw new InventoryServiceError("INVALID_RULE", "La presión máxima debe ser mayor que cero");
  }
  if (input.minTemperatureC !== null && input.minTemperatureC !== undefined
    && input.maxTemperatureC !== null && input.maxTemperatureC !== undefined
    && input.minTemperatureC > input.maxTemperatureC) {
    throw new InventoryServiceError("INVALID_RULE", "El rango de temperatura es inválido");
  }
  const [left, right] = await Promise.all([
    tx.product.findUnique({ where: { id: input.productId }, select: { id: true, sku: true, name: true, brand: true, type: true, attributes: true } }),
    tx.product.findUnique({ where: { id: input.compatibleProductId }, select: { id: true, sku: true, name: true, brand: true, type: true, attributes: true } }),
  ]);
  if (!left || !right) throw new InventoryServiceError("PRODUCT_NOT_FOUND", "Uno de los productos de la regla no existe");
  if (ruleType === PRODUCT_SUBSTITUTION_RULE_TYPE && left.type !== right.type) {
    throw new InventoryServiceError("INVALID_RULE_PURPOSE", "La sustitución de producto debe conservar la misma familia técnica");
  }
  if (!["HOSE", "FITTING"].includes(left.type) || !["HOSE", "FITTING"].includes(right.type)) {
    throw new InventoryServiceError("INVALID_RULE", "Las reglas de compatibilidad sólo pueden relacionar mangueras y conexiones");
  }
  const source = await approvedSource(tx, input.sourceId);
  const technicalSpecs = await tx.productTechnicalSpec.findMany({
    where: { productId: { in: [left.id, right.id] } },
    select: { productId: true, family: true, key: true, value: true, unit: true, sourceId: true },
    orderBy: [{ productId: "asc" }, { key: "asc" }],
  });
  return {
    left, right, source, technicalSpecs,
    ruleType,
    description,
    productSnapshot: [left, right].map(({ id, sku, name, brand, type, attributes }) => ({ id, sku, name, brand, type, attributes })),
  };
}

function auditSnapshot(input: unknown) {
  // The audit writer owns serialization. Returning a JSON string here causes
  // the structured snapshot to be stored as a quoted JSON string.
  return input;
}

export async function createCompatibilityRuleDraft(
  prisma: PrismaClient,
  input: RuleDraftInput,
  actor: CatalogMutationActor,
) {
  return prisma.$transaction(async (tx) => {
    const principal = await trustedActor(tx, actor);
    const validated = await validateRuleInputs(tx, input);
    const rule = await tx.productCompatibilityRule.create({
      data: {
        productId: input.productId,
        compatibleProductId: input.compatibleProductId,
        ruleType: validated.ruleType,
        description: validated.description,
        severity: input.decision === "BLOCKED" ? "BLOCK" : "REVIEW",
        decision: input.decision,
        governanceStatus: "DRAFT",
        ruleRevision: 1,
        active: true,
        sourceId: validated.source.id,
        validFrom: input.validFrom ?? null,
        validTo: input.validTo ?? null,
        maxWorkingPressureBar: input.maxWorkingPressureBar ?? null,
        minTemperatureC: input.minTemperatureC ?? null,
        maxTemperatureC: input.maxTemperatureC ?? null,
        medium: input.medium?.trim() || null,
        application: input.application?.trim() || null,
        assemblyMethod: input.assemblyMethod?.trim() || null,
      },
      select: { id: true, ruleRevision: true, governanceStatus: true, decision: true },
    });
    await createAuditLogRequiredWithDb({
      entityType: "PRODUCT_COMPATIBILITY_RULE", entityId: rule.id, action: "CREATE_DRAFT",
      actor: principal.actor, actorUserId: principal.actorUserId, source: "catalog/compatibility-admin",
      after: auditSnapshot({ rule, source: validated.source, products: validated.productSnapshot, technicalSpecs: validated.technicalSpecs }),
    }, tx);
    return rule;
  });
}

export async function reviseCompatibilityRuleDraft(
  prisma: PrismaClient,
  args: { ruleId: string; expectedRevision: number; input: RuleDraftInput; actor: CatalogMutationActor },
) {
  return prisma.$transaction(async (tx) => {
    const principal = await trustedActor(tx, args.actor);
    const before = await tx.productCompatibilityRule.findUnique({
      where: { id: args.ruleId },
      select: {
        id: true, productId: true, compatibleProductId: true, ruleType: true, description: true,
        severity: true, decision: true, governanceStatus: true, ruleRevision: true, active: true,
        sourceId: true, validFrom: true, validTo: true, maxWorkingPressureBar: true,
        minTemperatureC: true, maxTemperatureC: true, medium: true, application: true, assemblyMethod: true,
      },
    });
    if (!before || !before.active || before.ruleRevision !== args.expectedRevision) {
      throw new InventoryServiceError("STALE_RULE", "La regla cambió o ya está retirada");
    }
    const validated = await validateRuleInputs(tx, args.input);
    const claim = await tx.productCompatibilityRule.updateMany({
      where: { id: before.id, ruleRevision: args.expectedRevision, active: true },
      data: {
        productId: args.input.productId,
        compatibleProductId: args.input.compatibleProductId,
        ruleType: validated.ruleType,
        description: validated.description,
        severity: args.input.decision === "BLOCKED" ? "BLOCK" : "REVIEW",
        decision: args.input.decision,
        governanceStatus: "DRAFT",
        ruleRevision: { increment: 1 },
        sourceId: validated.source.id,
        validFrom: args.input.validFrom ?? null,
        validTo: args.input.validTo ?? null,
        maxWorkingPressureBar: args.input.maxWorkingPressureBar ?? null,
        minTemperatureC: args.input.minTemperatureC ?? null,
        maxTemperatureC: args.input.maxTemperatureC ?? null,
        medium: args.input.medium?.trim() || null,
        application: args.input.application?.trim() || null,
        assemblyMethod: args.input.assemblyMethod?.trim() || null,
      },
    });
    if (claim.count !== 1) throw new InventoryServiceError("STALE_RULE", "La regla fue modificada por otro usuario");
    const after = await tx.productCompatibilityRule.findUniqueOrThrow({
      where: { id: before.id },
      select: { id: true, productId: true, compatibleProductId: true, ruleType: true, description: true, decision: true, governanceStatus: true, ruleRevision: true, sourceId: true, validFrom: true, validTo: true, maxWorkingPressureBar: true, minTemperatureC: true, maxTemperatureC: true, medium: true, application: true, assemblyMethod: true, active: true },
    });
    await createAuditLogRequiredWithDb({
      entityType: "PRODUCT_COMPATIBILITY_RULE", entityId: before.id, action: "REVISE",
      actor: principal.actor, actorUserId: principal.actorUserId, source: "catalog/compatibility-admin",
      before: auditSnapshot(before),
      after: auditSnapshot({ rule: after, source: validated.source, products: validated.productSnapshot, technicalSpecs: validated.technicalSpecs }),
    }, tx);
    return after;
  });
}

export async function reviewCompatibilityRule(
  prisma: PrismaClient,
  args: { ruleId: string; expectedRevision: number; reviewer: CatalogMutationActor },
) {
  return prisma.$transaction(async (tx) => {
    const principal = await trustedActor(tx, args.reviewer);
    const before = await tx.productCompatibilityRule.findUnique({
      where: { id: args.ruleId },
      select: { id: true, productId: true, compatibleProductId: true, sourceId: true, ruleType: true, description: true, ruleRevision: true, governanceStatus: true, decision: true, active: true },
    });
    if (!before || before.ruleRevision !== args.expectedRevision || before.governanceStatus !== "DRAFT" || !before.active) {
      throw new InventoryServiceError("STALE_RULE", "La regla cambió o ya no está disponible para revisión");
    }
    if (before.decision === "APPROVED") throw new InventoryServiceError("INVALID_RULE", "La revisión del Manager no puede aprobar compatibilidad");
    if (!before.sourceId) throw new InventoryServiceError("TECHNICAL_SOURCE_NOT_APPROVED", "La regla requiere una fuente técnica aprobada");
    await approvedSource(tx, before.sourceId);
    const claim = await tx.productCompatibilityRule.updateMany({
      where: { id: before.id, ruleRevision: args.expectedRevision, governanceStatus: "DRAFT", active: true },
      data: { governanceStatus: "REVIEWED" },
    });
    if (claim.count !== 1) throw new InventoryServiceError("STALE_RULE", "La regla fue modificada por otro usuario");
    const after = { ...before, governanceStatus: "REVIEWED" };
    await createAuditLogRequiredWithDb({
      entityType: "PRODUCT_COMPATIBILITY_RULE", entityId: before.id, action: "REVIEW",
      actor: principal.actor, actorUserId: principal.actorUserId, source: "catalog/compatibility-admin",
      before: auditSnapshot(before), after: auditSnapshot(after),
    }, tx);
    return after;
  });
}

export async function approveCompatibilityRule(
  prisma: PrismaClient,
  args: { ruleId: string; expectedRevision: number; decision: "APPROVED" | "BLOCKED" | "REQUIRES_REVIEW"; approver: CatalogMutationActor },
) {
  return prisma.$transaction(async (tx) => {
    const principal = await trustedActor(tx, args.approver, true);
    const before = await tx.productCompatibilityRule.findUnique({
      where: { id: args.ruleId },
      select: { id: true, productId: true, compatibleProductId: true, sourceId: true, ruleType: true, description: true, ruleRevision: true, governanceStatus: true, decision: true, active: true },
    });
    if (!before || before.ruleRevision !== args.expectedRevision || before.governanceStatus !== "REVIEWED" || !before.active) {
      throw new InventoryServiceError("STALE_RULE", "La regla cambió o no cuenta con revisión de Manager");
    }
    if (!before.sourceId) throw new InventoryServiceError("TECHNICAL_SOURCE_NOT_APPROVED", "La regla requiere una fuente técnica aprobada");
    await approvedSource(tx, before.sourceId);
    const claim = await tx.productCompatibilityRule.updateMany({
      where: { id: before.id, ruleRevision: args.expectedRevision, governanceStatus: "REVIEWED", active: true },
      data: {
        governanceStatus: "APPROVED",
        decision: args.decision,
        severity: args.decision === "BLOCKED" ? "BLOCK" : args.decision === "APPROVED" ? "ALLOW" : "REVIEW",
        ruleRevision: { increment: 1 },
      },
    });
    if (claim.count !== 1) throw new InventoryServiceError("STALE_RULE", "La regla fue modificada por otro usuario");
    const after = {
      ...before,
      governanceStatus: "APPROVED",
      decision: args.decision,
      severity: args.decision === "BLOCKED" ? "BLOCK" : args.decision === "APPROVED" ? "ALLOW" : "REVIEW",
      ruleRevision: before.ruleRevision + 1,
    };
    await createAuditLogRequiredWithDb({
      entityType: "PRODUCT_COMPATIBILITY_RULE", entityId: before.id, action: "APPROVE",
      actor: principal.actor, actorUserId: principal.actorUserId, source: "catalog/compatibility-admin",
      before: auditSnapshot(before), after: auditSnapshot(after),
    }, tx);
    return after;
  });
}

export async function retireCompatibilityRule(
  prisma: PrismaClient,
  args: { ruleId: string; expectedRevision: number; reason: string; actor: CatalogMutationActor },
) {
  const reason = args.reason.trim();
  if (reason.length < 10 || reason.length > 1000) throw new InventoryServiceError("RETIRE_REASON_REQUIRED", "Retirar una regla requiere explicar el motivo (10 a 1000 caracteres)");
  return prisma.$transaction(async (tx) => {
    const principal = await trustedActor(tx, args.actor, true);
    const before = await tx.productCompatibilityRule.findUnique({
      where: { id: args.ruleId },
      select: { id: true, productId: true, compatibleProductId: true, ruleType: true, decision: true, governanceStatus: true, active: true, ruleRevision: true, sourceId: true },
    });
    if (!before || !before.active || before.ruleRevision !== args.expectedRevision) throw new InventoryServiceError("STALE_RULE", "La regla cambió o ya está retirada");
    const claim = await tx.productCompatibilityRule.updateMany({
      where: { id: before.id, active: true, ruleRevision: args.expectedRevision },
      data: { active: false, governanceStatus: "RETIRED", ruleRevision: { increment: 1 } },
    });
    if (claim.count !== 1) throw new InventoryServiceError("STALE_RULE", "La regla fue modificada por otro usuario");
    await createAuditLogRequiredWithDb({
      entityType: "PRODUCT_COMPATIBILITY_RULE", entityId: before.id, action: "RETIRE",
      actor: principal.actor, actorUserId: principal.actorUserId, source: "catalog/compatibility-admin",
      before: auditSnapshot(before), after: auditSnapshot({ ...before, active: false, governanceStatus: "RETIRED", ruleRevision: before.ruleRevision + 1, reason }),
    }, tx);
  });
}

export async function createProductEquivalence(
  prisma: PrismaClient,
  args: { productId: string; equivProductId: string; basisNorm?: string | null; basisDash?: number | null; sourceSheet?: string | null; notes?: string | null; actor: CatalogMutationActor },
) {
  if (args.productId === args.equivProductId) throw new InventoryServiceError("INVALID_EQUIVALENCE", "Una equivalencia debe relacionar productos distintos");
  const basisNorm = args.basisNorm?.trim() || null;
  const sourceSheet = args.sourceSheet?.trim() || null;
  const notes = args.notes?.trim() || null;
  if (!basisNorm && args.basisDash == null && !sourceSheet && !notes) {
    throw new InventoryServiceError("EQUIVALENCE_BASIS_REQUIRED", "Registra la base comercial o la referencia documental de la equivalencia");
  }
  if (args.basisDash != null && (!Number.isInteger(args.basisDash) || args.basisDash < 0 || args.basisDash > 999)) {
    throw new InventoryServiceError("INVALID_EQUIVALENCE", "Dash debe ser un entero de 0 a 999");
  }
  return prisma.$transaction(async (tx) => {
    const principal = await trustedActor(tx, args.actor);
    const [product, equivalent] = await Promise.all([
      tx.product.findUnique({ where: { id: args.productId }, select: { id: true, sku: true, name: true, brand: true, type: true } }),
      tx.product.findUnique({ where: { id: args.equivProductId }, select: { id: true, sku: true, name: true, brand: true, type: true } }),
    ]);
    if (!product || !equivalent) throw new InventoryServiceError("PRODUCT_NOT_FOUND", "Uno de los productos de la equivalencia no existe");
    const created = await tx.productEquivalence.create({
      data: { productId: args.productId, equivProductId: args.equivProductId, basisNorm, basisDash: args.basisDash ?? null, sourceSheet, notes, active: true },
      select: { id: true, productId: true, equivProductId: true, basisNorm: true, basisDash: true, sourceSheet: true, notes: true, active: true },
    });
    await createAuditLogRequiredWithDb({
      entityType: "PRODUCT_EQUIVALENCE", entityId: created.id, action: "CREATE",
      actor: principal.actor, actorUserId: principal.actorUserId, source: "catalog/compatibility-admin",
      after: auditSnapshot({ equivalence: created, product, equivalent, technicalApproval: "NONE" }),
    }, tx);
    return created;
  });
}

export async function setProductEquivalenceActive(
  prisma: PrismaClient,
  args: { equivalenceId: string; active: boolean; reason?: string; actor: CatalogMutationActor },
) {
  const reason = args.reason?.trim() || "";
  if (!args.active && reason.length < 10) throw new InventoryServiceError("RETIRE_REASON_REQUIRED", "Desactivar una equivalencia requiere un motivo de al menos 10 caracteres");
  return prisma.$transaction(async (tx) => {
    const principal = await trustedActor(tx, args.actor);
    const before = await tx.productEquivalence.findUnique({
      where: { id: args.equivalenceId },
      select: { id: true, productId: true, equivProductId: true, active: true, basisNorm: true, basisDash: true, sourceSheet: true, notes: true, updatedAt: true },
    });
    if (!before) throw new InventoryServiceError("EQUIVALENCE_NOT_FOUND", "La equivalencia no existe");
    if (before.active === args.active) return before;
    const claim = await tx.productEquivalence.updateMany({
      where: { id: before.id, active: before.active, updatedAt: before.updatedAt },
      data: { active: args.active },
    });
    if (claim.count !== 1) throw new InventoryServiceError("STALE_EQUIVALENCE", "La equivalencia fue modificada por otro usuario");
    await createAuditLogRequiredWithDb({
      entityType: "PRODUCT_EQUIVALENCE", entityId: before.id, action: args.active ? "ACTIVATE" : "RETIRE",
      actor: principal.actor, actorUserId: principal.actorUserId, source: "catalog/compatibility-admin",
      before: auditSnapshot(before), after: auditSnapshot({ ...before, active: args.active, reason: reason || null }),
    }, tx);
    return { ...before, active: args.active };
  });
}
