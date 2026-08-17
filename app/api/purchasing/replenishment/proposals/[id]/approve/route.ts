import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { approveReplenishmentProposal } from "@/lib/purchasing/replenishment";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("purchasing.manage");
  const { id } = await params;

  try {
    const result = await approveReplenishmentProposal(prisma, {
      proposalId: id,
      actorUserId: session.user?.id ?? null,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo convertir la propuesta en OC";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
