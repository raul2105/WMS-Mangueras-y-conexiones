import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  IN: "Entrada",
  OUT: "Salida",
  TRANSFER: "Traslado",
  ADJUSTMENT: "Ajuste",
};

function escapeCSV(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const code = sp.get("code")?.trim() ?? "";
  const location = sp.get("location")?.trim() ?? "";
  const reference = sp.get("reference")?.trim() ?? "";
  const type = sp.get("type") ?? "";
  const from = sp.get("from");
  const to = sp.get("to");

  const fromDate = from ? new Date(`${from}T00:00:00`) : null;
  const toDate = to ? new Date(`${to}T23:59:59`) : null;

  const where = {
    ...(type ? { type: type as "IN" | "OUT" | "TRANSFER" | "ADJUSTMENT" } : {}),
    ...(reference ? { reference: { contains: reference } } : {}),
    ...(fromDate || toDate
      ? {
          createdAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
    ...(code
      ? {
          product: {
            OR: [{ sku: { contains: code } }, { referenceCode: { contains: code } }],
          },
        }
      : {}),
    ...(location
      ? {
          OR: [
            { location: { code: { contains: location } } },
            { fromLocationCode: { contains: location } },
            { toLocationCode: { contains: location } },
          ],
        }
      : {}),
  };

  const movements = await prisma.inventoryMovement.findMany({
    where,
    include: {
      product: { select: { sku: true, name: true, referenceCode: true } },
      location: { select: { code: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 10000,
  });

  const headers = ["Fecha", "Tipo", "SKU", "Ref.Producto", "Producto", "Ubicacion", "Cantidad", "Referencia", "Notas"];

  const rows = movements.map((mv) => {
    const locationDisplay =
      mv.type === "TRANSFER"
        ? `${mv.fromLocationCode ?? "--"} -> ${mv.toLocationCode ?? "--"}`
        : mv.location?.code ?? "--";

    return [
      new Date(mv.createdAt).toLocaleString("es-MX"),
      MOVEMENT_TYPE_LABELS[mv.type] ?? mv.type,
      mv.product.sku,
      mv.product.referenceCode ?? "",
      mv.product.name,
      locationDisplay,
      mv.quantity,
      mv.reference ?? "",
      mv.notes ?? "",
    ].map(escapeCSV).join(",");
  });

  const csv = [headers.join(","), ...rows].join("\n");
  const filename = `kardex_${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse("\uFEFF" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
