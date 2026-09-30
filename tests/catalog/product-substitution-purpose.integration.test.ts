import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import prisma from "@/lib/prisma";
import { ASSEMBLY_PAIR_RULE_TYPE, PRODUCT_SUBSTITUTION_RULE_TYPE } from "@/lib/catalog/compatibility";
import { InventoryService } from "@/lib/inventory-service";
import { getEquivalentProducts } from "@/lib/product-equivalences";
import { addSalesRequestProductLine, createSalesRequestDraftHeader } from "@/lib/sales/request-service";

const describePostgres = process.env.RUN_POSTGRES_TESTS === "1" ? describe : describe.skip;
const runTag = `SUB-${randomUUID().replaceAll("-", "").slice(0, 18).toUpperCase()}`;
let managerId = "";
let sourceId = "";
let sourceReviewerId = "";
let originalId = "";
let substituteId = "";
let crossFamilyId = "";
let warehouseId = "";
let storageLocationId = "";
let stagingLocationId = "";
let orderId = "";
let sourceMovementRef = "";

async function createApprovedRule(productId: string, compatibleProductId: string, ruleType: string, decision: "APPROVED" | "BLOCKED" = "APPROVED") {
  return prisma.productCompatibilityRule.create({
    data: {
      productId,
      compatibleProductId,
      ruleType,
      description: `Approved ${ruleType} evidence ${runTag}`,
      severity: "INFO",
      decision,
      governanceStatus: "APPROVED",
      ruleRevision: 1,
      active: true,
      sourceId,
    },
    select: { id: true },
  });
}

async function cleanup() {
  if (orderId) {
    const order = await prisma.salesInternalOrder.findUnique({
      where: { id: orderId },
      select: { id: true, code: true, lines: { select: { id: true, pickTasks: { select: { id: true } } } }, pickLists: { select: { id: true, tasks: { select: { id: true } } } } },
    });
    if (order) {
      const relatedEntityIds = [order.id, ...order.lines.map(({ id }) => id), ...order.lines.flatMap(({ pickTasks }) => pickTasks.map(({ id }) => id)), ...order.pickLists.map(({ id }) => id), ...order.pickLists.flatMap(({ tasks }) => tasks.map(({ id }) => id))];
      await prisma.auditLog.deleteMany({ where: { entityId: { in: relatedEntityIds } } });
      await prisma.inventoryMovement.deleteMany({ where: { documentId: { in: [order.id, order.code, sourceMovementRef].filter(Boolean) } } });
      await prisma.salesInternalOrder.deleteMany({ where: { id: order.id } });
    }
  }
  if (sourceMovementRef) await prisma.inventoryMovement.deleteMany({ where: { documentId: sourceMovementRef } });
  if (substituteId) await prisma.inventory.deleteMany({ where: { productId: substituteId } });
  await prisma.productEquivalence.deleteMany({ where: { productId: { in: [originalId, substituteId, crossFamilyId].filter(Boolean) } } });
  await prisma.productCompatibilityRule.deleteMany({ where: { productId: { in: [originalId, substituteId, crossFamilyId].filter(Boolean) } } });
  if (sourceId) {
    await prisma.productTechnicalSpecCandidate.deleteMany({ where: { sourceId } });
    await prisma.productTechnicalSpec.deleteMany({ where: { sourceId } });
    await prisma.productAsset.deleteMany({ where: { sourceId } });
    await prisma.productTechnicalSource.deleteMany({ where: { id: sourceId } });
  }
  if (sourceReviewerId) await prisma.user.deleteMany({ where: { id: sourceReviewerId } });
  await prisma.auditLog.deleteMany({ where: { actorUserId: managerId } });
  if (originalId || substituteId || crossFamilyId) {
    await prisma.product.deleteMany({ where: { id: { in: [originalId, substituteId, crossFamilyId].filter(Boolean) } } });
  }
  if (storageLocationId) await prisma.location.deleteMany({ where: { id: storageLocationId } });
  if (stagingLocationId) await prisma.location.deleteMany({ where: { id: stagingLocationId } });
  if (warehouseId) await prisma.warehouse.deleteMany({ where: { id: warehouseId } });
  if (managerId) await prisma.user.deleteMany({ where: { id: managerId } });
}

