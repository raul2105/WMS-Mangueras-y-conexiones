import prisma from "@/lib/prisma";
import type { HandleResult } from "../handle-types";

/**
 * Handle an assembly_request.created event from mobile.
 * Creates a ProductionOrder locally with kind ASSEMBLY_3PIECE, status BORRADOR.
 */
export async function handleAssemblyRequest(
  body: Record<string, unknown>,
): Promise<HandleResult> {
  try {
    const requestId = body.requestId as string | undefined;
    const warehouseCode = body.warehouseCode as string | undefined;

    if (!requestId || !warehouseCode) {
      return { ok: false, error: "Missing requestId or warehouseCode" };
    }

    // Find warehouse by code
    const warehouse = await prisma.warehouse.findUnique({
      where: { code: warehouseCode },
      select: { id: true },
    });

    if (!warehouse) {
      return { ok: false, error: `Warehouse not found: ${warehouseCode}` };
    }

    // Generate a unique order code
    const now = new Date();
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
    const shortId = requestId.slice(0, 6).toUpperCase();
    const code = `OPM-${datePart}-${shortId}`;

    // Check for idempotency: skip if already processed
    const existing = await prisma.productionOrder.findUnique({
      where: { code },
      select: { id: true },
    });

    if (existing) {
      return { ok: true, localId: existing.id };
    }

    const order = await prisma.productionOrder.create({
      data: {
        code,
        kind: "ASSEMBLY_3PIECE",
        status: "BORRADOR",
        warehouseId: warehouse.id,
        notes: `Creado desde solicitud móvil ${requestId}`,
        sourceDocumentType: "MOBILE_ASSEMBLY_REQUEST",
        sourceDocumentId: requestId,
      },
      select: { id: true },
    });

    return { ok: true, localId: order.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
