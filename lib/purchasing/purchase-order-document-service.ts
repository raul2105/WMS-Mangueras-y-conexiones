import { createHash } from "node:crypto";
import prisma from "@/lib/prisma";
import { createAuditLogSafeWithDb } from "@/lib/audit-log";
import { Prisma, PrismaClient } from "@prisma/client";

export type PrismaTransactionLike = PrismaClient | Prisma.TransactionClient;

export type PurchaseOrderDocumentSupplierSnapshot = {
  code: string;
  name: string;
  businessName: string | null;
  legalName: string | null;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  paymentTerms: string | null;
};

export type PurchaseOrderDocumentLineSnapshot = {
  productId: string;
  sku: string;
  name: string;
  unitLabel: string;
  qtyOrdered: number;
  qtyReceived: number;
  pendingQty: number;
  unitPrice: number;
  currency: string;
  subtotal: number;
};

export type PurchaseOrderDocumentSnapshot = {
  documentVersion: number;
  generatedAt: string;
  purchaseOrder: {
    id: string;
    folio: string;
    status: string;
    deliveryWarehouseId: string | null;
    expectedDate: string | null;
    notes: string | null;
    deliveryAddressSnapshot: string | null;
    paymentTermsSnapshot: string | null;
    createdAt: string;
  };
  supplier: PurchaseOrderDocumentSupplierSnapshot;
  lines: PurchaseOrderDocumentLineSnapshot[];
  totals: {
    subtotal: number;
    total: number;
    currency: string;
  };
  metadata: {
    source: string;
    snapshotHash: string;
    lineCount: number;
  };
};

export type PurchaseOrderDocumentRecord = {
  id: string;
  purchaseOrderId: string;
  versionNumber: number;
  snapshotJson: string;
  snapshotHash: string | null;
  createdForStatus: string;
  createdAt: Date;
};

export class PurchaseOrderDocumentError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PurchaseOrderDocumentError";
    this.code = code;
  }
}

