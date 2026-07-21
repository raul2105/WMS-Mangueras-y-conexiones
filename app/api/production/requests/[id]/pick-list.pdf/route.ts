import { NextRequest, NextResponse } from "next/server";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { buildOperationalDocumentFilename, OperationalDocumentPdf } from "@/lib/operations/operational-document-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requirePermission("production.execute");
  const { id } = await params;
  const order = await prisma.salesInternalOrder.findUnique({
    where: { id },
    select: {
      code: true,
      warehouse: { select: { code: true, name: true } },
      pickLists: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          code: true,
          status: true,
          createdAt: true,
          targetLocation: { select: { code: true, name: true } },
          tasks: {
            orderBy: { sequence: "asc" },
            select: {
              requestedQty: true,
              pickedQty: true,
              status: true,
              sourceLocation: { select: { code: true } },
              orderLine: { select: { product: { select: { sku: true, name: true, unitLabel: true } } } },
            },
          },
        },
      },
    },
  });
  const pickList = order?.pickLists[0];
  if (!order || !pickList) return NextResponse.json({ error: "Surtido no encontrado para este pedido" }, { status: 404 });
  const pdf = await renderToBuffer(React.createElement(OperationalDocumentPdf, { snapshot: { title: "Lista de surtido", folio: pickList.code, status: pickList.status, generatedAt: pickList.createdAt, warehouse: order.warehouse ? `${order.warehouse.code} - ${order.warehouse.name}` : "Sin almacén", location: `${pickList.targetLocation.code} - ${pickList.targetLocation.name}`, reference: order.code, lines: pickList.tasks.map((task) => ({ sku: task.orderLine.product?.sku || "—", name: task.orderLine.product?.name || "Material configurado", quantity: task.requestedQty, unit: task.orderLine.product?.unitLabel || "unidad", detail: `Origen: ${task.sourceLocation.code} · Surtido: ${task.pickedQty} · ${task.status}` })) } }) as unknown as Parameters<typeof renderToBuffer>[0]);
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${buildOperationalDocumentFilename("surtido", pickList.code)}"`, "Cache-Control": "private, no-store" } });
}
