import { NextRequest, NextResponse } from "next/server";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { buildOperationalDocumentFilename, OperationalDocumentPdf } from "@/lib/operations/operational-document-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requirePermission("purchasing.receive");
  const { id } = await params;
  const receipt = await prisma.purchaseReceipt.findUnique({
    where: { id },
    select: {
      id: true, receivedAt: true, notes: true, referenceDoc: true,
      location: { select: { code: true, name: true, warehouse: { select: { code: true, name: true } } } },
      purchaseOrder: { select: { folio: true } },
      lines: { select: { qtyReceived: true, qtyDamaged: true, qtyMissing: true, qtyRejected: true, purchaseOrderLine: { select: { product: { select: { sku: true, name: true, unitLabel: true } } } } } },
    },
  });
  if (!receipt) return NextResponse.json({ error: "Recepción no encontrada" }, { status: 404 });
  const pdf = await renderToBuffer(React.createElement(OperationalDocumentPdf, { snapshot: {
    title: "Comprobante de recepción", folio: receipt.purchaseOrder.folio, status: "Recibido", generatedAt: receipt.receivedAt,
    warehouse: `${receipt.location.warehouse.code} - ${receipt.location.warehouse.name}`, location: `${receipt.location.code} - ${receipt.location.name}`,
    reference: receipt.referenceDoc, notes: receipt.notes,
    lines: receipt.lines.map((line) => ({ sku: line.purchaseOrderLine.product.sku, name: line.purchaseOrderLine.product.name, quantity: line.qtyReceived, unit: line.purchaseOrderLine.product.unitLabel || "unidad", detail: line.qtyDamaged || line.qtyMissing || line.qtyRejected ? `Daño: ${line.qtyDamaged}; faltante: ${line.qtyMissing}; rechazado: ${line.qtyRejected}` : null })),
  } }) as unknown as Parameters<typeof renderToBuffer>[0]);
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${buildOperationalDocumentFilename("recepcion", receipt.purchaseOrder.folio)}"`, "Cache-Control": "private, no-store" } });
}
