import prisma from "@/lib/prisma";
import type { HandleResult } from "../handle-types";

const MOBILE_REQUEST_NOTE_PREFIX = "Creado desde solicitud móvil";

function buildMobileRequestAuditNote(requestId: string) {
  return `${MOBILE_REQUEST_NOTE_PREFIX} ${requestId}`;
}

function hasMobileRequestAuditNote(notes: string | null | undefined, requestId: string) {
  return typeof notes === "string" && notes.includes(buildMobileRequestAuditNote(requestId));
}

function mergeMobileRequestAuditNote(notes: string | null | undefined, requestId: string) {
  if (hasMobileRequestAuditNote(notes, requestId)) {
    return notes ?? null;
  }

  const auditNote = buildMobileRequestAuditNote(requestId);
  const trimmedNotes = typeof notes === "string" ? notes.trim() : "";
  return trimmedNotes ? `${trimmedNotes}\n${auditNote}` : auditNote;
}

function isUniqueConstraintViolation(error: unknown) {
  return Boolean(
    error
      && typeof error === "object"
      && "code" in error
      && (error as { code?: unknown }).code === "P2002"
  );
}

async function reuseExistingSalesRequestOrder(args: {
  requestId: string;
  existing: { id: string; sourceMaterialRequestId: string | null; notes: string | null };
}): Promise<HandleResult> {
  const { requestId, existing } = args;

  if (existing.sourceMaterialRequestId && existing.sourceMaterialRequestId !== requestId) {
    return {
      ok: false,
      error: `SalesInternalOrder ${existing.id} is already linked to a different material request`,
    };
  }

  const nextNotes = mergeMobileRequestAuditNote(existing.notes, requestId);
  if (!existing.sourceMaterialRequestId || nextNotes !== existing.notes) {
    await prisma.salesInternalOrder.update({
      where: { id: existing.id },
      data: {
        sourceMaterialRequestId: existing.sourceMaterialRequestId ?? requestId,
        notes: nextNotes,
      },
      select: { id: true },
    });
  }

  return { ok: true, localId: existing.id };
}

/**
 * Handle a sales_request.created event from mobile.
 * Creates a SalesInternalOrder locally with status BORRADOR.
 */
export async function handleSalesRequest(
  body: Record<string, unknown>,
): Promise<HandleResult> {
  try {
    const requestId = body.requestId as string | undefined;
    const code = body.code as string | undefined;
    const warehouseCode = body.warehouseCode as string | undefined;

    if (!requestId || !code) {
      return { ok: false, error: "Missing requestId or code" };
    }

    const existingByRequest = await prisma.salesInternalOrder.findUnique({
      where: { sourceMaterialRequestId: requestId },
      select: { id: true },
    });

    if (existingByRequest) {
      return { ok: true, localId: existingByRequest.id };
    }

    const existingByCode = await prisma.salesInternalOrder.findUnique({
      where: { code },
      select: {
        id: true,
        sourceMaterialRequestId: true,
        notes: true,
      },
    });

    if (existingByCode) {
      return reuseExistingSalesRequestOrder({
        requestId,
        existing: existingByCode,
      });
    }

    let warehouseId: string | undefined;
    if (warehouseCode) {
      const warehouse = await prisma.warehouse.findUnique({
        where: { code: warehouseCode },
        select: { id: true },
      });
      warehouseId = warehouse?.id;
    }

    try {
      const order = await prisma.salesInternalOrder.create({
        data: {
          code,
          status: "BORRADOR",
          customerName: (body.customerName as string) ?? null,
          warehouseId: warehouseId ?? null,
          dueDate: body.dueDate ? new Date(body.dueDate as string) : null,
          sourceMaterialRequestId: requestId,
          notes: buildMobileRequestAuditNote(requestId),
        },
        select: { id: true },
      });

      return { ok: true, localId: order.id };
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) {
        throw error;
      }

      const existingAfterCollision = await prisma.salesInternalOrder.findFirst({
        where: {
          OR: [
            { sourceMaterialRequestId: requestId },
            { code },
          ],
        },
        select: {
          id: true,
          sourceMaterialRequestId: true,
          notes: true,
        },
      });

      if (existingAfterCollision) {
        return reuseExistingSalesRequestOrder({
          requestId,
          existing: existingAfterCollision,
        });
      }

      throw error;
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