function getDb(prismaClient: PrismaTransactionLike = prisma) {
  return prismaClient;
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`);

  return `{${entries.join(",")}}`;
}

function toIsoDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function buildSnapshotHash(payload: Omit<PurchaseOrderDocumentSnapshot, "metadata">): string {
  return createHash("sha256").update(stableSerialize(payload)).digest("hex");
}

function normalizeCurrency(value: string | null | undefined) {
  const currency = String(value ?? "").trim();
  return currency || "MXN";
}

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

export function resolvePurchaseOrderFrozenFields(input: {
  deliveryWarehouse: { id: string; address: string | null } | null;
  supplierPaymentTerms: string | null | undefined;
}) {
  return {
    deliveryWarehouseId: input.deliveryWarehouse?.id ?? null,
    deliveryAddressSnapshot: normalizeOptionalText(input.deliveryWarehouse?.address),
    paymentTermsSnapshot: normalizeOptionalText(input.supplierPaymentTerms),
  };
}

function mapPurchaseOrderToSnapshot(input: {
  documentVersion: number;
  purchaseOrder: {
    id: string;
    folio: string;
    status: string;
    deliveryWarehouseId: string | null;
    expectedDate: Date | null;
    notes: string | null;
    deliveryAddressSnapshot: string | null;
    paymentTermsSnapshot: string | null;
    createdAt: Date;
    supplier: {
      code: string;
      name: string;
      legalName: string | null;
      businessName: string | null;
      taxId: string | null;
      email: string | null;
      phone: string | null;
      address: string | null;
      paymentTerms: string | null;
    };
    deliveryWarehouse: {
      address: string | null;
    } | null;
    lines: Array<{
      productId: string;
      qtyOrdered: number;
      qtyReceived: number;
      purchaseUnitLabel: string | null;
      unitPrice: number | null;
      currency: string | null;
      product: {
        sku: string;
        name: string;
        unitLabel: string;
      };
    }>;
  };
}): PurchaseOrderDocumentSnapshot {
  const lines = input.purchaseOrder.lines.map((line) => {
    const unitPrice = line.unitPrice ?? 0;
    const currency = normalizeCurrency(line.currency);
    const pendingQty = Math.max(line.qtyOrdered - line.qtyReceived, 0);
    const subtotal = Number((unitPrice * line.qtyOrdered).toFixed(2));

    return {
      productId: line.productId,
      sku: line.product.sku,
      name: line.product.name,
      unitLabel: line.purchaseUnitLabel ?? line.product.unitLabel,
      qtyOrdered: line.qtyOrdered,
      qtyReceived: line.qtyReceived,
      pendingQty,
      unitPrice: Number(unitPrice.toFixed(2)),
      currency,
      subtotal,
    };
  });

  const currency = lines[0]?.currency ?? "MXN";
  const subtotal = Number(lines.reduce((sum, line) => sum + line.subtotal, 0).toFixed(2));
  const deliveryAddressSnapshot = normalizeOptionalText(input.purchaseOrder.deliveryAddressSnapshot)
    ?? normalizeOptionalText(input.purchaseOrder.deliveryWarehouse?.address);
  const paymentTermsSnapshot = normalizeOptionalText(input.purchaseOrder.paymentTermsSnapshot)
    ?? normalizeOptionalText(input.purchaseOrder.supplier.paymentTerms);
  const payloadWithoutHash = {
    documentVersion: input.documentVersion,
    generatedAt: new Date().toISOString(),
    purchaseOrder: {
      id: input.purchaseOrder.id,
      folio: input.purchaseOrder.folio,
      status: input.purchaseOrder.status,
      deliveryWarehouseId: input.purchaseOrder.deliveryWarehouseId,
      expectedDate: toIsoDate(input.purchaseOrder.expectedDate),
      notes: input.purchaseOrder.notes,
      deliveryAddressSnapshot,
      paymentTermsSnapshot,
      createdAt: input.purchaseOrder.createdAt.toISOString(),
    },
    supplier: {
      code: input.purchaseOrder.supplier.code,
      name: input.purchaseOrder.supplier.name,
      businessName: input.purchaseOrder.supplier.businessName,
      legalName: input.purchaseOrder.supplier.legalName,
      taxId: input.purchaseOrder.supplier.taxId,
      email: input.purchaseOrder.supplier.email,
      phone: input.purchaseOrder.supplier.phone,
      address: input.purchaseOrder.supplier.address,
      paymentTerms: paymentTermsSnapshot,
    },
    lines,
    totals: {
      subtotal,
      total: subtotal,
      currency,
    },
  };

  const snapshotHash = buildSnapshotHash(payloadWithoutHash);

  return {
    ...payloadWithoutHash,
    metadata: {
      source: "purchasing/purchase-order-document-service",
      snapshotHash,
      lineCount: lines.length,
    },
  };
}

async function loadPurchaseOrderForDocument(db: PrismaTransactionLike, purchaseOrderId: string) {
  return db.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    select: {
      id: true,
      folio: true,
      status: true,
      deliveryWarehouseId: true,
      expectedDate: true,
      notes: true,
      deliveryAddressSnapshot: true,
      paymentTermsSnapshot: true,
      createdAt: true,
      supplier: {
        select: {
          code: true,
          name: true,
          legalName: true,
          businessName: true,
          taxId: true,
          email: true,
          phone: true,
          address: true,
          paymentTerms: true,
        },
      },
      deliveryWarehouse: {
        select: {
          address: true,
        },
      },
      lines: {
        orderBy: [{ product: { sku: "asc" } }, { productId: "asc" }],
        select: {
          productId: true,
          qtyOrdered: true,
          qtyReceived: true,
          purchaseUnitLabel: true,
          unitPrice: true,
          currency: true,
          product: {
            select: {
              sku: true,
              name: true,
              unitLabel: true,
            },
          },
        },
      },
    },
  });
}

export function parsePurchaseOrderDocumentSnapshot(snapshotJson: string): PurchaseOrderDocumentSnapshot {
  try {
    const parsed = JSON.parse(snapshotJson) as PurchaseOrderDocumentSnapshot;
    if (!parsed || typeof parsed !== "object") {
      throw new Error("invalid snapshot");
    }
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new PurchaseOrderDocumentError("INVALID_DOCUMENT_SNAPSHOT", `Invalid purchase order document snapshot: ${message}`);
  }
}

export async function buildPurchaseOrderDocumentSnapshot(input: {
  purchaseOrderId: string;
  prismaClient?: PrismaTransactionLike;
  documentVersion?: number;
}): Promise<PurchaseOrderDocumentSnapshot> {
  const db = getDb(input.prismaClient);
  const purchaseOrder = await loadPurchaseOrderForDocument(db, input.purchaseOrderId);

  if (!purchaseOrder) {
    throw new PurchaseOrderDocumentError("PURCHASE_ORDER_NOT_FOUND", "Purchase order not found");
  }

  if (purchaseOrder.lines.length === 0) {
    throw new PurchaseOrderDocumentError("PURCHASE_ORDER_HAS_NO_LINES", "Purchase order has no lines");
  }

  return mapPurchaseOrderToSnapshot({
    documentVersion: input.documentVersion ?? 1,
    purchaseOrder,
  });
}

export async function loadLatestPurchaseOrderDocument(input: {
  purchaseOrderId: string;
  prismaClient?: PrismaTransactionLike;
}): Promise<PurchaseOrderDocumentRecord | null> {
  const db = getDb(input.prismaClient);
  return db.purchaseOrderDocument.findFirst({
    where: { purchaseOrderId: input.purchaseOrderId },
    orderBy: { versionNumber: "desc" },
  });
}

export async function ensurePurchaseOrderDocumentVersion(input: {
  purchaseOrderId: string;
  versionNumber?: number;
  createdForStatus?: string;
  prismaClient?: PrismaTransactionLike;
}): Promise<PurchaseOrderDocumentRecord> {
  const db = getDb(input.prismaClient);
  const versionNumber = input.versionNumber ?? 1;
  const createdForStatus = input.createdForStatus ?? "CONFIRMADA";

  const existing = await db.purchaseOrderDocument.findUnique({
    where: {
      purchaseOrderId_versionNumber: {
        purchaseOrderId: input.purchaseOrderId,
        versionNumber,
      },
    },
  });

  if (existing) {
    return existing;
  }

  const snapshot = await buildPurchaseOrderDocumentSnapshot({
    purchaseOrderId: input.purchaseOrderId,
    prismaClient: db,
    documentVersion: versionNumber,
  });

  try {
    return await db.purchaseOrderDocument.create({
      data: {
        purchaseOrderId: input.purchaseOrderId,
        versionNumber,
        snapshotJson: JSON.stringify(snapshot),
        snapshotHash: snapshot.metadata.snapshotHash,
        createdForStatus,
      },
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002") {
      const retry = await db.purchaseOrderDocument.findUnique({
        where: {
          purchaseOrderId_versionNumber: {
            purchaseOrderId: input.purchaseOrderId,
            versionNumber,
          },
        },
      });

      if (retry) {
        return retry;
      }
    }

    throw error;
  }
}

const PURCHASE_ORDER_STATUS_TRANSITIONS: Record<string, string[]> = {
  BORRADOR: ["CONFIRMADA", "CANCELADA"],
  CONFIRMADA: ["EN_TRANSITO", "CANCELADA"],
  EN_TRANSITO: ["RECIBIDA", "CANCELADA"],
  PARCIAL: ["EN_TRANSITO", "CANCELADA"],
  RECIBIDA: [],
  CANCELADA: [],
};

export async function updatePurchaseOrderStatusWithDocument(input: {
  purchaseOrderId: string;
  newStatus: string;
  prismaClient?: PrismaClient;
}): Promise<{ ok: true } | { error: string }> {
  const db = input.prismaClient ?? prisma;

  return db.$transaction(async (tx) => {
    const order = await tx.purchaseOrder.findUnique({
      where: { id: input.purchaseOrderId },
      select: {
        status: true,
        lines: { select: { qtyOrdered: true, qtyReceived: true } },
        deliveryWarehouseId: true,
        deliveryAddressSnapshot: true,
        paymentTermsSnapshot: true,
        supplier: {
          select: {
            paymentTerms: true,
          },
        },
        deliveryWarehouse: {
          select: {
            address: true,
          },
        },
      },
    });

    if (!order) {
      return { error: "Orden no encontrada" };
    }

    const allowed = PURCHASE_ORDER_STATUS_TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(input.newStatus)) {
      return { error: `Transición ${order.status} → ${input.newStatus} no permitida` };
    }

    if (input.newStatus === "CONFIRMADA" && order.lines.length === 0) {
      return { error: "Agrega al menos una línea antes de confirmar" };
    }

    if (input.newStatus === "RECIBIDA") {
      const allComplete = order.lines.every((line) => line.qtyReceived >= line.qtyOrdered);
      if (!allComplete) {
        return { error: "Hay líneas con pendiente de recibir — usa Recepción Parcial" };
      }
    }

    const frozenFields =
      input.newStatus === "CONFIRMADA"
        ? resolvePurchaseOrderFrozenFields({
            deliveryWarehouse: order.deliveryWarehouseId
              ? { id: order.deliveryWarehouseId, address: order.deliveryWarehouse?.address ?? null }
              : null,
            supplierPaymentTerms: order.paymentTermsSnapshot ?? order.supplier.paymentTerms,
          })
        : null;

    await tx.purchaseOrder.update({
      where: { id: input.purchaseOrderId },
      data: {
        status: input.newStatus as never,
        ...(frozenFields
          ? {
              deliveryWarehouseId: frozenFields.deliveryWarehouseId,
              deliveryAddressSnapshot: frozenFields.deliveryAddressSnapshot,
              paymentTermsSnapshot: frozenFields.paymentTermsSnapshot,
            }
          : {}),
      },
    });

    if (input.newStatus === "CONFIRMADA") {
      const documentRecord = await ensurePurchaseOrderDocumentVersion({
        purchaseOrderId: input.purchaseOrderId,
        versionNumber: 1,
        createdForStatus: "CONFIRMADA",
        prismaClient: tx,
      });

      await createAuditLogSafeWithDb(
        {
          entityType: "PURCHASE_ORDER_DOCUMENT",
          entityId: documentRecord.id,
          action: "CREATE_PURCHASE_ORDER_DOCUMENT_VERSION",
          after: {
            purchaseOrderId: input.purchaseOrderId,
            versionNumber: documentRecord.versionNumber,
            createdForStatus: documentRecord.createdForStatus,
            snapshotHash: documentRecord.snapshotHash,
          },
          source: "purchasing/order-confirmation",
        },
        tx,
      );
    }

    await createAuditLogSafeWithDb(
      {
        entityType: "PURCHASE_ORDER",
        entityId: input.purchaseOrderId,
        action: "STATUS_CHANGE",
        before: { status: order.status },
        after: { status: input.newStatus },
        source: "purchasing/orders",
      },
      tx,
    );

    return { ok: true as const };
  });
}
