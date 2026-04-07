import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

function escapeCSV(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(request: NextRequest) {
  await requirePermission("audit.view");

  const sp = request.nextUrl.searchParams;
  const entityType = sp.get("entityType")?.trim() ?? "";
  const action = sp.get("action")?.trim() ?? "";
  const actor = sp.get("actor")?.trim() ?? "";
  const source = sp.get("source")?.trim() ?? "";
  const entityId = sp.get("entityId")?.trim() ?? "";
  const from = sp.get("from");
  const to = sp.get("to");

  const fromDate = from ? new Date(`${from}T00:00:00`) : null;
  const toDate = to ? new Date(`${to}T23:59:59`) : null;

  const where = {
    ...(entityType ? { entityType: { contains: entityType } } : {}),
    ...(action ? { action: { contains: action } } : {}),
    ...(actor ? { actor: { contains: actor } } : {}),
    ...(source ? { source: { contains: source } } : {}),
    ...(entityId ? { entityId: { contains: entityId } } : {}),
    ...(fromDate || toDate
      ? {
          createdAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
  };

  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 10000,
  });

  const headers = ["Fecha", "Entidad", "Entity ID", "Accion", "Actor", "Origen", "Before", "After"];
  const dataRows = rows.map((row) =>
    [
      new Date(row.createdAt).toLocaleString("es-MX"),
      row.entityType,
      row.entityId ?? "",
      row.action,
      row.actor ?? "",
      row.source ?? "",
      row.before ?? "",
      row.after ?? "",
    ]
      .map(escapeCSV)
      .join(","),
  );

  const csv = [headers.join(","), ...dataRows].join("\n");
  const filename = `audit_${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse("\uFEFF" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
