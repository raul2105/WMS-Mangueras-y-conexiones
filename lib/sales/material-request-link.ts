import { Prisma, type PrismaClient } from "@prisma/client";
import { createAuditLogSafeWithDb } from "@/lib/audit-log";
import { getCustomerById, resolveCustomerSnapshot } from "@/lib/customers/customer-service";
import { InventoryServiceError } from "@/lib/inventory-service";
import { getNextSalesInternalOrderCode } from "@/lib/sales/internal-orders";

type Tx = Prisma.TransactionClient;

const MATERIAL_REQUEST_AUDIT_MARKER = "[material-request]";

export type CreateSalesRequestDraftFromMaterialRequestArgs = {
  materialRequestId: string;
  materialRequestCode?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  requireFormalCustomer?: boolean;
  warehouseId: string;
  dueDate: Date;
  notes?: string | null;
  requestedByUserId?: string | null;
  requestedByRoles?: string[] | null;
};

export type CreateSalesRequestDraftFromMaterialRequestResult = {
  id: string;
  code: string;
  sourceMaterialRequestId: string;
  sourceMaterialRequestCode: string | null;
  wasExisting: boolean;
};

function buildMaterialRequestAuditTrail(args: {
  materialRequestId: string;
  materialRequestCode?: string | null;
}) {
  const parts = [`id=${args.materialRequestId}`];
  if (args.materialRequestCode) {
    parts.push(`code=${args.materialRequestCode}`);
  }
  return `${MATERIAL_REQUEST_AUDIT_MARKER} ${parts.join(" ")}`;
}

function appendMaterialRequestAuditTrail(
  notes: string | null | undefined,
  args: {
    materialRequestId: string;
    materialRequestCode?: string | null;
  },
) {
  const auditTrail = buildMaterialRequestAuditTrail(args);
  const normalizedNotes = notes?.trim() ?? "";
  if (normalizedNotes.includes(auditTrail)) {
    return normalizedNotes;
  }

  return [normalizedNotes, auditTrail].filter((value) => value.length > 0).join("\n\n");
}

function isSourceMaterialRequestUniqueError(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }

  const rawTarget = error.meta?.target;
  const targets = Array.isArray(rawTarget)
    ? rawTarget.map((value) => String(value))
    : typeof rawTarget === "string"
      ? [rawTarget]
      : [];

  return targets.includes("sourceMaterialRequestId");
}

async function findExistingSalesRequestByMaterialRequestId(tx: Tx, materialRequestId: string) {
  return tx.salesInternalOrder.findUnique({
    where: { sourceMaterialRequestId: materialRequestId },
    select: {
      id: true,
      code: true,
      sourceMaterialRequestId: true,
      sourceMaterialRequestCode: true,
    },
  });
}

export async function createOrGetSalesRequestDraftFromMaterialRequest(
  prisma: PrismaClient,
  args: CreateSalesRequestDraftFromMaterialRequestArgs,
): Promise<CreateSalesRequestDraftFromMaterialRequestResult> {
  const materialRequestId = args.materialRequestId.trim();
  if (!materialRequestId) {
    throw new InventoryServiceError("MATERIAL_REQUEST_REQUIRED", "La solicitud de material es obligatoria");
  }

  return prisma.$transaction(async (tx) => {
    const existing = await findExistingSalesRequestByMaterialRequestId(tx, materialRequestId);
    if (existing?.sourceMaterialRequestId) {
      return {
        id: existing.id,
        code: existing.code,
        sourceMaterialRequestId: existing.sourceMaterialRequestId,
        sourceMaterialRequestCode: existing.sourceMaterialRequestCode ?? null,
        wasExisting: true,
      };
    }

    if (args.requireFormalCustomer && !args.customerId) {
      throw new InventoryServiceError("CUSTOMER_ID_REQUIRED", "Selecciona un cliente formal del catálogo");
    }

    let snapshot = resolveCustomerSnapshot(null);
    if (args.customerId) {
      const selectedCustomer = await getCustomerById(tx, args.customerId);
      if (!selectedCustomer.isActive) {
        throw new InventoryServiceError("CUSTOMER_INACTIVE", "El cliente seleccionado está inactivo");
      }
      snapshot = resolveCustomerSnapshot(selectedCustomer);
    } else {
      snapshot = {
        customerId: null,
        customerName: String(args.customerName ?? "").trim() || null,
      };
    }

    if (!snapshot.customerName) {
      throw new InventoryServiceError("CUSTOMER_REQUIRED", "El pedido requiere un cliente");
    }

    const code = await getNextSalesInternalOrderCode(tx);
    const shouldAutoAssignToRequester = Boolean(
      args.requestedByUserId
      && args.requestedByRoles?.includes("SALES_EXECUTIVE")
      && !args.requestedByRoles?.includes("MANAGER")
      && !args.requestedByRoles?.includes("SYSTEM_ADMIN"),
    );

    const createData: Record<string, unknown> = {
      code,
      customerName: snapshot.customerName,
      warehouseId: args.warehouseId,
      dueDate: args.dueDate,
      notes: appendMaterialRequestAuditTrail(args.notes, {
        materialRequestId,
        materialRequestCode: args.materialRequestCode ?? null,
      }),
      sourceMaterialRequestId: materialRequestId,
      sourceMaterialRequestCode: args.materialRequestCode ?? null,
      requestedByUserId: args.requestedByUserId ?? null,
      assignedToUserId: shouldAutoAssignToRequester ? args.requestedByUserId : null,
      assignedAt: shouldAutoAssignToRequester ? new Date() : null,
    };

    if (snapshot.customerId) {
      createData.customerId = snapshot.customerId;
    }

    try {
      const created = await tx.salesInternalOrder.create({
        data: createData as Prisma.SalesInternalOrderCreateInput,
        select: {
          id: true,
          code: true,
          sourceMaterialRequestId: true,
          sourceMaterialRequestCode: true,
        },
      });

      await createAuditLogSafeWithDb({
        entityType: "SALES_INTERNAL_ORDER",
        entityId: created.id,
        action: "CREATE_REQUEST_DRAFT_FROM_MATERIAL_REQUEST",
        actor: "system",
        actorUserId: args.requestedByUserId ?? null,
        source: "sales/material-request-link",
        after: {
          code: created.code,
          customerId: snapshot.customerId,
          customerName: snapshot.customerName,
          warehouseId: args.warehouseId,
          dueDate: args.dueDate.toISOString(),
          sourceMaterialRequestId: materialRequestId,
          sourceMaterialRequestCode: args.materialRequestCode ?? null,
          assignedToUserId: shouldAutoAssignToRequester ? args.requestedByUserId : null,
        },
      }, tx);

      if (!created.sourceMaterialRequestId) {
        throw new InventoryServiceError(
          "SOURCE_LINK_MISSING",
          "El pedido se creó sin el vínculo estructurado a la solicitud de material",
        );
      }

      return {
        id: created.id,
        code: created.code,
        sourceMaterialRequestId: created.sourceMaterialRequestId,
        sourceMaterialRequestCode: created.sourceMaterialRequestCode ?? null,
        wasExisting: false,
      };
    } catch (error) {
      if (isSourceMaterialRequestUniqueError(error)) {
        const reused = await findExistingSalesRequestByMaterialRequestId(tx, materialRequestId);
        if (reused?.sourceMaterialRequestId) {
          return {
            id: reused.id,
            code: reused.code,
            sourceMaterialRequestId: reused.sourceMaterialRequestId,
            sourceMaterialRequestCode: reused.sourceMaterialRequestCode ?? null,
            wasExisting: true,
          };
        }
      }

      throw error;
    }
  });
}
