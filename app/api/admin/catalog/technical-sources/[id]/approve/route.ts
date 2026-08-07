import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createAuditLogSafe } from "@/lib/audit-log";
import { promoteProductTechnicalSource } from "@/lib/catalog/technical-specs";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("catalog.edit");
  const { id } = await context.params;
  const reviewerUserId = session.user?.id;
  if (!reviewerUserId) {
    return NextResponse.json({ error: "No se pudo identificar al revisor" }, { status: 401 });
  }

  try {
    const result = await promoteProductTechnicalSource(prisma, { sourceId: id, reviewerUserId });
    await createAuditLogSafe({
      entityType: "PRODUCT_TECHNICAL_SOURCE",
      entityId: id,
      action: "APPROVE",
      actorUserId: reviewerUserId,
      source: "catalog/technical-sources/approve",
      after: result,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo aprobar la fuente técnica";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
