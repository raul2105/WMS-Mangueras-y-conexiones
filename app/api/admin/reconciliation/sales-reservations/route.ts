import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { reconcileSalesRequestReservations } from "@/lib/sales/request-service";

export const dynamic = "force-dynamic";

/**
 * Explicitly disabled unless the operator enables it for a bounded maintenance run.
 * This endpoint is never part of the normal AWS E2E flow.
 */
export async function POST(request: Request) {
  if (process.env.RESERVATION_RECONCILIATION_ENABLED !== "true") {
    return NextResponse.json({ error: "reservation reconciliation disabled" }, { status: 404 });
  }

  const session = await requirePermission("inventory.adjust");
  const body = (await request.json().catch(() => null)) as {
    orderCode?: unknown;
    mode?: unknown;
    reason?: unknown;
  } | null;
  const orderCode = typeof body?.orderCode === "string" ? body.orderCode.trim() : "";
  const mode = body?.mode === "APPLY" ? "APPLY" : "DRY_RUN";
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

  if (!orderCode || !reason) {
    return NextResponse.json({ error: "orderCode y reason son obligatorios" }, { status: 400 });
  }
  if (mode === "APPLY" && !orderCode.startsWith("PI-2026-")) {
    return NextResponse.json({ error: "APPLY requiere un pedido de evidencia explícito" }, { status: 400 });
  }

  const order = await prisma.salesInternalOrder.findUnique({
    where: { code: orderCode },
    select: { id: true, code: true },
  });
  if (!order) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });

  try {
    const result = await reconcileSalesRequestReservations(prisma, {
      orderId: order.id,
      mode,
      reason,
      actorUserId: session.user?.id ?? null,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo reconciliar la reserva";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
