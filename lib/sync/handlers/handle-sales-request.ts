import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import type { HandleResult } from "../handle-types";

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function findExistingSalesOrder(requestId: string, code: string) {
  return prisma.salesInternalOrder.findFirst({
    where: {
      OR: [
        { sourceMaterialRequestId: requestId },
        { code },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
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

    const existing = await findExistingSalesOrder(requestId, code);
    if (existing) {
      return { ok: true, localId: existing.id };
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
          notes: `Creado desde solicitud móvil ${requestId}`,
        },
        select: { id: true },
      });

      return { ok: true, localId: order.id };
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const existingAfterCollision = await findExistingSalesOrder(requestId, code);
        if (existingAfterCollision) {
          return { ok: true, localId: existingAfterCollision.id };
        }
      }
      throw error;
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