describePostgres("product substitution purpose and immutable Sales snapshot (PostgreSQL)", () => {
  afterAll(async () => {
    try { await cleanup(); } finally { await prisma.$disconnect(); }
  });

  it("does not treat assembly-pair approval or a different family as a product substitute", async () => {
    const managerRole = await prisma.role.upsert({
      where: { code: "MANAGER" },
      update: { isActive: true, name: "MANAGER" },
      create: { code: "MANAGER", name: "MANAGER", isActive: true },
      select: { id: true },
    });
    const manager = await prisma.user.create({
      data: {
        email: `${runTag.toLowerCase()}@test.invalid`, name: `Sales ${runTag}`, passwordHash: "test-hash", isActive: true,
        userRoles: { create: [{ roleId: managerRole.id }] },
      },
      select: { id: true },
    });
    managerId = manager.id;
    const [original, substitute, crossFamily] = await Promise.all([
      prisma.product.create({ data: { sku: `${runTag}-ORIGINAL`, name: "Original hose", type: "HOSE", brand: runTag, attributes: "{}" }, select: { id: true } }),
      prisma.product.create({ data: { sku: `${runTag}-SUBSTITUTE`, name: "Substitute hose", type: "HOSE", brand: runTag, attributes: "{}" }, select: { id: true } }),
      prisma.product.create({ data: { sku: `${runTag}-FITTING`, name: "Cross-family fitting", type: "FITTING", brand: runTag, attributes: "{}" }, select: { id: true } }),
    ]);
    originalId = original.id;
    substituteId = substitute.id;
    crossFamilyId = crossFamily.id;

    const warehouse = await prisma.warehouse.create({ data: { code: `${runTag}-WH`, name: `Warehouse ${runTag}`, isActive: true }, select: { id: true } });
    warehouseId = warehouse.id;
    const [storage, staging] = await Promise.all([
      prisma.location.create({ data: { code: `${runTag}-STO`, name: "Storage", usageType: "STORAGE", isActive: true, warehouseId }, select: { id: true, code: true } }),
      prisma.location.create({ data: { code: `STAGING-${runTag}-WH`, name: "Staging", usageType: "STAGING", isActive: true, warehouseId }, select: { id: true } }),
    ]);
    storageLocationId = storage.id;
    stagingLocationId = staging.id;
    sourceMovementRef = `${runTag}-RECEIPT`;
    await new InventoryService(prisma).receiveStock(substitute.id, storage.id, 10, sourceMovementRef);
    await prisma.inventory.create({ data: { productId: substitute.id, locationId: staging.id, quantity: 90, reserved: 0, available: 90 } });

    const sourceReviewer = await prisma.user.create({ data: { email: `${runTag.toLowerCase()}-reviewer@test.invalid`, name: `Reviewer ${runTag}`, passwordHash: "test-hash", isActive: true }, select: { id: true } });
    sourceReviewerId = sourceReviewer.id;
    const source = await prisma.productTechnicalSource.create({
      data: { supplierName: `Manufacturer ${runTag}`, documentRef: `${runTag}-SPEC`, documentVersion: "Rev. 1", status: "APPROVED", reviewedAt: new Date(), reviewedByUserId: sourceReviewer.id },
      select: { id: true },
    });
    sourceId = source.id;
    await prisma.productEquivalence.create({ data: { productId: original.id, equivProductId: substitute.id, active: true, basisNorm: "Same family" } });
    await prisma.productEquivalence.create({ data: { productId: original.id, equivProductId: crossFamily.id, active: true, basisNorm: "Commercial reference only" } });
    const assemblyRule = await createApprovedRule(original.id, substitute.id, ASSEMBLY_PAIR_RULE_TYPE);
    await createApprovedRule(original.id, crossFamily.id, PRODUCT_SUBSTITUTION_RULE_TYPE);

    const reviewable = await getEquivalentProducts(original.id, { warehouseId, inStockOnly: true, includeReviewRequired: true });
    expect(reviewable.map(({ productId }) => productId)).toEqual([substitute.id]);
    expect(reviewable[0]).toMatchObject({ technicalStatus: "REQUIRES_REVIEW", totalAvailable: 10, locations: [{ code: storage.code, available: 10 }] });
    expect((await getEquivalentProducts(original.id, { warehouseId })).map(({ productId }) => productId)).not.toContain(substitute.id);

    const order = await createSalesRequestDraftHeader(prisma, {
      customerName: `Customer ${runTag}`, warehouseId, dueDate: new Date(Date.now() + 86400000),
      requestedByUserId: manager.id, auditActor: { actorUserId: manager.id, actor: `Sales ${runTag}` },
    });
    orderId = order.id;
    await expect(addSalesRequestProductLine(prisma, {
      orderId, productId: substitute.id, requestedQty: 1, equivalenceOriginalProductId: original.id,
      auditActor: { actorUserId: manager.id, actor: `Sales ${runTag}` },
    })).rejects.toMatchObject({ code: "EQUIVALENCE_REQUIRES_REVIEW" });

    await prisma.productCompatibilityRule.update({ where: { id: assemblyRule.id }, data: { ruleType: PRODUCT_SUBSTITUTION_RULE_TYPE, decision: "BLOCKED" } });
    // The schema permits one rule per directed pair/purpose. The inverse
    // direction is also evaluated, so its approval must not bypass this veto.
    const approvedSubstitutionRule = await createApprovedRule(substitute.id, original.id, PRODUCT_SUBSTITUTION_RULE_TYPE);
    expect((await getEquivalentProducts(original.id, { warehouseId })).map(({ productId }) => productId)).not.toContain(substitute.id);
    const beforeBlockedSelection = {
      lines: await prisma.salesInternalOrderLine.count({ where: { orderId } }),
      inventory: await prisma.inventory.findUniqueOrThrow({ where: { productId_locationId: { productId: substitute.id, locationId: storage.id } }, select: { quantity: true, reserved: true, available: true } }),
      movements: await prisma.inventoryMovement.count({ where: { productId: substitute.id } }),
      audits: await prisma.auditLog.count({ where: { actorUserId: manager.id } }),
    };
    await expect(addSalesRequestProductLine(prisma, {
      orderId, productId: substitute.id, requestedQty: 1, equivalenceOriginalProductId: original.id,
      auditActor: { actorUserId: manager.id, actor: `Sales ${runTag}` },
    })).rejects.toMatchObject({ code: "EQUIVALENCE_REQUIRES_REVIEW" });
    expect(await prisma.salesInternalOrderLine.count({ where: { orderId } })).toBe(beforeBlockedSelection.lines);
    expect(await prisma.inventory.findUniqueOrThrow({ where: { productId_locationId: { productId: substitute.id, locationId: storage.id } }, select: { quantity: true, reserved: true, available: true } })).toEqual(beforeBlockedSelection.inventory);
    expect(await prisma.inventoryMovement.count({ where: { productId: substitute.id } })).toBe(beforeBlockedSelection.movements);
    expect(await prisma.auditLog.count({ where: { actorUserId: manager.id } })).toBe(beforeBlockedSelection.audits);

    await prisma.productCompatibilityRule.update({ where: { id: assemblyRule.id }, data: { governanceStatus: "RETIRED", active: false, ruleRevision: 2 } });
    const selected = await addSalesRequestProductLine(prisma, {
      orderId, productId: substitute.id, requestedQty: 1, equivalenceOriginalProductId: original.id,
      auditActor: { actorUserId: manager.id, actor: `Sales ${runTag}` },
    });
    const line = await prisma.salesInternalOrderLine.findUniqueOrThrow({ where: { id: selected.id }, select: { technicalSelectionSnapshot: true } });
    const snapshot = JSON.parse(line.technicalSelectionSnapshot ?? "null");
    expect(snapshot).toMatchObject({
      originalProduct: { id: original.id, type: "HOSE" },
      selectedProduct: { id: substitute.id, type: "HOSE" },
      technicalRules: [{ id: approvedSubstitutionRule.id, ruleType: PRODUCT_SUBSTITUTION_RULE_TYPE, source: { documentVersion: "Rev. 1" } }],
      context: { availableAtSelection: 10, warehouseId, requestedQty: 1 },
    });
    await expect(getEquivalentProducts(original.id, { warehouseId })).resolves.toMatchObject([
      { productId: substitute.id, technicalStatus: "APPROVED", totalAvailable: 9, locations: [{ code: storage.code, available: 9 }] },
    ]);
    await prisma.productCompatibilityRule.update({ where: { id: approvedSubstitutionRule.id }, data: { governanceStatus: "RETIRED", active: false, ruleRevision: 2 } });
    const unchanged = await prisma.salesInternalOrderLine.findUniqueOrThrow({ where: { id: selected.id }, select: { technicalSelectionSnapshot: true } });
    expect(unchanged.technicalSelectionSnapshot).toBe(line.technicalSelectionSnapshot);

    await expect(addSalesRequestProductLine(prisma, {
      orderId, productId: crossFamily.id, requestedQty: 1, equivalenceOriginalProductId: original.id,
      auditActor: { actorUserId: manager.id, actor: `Sales ${runTag}` },
    })).rejects.toMatchObject({ code: "INVALID_EQUIVALENCE" });
  });
});
