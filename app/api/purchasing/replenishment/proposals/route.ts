import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generateReplenishmentProposals } from "@/lib/purchasing/replenishment";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await requirePermission("purchasing.manage");
  const actorUserId = session.user?.id;
  if (!actorUserId) {
    return NextResponse.json({ error: "No se pudo identificar al responsable de la actualización." }, { status: 401 });
  }
  const now = new Date();

  try {
    const proposals = await generateReplenishmentProposals(prisma, now, actorUserId);
    return NextResponse.json({
      generatedByUserId: actorUserId,
      generatedAt: now.toISOString(),
      proposals,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudieron generar propuestas de reabasto";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
