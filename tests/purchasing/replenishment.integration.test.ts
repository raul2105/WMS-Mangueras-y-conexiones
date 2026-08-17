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

  afterAll(async () => {
    if (proposalId) await prisma.replenishmentProposal.deleteMany({ where: { id: proposalId } });
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
    await prisma.$disconnect();
  });

  it("persists a controlled proposal and converts it idempotently to one draft OC", async () => {
    const suffix = unique();
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

    const generated = await generateReplenishmentProposals(prisma, new Date("2026-08-17T12:00:00.000Z"));
    const result = generated.find((item) => item.policyId === policy.id);
    expect(result).toMatchObject({ status: "PROPOSED", proposalId: expect.any(String), recommendedQuantity: 18 });
    proposalId = result?.proposalId ?? undefined;
    expect(proposalId).toBeTruthy();

    const persisted = await prisma.replenishmentProposal.findUnique({ where: { id: proposalId } });
    expect(persisted).toMatchObject({ status: "PROPOSED", productId: product.id, warehouseId: warehouse.id, recommendedQuantity: 18 });

    const converted = await approveReplenishmentProposal(prisma, { proposalId: proposalId!, actorUserId: null, now: new Date("2026-08-17T12:00:00.000Z") });
    purchaseOrderId = converted.purchaseOrderId;
    expect(converted.status).toBe("CONVERTED");
    const order = await prisma.purchaseOrder.findUnique({ where: { id: converted.purchaseOrderId }, include: { lines: true } });
    expect(order).toMatchObject({ status: "BORRADOR", supplierId: supplier.id, deliveryWarehouseId: warehouse.id });
    expect(order?.lines).toHaveLength(1);
    expect(order?.lines[0]).toMatchObject({ productId: product.id, qtyOrdered: 18, unitPrice: 125 });

    const retry = await approveReplenishmentProposal(prisma, { proposalId: proposalId!, actorUserId: null });
    expect(retry.purchaseOrderId).toBe(converted.purchaseOrderId);
    expect(await prisma.purchaseOrder.count({ where: { id: converted.purchaseOrderId } })).toBe(1);
    expect(await prisma.replenishmentProposal.count({ where: { purchaseOrderId: converted.purchaseOrderId } })).toBe(1);
  });
});
