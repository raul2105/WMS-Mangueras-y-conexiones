import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { markLabelPrintJobStatus } from "@/lib/labeling-service";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requirePermission("labels.manage");

  const { id } = await params;
  const job = await prisma.labelPrintJob.findUnique({
    where: { id },
    select: { id: true, htmlSnapshot: true },
  });
  if (!job || !job.htmlSnapshot) {
    return new NextResponse("Label HTML not found", { status: 404 });
  }

  await markLabelPrintJobStatus(prisma, id, "EXPORTED");

  return new NextResponse(job.htmlSnapshot, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="label_${job.id}.html"`,
    },
  });
}

