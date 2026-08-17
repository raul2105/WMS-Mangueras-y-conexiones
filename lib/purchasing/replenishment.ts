import { PrismaClient } from "@prisma/client";
import { createAuditLogRequiredWithDb } from "@/lib/audit-log";

export type ReplenishmentPolicyInput = {
  minimumStock: number;
  maximumStock: number;
  leadTimeDays: number;
  reviewWindowDays: number;
  purchaseUnitFactor?: number | null;
  purchaseMoq?: number | null;
};

export type ReplenishmentSnapshot = {
  availableStock: number;
  incomingQuantity?: number | null;
  consumedQuantity: number;
  windowDays: number;
};

export type ReplenishmentProposal = {
  status: "PROPOSED" | "NO_ACTION" | "BLOCKED";
  availableStock: number;
  incomingQuantity: number;
  consumedQuantity: number;
  windowDays: number;
  averageDailyConsumption: number;
  recommendedQuantity: number;
  reason: string;
};

function assertFiniteNonNegative(value: number, field: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} debe ser un número finito no negativo`);
  }
}

function ceilToUnit(quantity: number, unit: number) {
  return Math.ceil(quantity / unit) * unit;
}

/**
 * Deterministic min–max policy calculation. Inventory position includes
 * inbound purchase quantities, and recommendations respect the purchase unit
 * and MOQ so purchasing receives an executable quantity.
 */
export function calculateReplenishmentProposal(
  policy: ReplenishmentPolicyInput,
  snapshot: ReplenishmentSnapshot,
): ReplenishmentProposal {
  assertFiniteNonNegative(policy.minimumStock, "minimumStock");
  assertFiniteNonNegative(policy.maximumStock, "maximumStock");
  assertFiniteNonNegative(policy.leadTimeDays, "leadTimeDays");
  assertFiniteNonNegative(policy.reviewWindowDays, "reviewWindowDays");
  assertFiniteNonNegative(snapshot.availableStock, "availableStock");
  assertFiniteNonNegative(snapshot.incomingQuantity ?? 0, "incomingQuantity");
  assertFiniteNonNegative(snapshot.consumedQuantity, "consumedQuantity");
  assertFiniteNonNegative(snapshot.windowDays, "windowDays");

  if (policy.maximumStock < policy.minimumStock) {
    return {
      status: "BLOCKED",
      availableStock: snapshot.availableStock,
      incomingQuantity: snapshot.incomingQuantity ?? 0,
      consumedQuantity: snapshot.consumedQuantity,
      windowDays: snapshot.windowDays,
      averageDailyConsumption: 0,
      recommendedQuantity: 0,
      reason: "La política tiene máximo menor que mínimo",
    };
  }

  if (snapshot.windowDays <= 0) {
    return {
      status: "BLOCKED",
      availableStock: snapshot.availableStock,
      incomingQuantity: snapshot.incomingQuantity ?? 0,
      consumedQuantity: snapshot.consumedQuantity,
      windowDays: snapshot.windowDays,
      averageDailyConsumption: 0,
      recommendedQuantity: 0,
      reason: "La ventana de consumo debe ser mayor que cero",
    };
  }

  const incomingQuantity = snapshot.incomingQuantity ?? 0;
  const averageDailyConsumption = snapshot.consumedQuantity / snapshot.windowDays;
  const inventoryPosition = snapshot.availableStock + incomingQuantity;
  if (inventoryPosition >= policy.minimumStock) {
    return {
      status: "NO_ACTION",
      availableStock: snapshot.availableStock,
      incomingQuantity,
      consumedQuantity: snapshot.consumedQuantity,
      windowDays: snapshot.windowDays,
      averageDailyConsumption,
      recommendedQuantity: 0,
      reason: "La posición de inventario está por encima del mínimo",
    };
  }

  const leadTimeDemand = averageDailyConsumption * policy.leadTimeDays;
  const desiredPosition = Math.max(policy.maximumStock, policy.minimumStock + leadTimeDemand);
  const rawRecommendation = Math.max(0, desiredPosition - inventoryPosition);
  const unit = policy.purchaseUnitFactor && policy.purchaseUnitFactor > 0 ? policy.purchaseUnitFactor : 1;
  const moq = policy.purchaseMoq && policy.purchaseMoq > 0 ? policy.purchaseMoq : 0;
  const recommendedQuantity = ceilToUnit(Math.max(rawRecommendation, moq), unit);

  return {
    status: recommendedQuantity > 0 ? "PROPOSED" : "NO_ACTION",
    availableStock: snapshot.availableStock,
    incomingQuantity,
    consumedQuantity: snapshot.consumedQuantity,
    windowDays: snapshot.windowDays,
    averageDailyConsumption,
    recommendedQuantity,
    reason: recommendedQuantity > 0
      ? "La posición está debajo del mínimo y se propone recuperar el máximo"
      : "No existe cantidad recomendada después de aplicar unidad y MOQ",
  };
}

export type GeneratedReplenishmentProposal = ReplenishmentProposal & {
  policyId: string;
  productId: string;
  warehouseId: string;
  proposalId: string | null;
};

/**
 * Reads the canonical PostgreSQL inventory position, inbound purchase orders,
 * and recent OUT movements, then persists only actionable or blocked results.
 * NO_ACTION is returned for transparency but does not create noise in the
 * proposal worklist.
 */
export async function generateReplenishmentProposals(
  prisma: PrismaClient,
  now = new Date(),
  actorUserId: string | null = null,
): Promise<GeneratedReplenishmentProposal[]> {
  return prisma.$transaction(async (tx) => {
    const policies = await tx.replenishmentPolicy.findMany({
      where: { active: true },
      select: {
        id: true,
        productId: true,
        warehouseId: true,
        minimumStock: true,
        maximumStock: true,
        leadTimeDays: true,
        reviewWindowDays: true,
        product: { select: { purchaseUnitFactor: true, purchaseMoq: true } },
      },
      orderBy: [{ warehouseId: "asc" }, { productId: "asc" }],
    });

    const generated: GeneratedReplenishmentProposal[] = [];
    for (const policy of policies) {
      const windowDays = Math.max(1, policy.reviewWindowDays);
      const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
      const [inventoryRows, inboundRows, consumption] = await Promise.all([
        tx.inventory.findMany({
          where: {
            productId: policy.productId,
            location: { warehouseId: policy.warehouseId, usageType: "STORAGE" },
          },
          select: { available: true },
        }),
        tx.purchaseOrderLine.findMany({
          where: {
            productId: policy.productId,
            purchaseOrder: {
              deliveryWarehouseId: policy.warehouseId,
              status: { in: ["CONFIRMADA", "EN_TRANSITO"] },
            },
          },
          select: { qtyOrdered: true, qtyReceived: true },
        }),
        tx.inventoryMovement.aggregate({
          where: {
            productId: policy.productId,
            type: "OUT",
            location: { warehouseId: policy.warehouseId },
            createdAt: { gte: windowStart, lte: now },
          },
          _sum: { quantity: true },
        }),
      ]);

      const proposal = calculateReplenishmentProposal(
        {
          minimumStock: policy.minimumStock,
          maximumStock: policy.maximumStock,
          leadTimeDays: policy.leadTimeDays,
          reviewWindowDays: windowDays,
          purchaseUnitFactor: policy.product.purchaseUnitFactor,
          purchaseMoq: policy.product.purchaseMoq,
        },
        {
          availableStock: inventoryRows.reduce((total, row) => total + row.available, 0),
          incomingQuantity: inboundRows.reduce((total, row) => total + Math.max(0, row.qtyOrdered - row.qtyReceived), 0),
          consumedQuantity: consumption._sum.quantity ?? 0,
          windowDays,
        },
      );

      let proposalId: string | null = null;
      if (proposal.status !== "NO_ACTION") {
        const persisted = await tx.replenishmentProposal.create({
          data: {
            policyId: policy.id,
            productId: policy.productId,
            warehouseId: policy.warehouseId,
            status: proposal.status,
            availableStock: proposal.availableStock,
            incomingQuantity: proposal.incomingQuantity,
            consumedQuantity: proposal.consumedQuantity,
            windowDays: proposal.windowDays,
            averageDailyConsumption: proposal.averageDailyConsumption,
            recommendedQuantity: proposal.recommendedQuantity,
            purchaseUnitFactor: policy.product.purchaseUnitFactor,
            purchaseMoq: policy.product.purchaseMoq,
            reason: proposal.reason,
            generatedAt: now,
          },
          select: { id: true },
        });
        proposalId = persisted.id;

        await createAuditLogRequiredWithDb({
          entityType: "REPLENISHMENT_PROPOSAL",
          entityId: persisted.id,
          action: "GENERATE",
          actor: actorUserId ?? "system",
          actorUserId,
          source: "purchasing/replenishment",
          after: {
            policyId: policy.id,
            productId: policy.productId,
            warehouseId: policy.warehouseId,
            status: proposal.status,
            recommendedQuantity: proposal.recommendedQuantity,
            availableStock: proposal.availableStock,
            incomingQuantity: proposal.incomingQuantity,
            averageDailyConsumption: proposal.averageDailyConsumption,
          },
        }, tx);
      }

      generated.push({
        ...proposal,
        policyId: policy.id,
        productId: policy.productId,
        warehouseId: policy.warehouseId,
        proposalId,
      });
    }

    return generated;
  });
}

export type ApprovedReplenishmentProposal = {
  proposalId: string;
  purchaseOrderId: string;
  purchaseOrderFolio: string;
  status: "CONVERTED";
};

/**
 * Approves one actionable proposal and converts it to a draft purchase order.
 * The proposal and OC are linked in one transaction so a retry cannot create
 * a second order from the same decision.
 */
export async function approveReplenishmentProposal(
  prisma: PrismaClient,
  input: { proposalId: string; actorUserId: string | null; now?: Date },
): Promise<ApprovedReplenishmentProposal> {
  const now = input.now ?? new Date();

  return prisma.$transaction(async (tx) => {
    const proposal = await tx.replenishmentProposal.findUnique({
      where: { id: input.proposalId },
      select: {
        id: true,
        status: true,
        productId: true,
        warehouseId: true,
        recommendedQuantity: true,
        purchaseUnitFactor: true,
        purchaseMoq: true,
        reason: true,
        purchaseOrderId: true,
        policy: { select: { leadTimeDays: true } },
        product: {
          select: {
            sku: true,
            name: true,
            unitLabel: true,
            purchaseUnitLabel: true,
            primarySupplier: { select: { id: true, name: true, isActive: true, paymentTerms: true } },
            supplierProducts: {
              where: { supplier: { isActive: true } },
              orderBy: [{ unitPrice: "asc" }, { supplierId: "asc" }],
              take: 1,
              select: { supplierId: true, unitPrice: true, supplier: { select: { id: true, name: true, paymentTerms: true } } },
            },
          },
        },
        warehouse: { select: { id: true, address: true, isActive: true } },
      },
    });

    if (!proposal) throw new Error("Propuesta de reabasto no encontrada");
    if (proposal.status === "CONVERTED" && proposal.purchaseOrderId) {
      const existing = await tx.purchaseOrder.findUnique({ where: { id: proposal.purchaseOrderId }, select: { id: true, folio: true } });
      if (existing) return { proposalId: proposal.id, purchaseOrderId: existing.id, purchaseOrderFolio: existing.folio, status: "CONVERTED" };
    }
    if (proposal.status !== "PROPOSED") throw new Error("Solo se pueden aprobar propuestas accionables");
    if (proposal.recommendedQuantity <= 0) throw new Error("La propuesta no tiene una cantidad aprobable");
    if (!proposal.warehouse.isActive) throw new Error("El almacén de la propuesta está inactivo");

    const supplier = proposal.product.primarySupplier?.isActive
      ? proposal.product.primarySupplier
      : proposal.product.supplierProducts[0]?.supplier ?? null;
    if (!supplier) throw new Error(`El producto ${proposal.product.sku} no tiene proveedor activo configurado`);

    // Claim the proposal before creating the OC. This closes the concurrent
    // double-approval window while keeping the claim in the same transaction.
    const claim = await tx.replenishmentProposal.updateMany({
      where: { id: proposal.id, status: "PROPOSED", purchaseOrderId: null },
      data: { status: "APPROVING", approvedAt: now, approvedByUserId: input.actorUserId },
    });
    if (claim.count !== 1) {
      throw new Error("La propuesta ya está siendo aprobada por otra sesión");
    }

    const currentYear = now.getFullYear();
    const orderCount = await tx.purchaseOrder.count();
    const folio = `OC-${currentYear}-${String(orderCount + 1).padStart(4, "0")}`;
    const expectedDate = new Date(now.getTime() + proposal.policy.leadTimeDays * 24 * 60 * 60 * 1000);
    const supplierPrice = proposal.product.supplierProducts.find((item) => item.supplierId === supplier.id)?.unitPrice
      ?? proposal.product.supplierProducts[0]?.unitPrice
      ?? null;
    const frozenPaymentTerms = supplier.paymentTerms ?? null;

    const order = await tx.purchaseOrder.create({
      data: {
        folio,
        supplierId: supplier.id,
        deliveryWarehouseId: proposal.warehouse.id,
        expectedDate,
        notes: `Generada desde propuesta de reabasto ${proposal.id}. ${proposal.reason}`,
        deliveryAddressSnapshot: proposal.warehouse.address ?? null,
        paymentTermsSnapshot: frozenPaymentTerms,
        lines: {
          create: {
            productId: proposal.productId,
            qtyOrdered: proposal.recommendedQuantity,
            unitPrice: supplierPrice,
            purchaseUnitLabel: proposal.product.purchaseUnitLabel ?? proposal.product.unitLabel,
            purchaseUnitFactor: proposal.purchaseUnitFactor,
          },
        },
      },
      select: { id: true, folio: true },
    });

    await tx.replenishmentProposal.update({
      where: { id: proposal.id },
      data: { status: "CONVERTED", approvedAt: now, approvedByUserId: input.actorUserId, purchaseOrderId: order.id },
    });

    await createAuditLogRequiredWithDb({
      entityType: "REPLENISHMENT_PROPOSAL",
      entityId: proposal.id,
      action: "APPROVE_AND_CONVERT",
      actor: input.actorUserId ?? "system",
      actorUserId: input.actorUserId,
      source: "purchasing/replenishment/approval",
      before: { status: proposal.status, purchaseOrderId: proposal.purchaseOrderId },
      after: { status: "CONVERTED", purchaseOrderId: order.id, purchaseOrderFolio: order.folio, supplierId: supplier.id },
    }, tx);
    await createAuditLogRequiredWithDb({
      entityType: "PURCHASE_ORDER",
      entityId: order.id,
      action: "CREATE_FROM_REPLENISHMENT_PROPOSAL",
      actor: input.actorUserId ?? "system",
      actorUserId: input.actorUserId,
      source: "purchasing/replenishment/approval",
      after: { folio: order.folio, proposalId: proposal.id, supplierId: supplier.id, productId: proposal.productId, quantity: proposal.recommendedQuantity },
    }, tx);

    return { proposalId: proposal.id, purchaseOrderId: order.id, purchaseOrderFolio: order.folio, status: "CONVERTED" };
  });
}
