import prisma from "@/lib/prisma";
import type { HandleResult } from "../handle-types";

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

    // Idempotency check
    const existing = await prisma.salesInternalOrder.findUnique({
      where: { code },
      select: { id: true },
    });

    if (existing) {
      return { ok: true, localId: existing.id };
    }

    // Resolve warehouse
    let warehouseId: string | undefined;
    if (warehouseCode) {
      const warehouse = await prisma.warehouse.findUnique({
        where: { code: warehouseCode },
        select: { id: true },
      });
      warehouseId = warehouse?.id;
    }

    const order = await prisma.salesInternalOrder.create({
      data: {
        code,
        status: "BORRADOR",
        customerName: (body.customerName as string) ?? null,
        warehouseId: warehouseId ?? null,
        dueDate: body.dueDate ? new Date(body.dueDate as string) : null,
        notes: `Creado desde solicitud móvil ${requestId}`,
      },
      select: { id: true },
    });

    return { ok: true, localId: order.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
