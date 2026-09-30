import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  approveReplenishmentProposal,
  generateReplenishmentProposals,
} from "@/lib/purchasing/replenishment";

const describePostgres = process.env.RUN_POSTGRES_TESTS === "1" ? describe : describe.skip;

describePostgres("replenishment proposal persistence and conversion", () => {
  const prisma = new PrismaClient();
  const unique = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  let supplierId: string | undefined;
  let warehouseId: string | undefined;
  let productId: string | undefined;
  let policyId: string | undefined;
  let proposalId: string | undefined;
  let purchaseOrderId: string | undefined;
  let actorUserId: string | undefined;

  afterAll(async () => {
    if (proposalId) {
      await prisma.auditLog.deleteMany({ where: { entityType: "REPLENISHMENT_PROPOSAL", entityId: proposalId } });
      await prisma.replenishmentProposal.deleteMany({ where: { id: proposalId } });
    }
    if (purchaseOrderId) {
      await prisma.auditLog.deleteMany({ where: { entityType: "PURCHASE_ORDER", entityId: purchaseOrderId } });
    }
    if (purchaseOrderId) await prisma.purchaseOrder.deleteMany({ where: { id: purchaseOrderId } });
    if (policyId) await prisma.replenishmentPolicy.deleteMany({ where: { id: policyId } });
    if (productId) {
      await prisma.inventory.deleteMany({ where: { productId } });
      await prisma.supplierProduct.deleteMany({ where: { productId } });
      await prisma.product.deleteMany({ where: { id: productId } });
    }
    if (warehouseId) {
      await prisma.location.deleteMany({ where: { warehouseId } });
      await prisma.warehouse.deleteMany({ where: { id: warehouseId } });
    }
    if (supplierId) await prisma.supplier.deleteMany({ where: { id: supplierId } });
    if (actorUserId) await prisma.user.deleteMany({ where: { id: actorUserId } });
    await prisma.$disconnect();
  });

  it("refreshes one open proposal under concurrent runs and treats its converted draft OC as incoming", async () => {
    const suffix = unique();
    const actor = await prisma.user.create({
      data: { email: `qa-replenishment-${suffix}@example.invalid`, name: "Manager reabasto QA", passwordHash: "unused-test-hash" },
    });
    actorUserId = actor.id;
    const supplier = await prisma.supplier.create({
      data: { code: `SUP-REP-${suffix}`, name: "Proveedor controlado reabasto", paymentTerms: "30 días" },
    });
    supplierId = supplier.id;
    const warehouse = await prisma.warehouse.create({
      data: { code: `WH-REP-${suffix}`, name: "Almacén controlado reabasto", address: "Dirección de prueba" },
    });
    warehouseId = warehouse.id;
    const product = await prisma.product.create({
      data: {
        sku: `SKU-REP-${suffix}`,
        name: "Producto controlado para reabasto",
        type: "HOSE",
        unitLabel: "pieza",
        purchaseUnitLabel: "caja",
        purchaseUnitFactor: 2,
        purchaseMoq: 4,
        primarySupplier: { connect: { id: supplier.id } },
        supplierProducts: { create: { supplierId: supplier.id, unitPrice: 125 } },
      },
    });
    productId = product.id;
    const location = await prisma.location.create({
      data: { code: `LOC-REP-${suffix}`, name: "Ubicación controlada", warehouseId: warehouse.id, usageType: "STORAGE" },
    });
    await prisma.inventory.create({ data: { productId: product.id, locationId: location.id, quantity: 2, available: 2, reserved: 0 } });
    const policy = await prisma.replenishmentPolicy.create({
      data: { productId: product.id, warehouseId: warehouse.id, minimumStock: 10, maximumStock: 20, leadTimeDays: 3, reviewWindowDays: 30 },
    });
    policyId = policy.id;

    const generated = await generateReplenishmentProposals(prisma, new Date("2026-08-17T12:00:00.000Z"), actor.id);
    const result = generated.find((item) => item.policyId === policy.id);
    expect(result).toMatchObject({ status: "PROPOSED", proposalId: expect.any(String), recommendedQuantity: 18 });
    proposalId = result?.proposalId ?? undefined;
    expect(proposalId).toBeTruthy();

    const persisted = await prisma.replenishmentProposal.findUnique({ where: { id: proposalId } });
    expect(persisted).toMatchObject({ status: "PROPOSED", productId: product.id, warehouseId: warehouse.id, recommendedQuantity: 18 });

    const concurrentRuns = await Promise.all([
      generateReplenishmentProposals(prisma, new Date("2026-08-17T12:05:00.000Z"), actor.id),
      generateReplenishmentProposals(prisma, new Date("2026-08-17T12:05:00.000Z"), actor.id),
    ]);
    for (const run of concurrentRuns) {
      expect(run.find((item) => item.policyId === policy.id)?.proposalId).toBe(proposalId);
    }
    expect(await prisma.replenishmentProposal.count({ where: { policyId: policy.id, status: { in: ["PROPOSED", "BLOCKED"] } } })).toBe(1);

    await prisma.inventory.update({
      where: { productId_locationId: { productId: product.id, locationId: location.id } },
      data: { quantity: 5, available: 5 },
    });
    const refreshed = await generateReplenishmentProposals(prisma, new Date("2026-08-17T12:10:00.000Z"), actor.id);
    expect(refreshed.find((item) => item.policyId === policy.id)).toMatchObject({
      status: "PROPOSED",
      proposalId,
      recommendedQuantity: 16,
      availableStock: 5,
    });
    const refreshedRow = await prisma.replenishmentProposal.findUnique({ where: { id: proposalId } });
    expect(refreshedRow).toMatchObject({ recommendedQuantity: 16, availableStock: 5 });

    const approvals = await Promise.all([
      approveReplenishmentProposal(prisma, { proposalId: proposalId!, actorUserId: actor.id, now: new Date("2026-08-17T12:00:00.000Z") }),
      approveReplenishmentProposal(prisma, { proposalId: proposalId!, actorUserId: actor.id, now: new Date("2026-08-17T12:00:00.000Z") }),
    ]);
    const converted = approvals[0];
    purchaseOrderId = converted.purchaseOrderId;
    expect(approvals[1].purchaseOrderId).toBe(converted.purchaseOrderId);
    expect(converted.status).toBe("CONVERTED");
    const order = await prisma.purchaseOrder.findUnique({ where: { id: converted.purchaseOrderId }, include: { lines: true } });
    expect(order).toMatchObject({ status: "BORRADOR", supplierId: supplier.id, deliveryWarehouseId: warehouse.id });
    expect(order?.lines).toHaveLength(1);
    expect(order?.lines[0]).toMatchObject({ productId: product.id, qtyOrdered: 16, unitPrice: 125 });

    const retry = await approveReplenishmentProposal(prisma, { proposalId: proposalId!, actorUserId: actor.id });
    expect(retry.purchaseOrderId).toBe(converted.purchaseOrderId);
    expect(await prisma.purchaseOrder.count({ where: { id: converted.purchaseOrderId } })).toBe(1);
    expect(await prisma.replenishmentProposal.count({ where: { purchaseOrderId: converted.purchaseOrderId } })).toBe(1);

    const afterDraft = await generateReplenishmentProposals(prisma, new Date("2026-08-17T12:15:00.000Z"), actor.id);
    expect(afterDraft.find((item) => item.policyId === policy.id)).toMatchObject({
      status: "NO_ACTION",
      availableStock: 5,
      incomingQuantity: 16,
      recommendedQuantity: 0,
      proposalId: null,
    });
    expect(await prisma.replenishmentProposal.count({ where: { policyId: policy.id, status: { in: ["PROPOSED", "BLOCKED"] } } })).toBe(0);

    const convertedLine = order!.lines[0];
    await prisma.purchaseOrder.update({ where: { id: converted.purchaseOrderId }, data: { status: "PARCIAL" } });
    await prisma.purchaseOrderLine.update({ where: { id: convertedLine.id }, data: { qtyReceived: 8 } });
    await prisma.inventory.update({
      where: { productId_locationId: { productId: product.id, locationId: location.id } },
      data: { quantity: 8, available: 8 },
    });
    const afterPartialReceipt = await generateReplenishmentProposals(prisma, new Date("2026-08-17T12:20:00.000Z"), actor.id);
    expect(afterPartialReceipt.find((item) => item.policyId === policy.id)).toMatchObject({
      status: "NO_ACTION",
      availableStock: 8,
      incomingQuantity: 8,
      recommendedQuantity: 0,
    });

    const auditEvents = await prisma.auditLog.findMany({
      where: { entityType: "REPLENISHMENT_PROPOSAL", entityId: proposalId },
      orderBy: { createdAt: "asc" },
    });
    expect(auditEvents.map((event) => event.action)).toContain("GENERATE");
    expect(auditEvents.map((event) => event.action)).toContain("REFRESH");
    expect(auditEvents.map((event) => event.action)).toContain("APPROVE_AND_CONVERT");
    expect(auditEvents.every((event) => event.actorUserId === actor.id)).toBe(true);
  });
});
