import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generateReplenishmentProposals } from "@/lib/purchasing/replenishment";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requirePermission("purchasing.manage");
  const body = (await request.json().catch(() => null)) as { now?: unknown } | null;
  const requestedNow = typeof body?.now === "string" ? new Date(body.now) : new Date();
  const now = Number.isNaN(requestedNow.getTime()) ? new Date() : requestedNow;

  try {
    const proposals = await generateReplenishmentProposals(prisma, now, session.user?.id ?? null);
    return NextResponse.json({
      generatedByUserId: session.user?.id ?? null,
      generatedAt: now.toISOString(),
      proposals,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudieron generar propuestas de reabasto";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
