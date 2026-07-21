import { NextRequest, NextResponse } from "next/server";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import prisma from "@/lib/prisma";
import { requireSalesWriteAccess } from "@/lib/rbac/sales";
import { buildOperationalDocumentFilename, OperationalDocumentPdf } from "@/lib/operations/operational-document-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireSalesWriteAccess();
  const { id } = await params;
  const order = await prisma.salesInternalOrder.findUnique({ where: { id }, select: { code: true, customerName: true, deliveredToCustomerAt: true, preparedForDeliveryAt: true, preparedForDeliveryNotes: true, warehouse: { select: { code: true, name: true } }, preparedForDeliveryLocation: { select: { code: true, name: true } }, deliveredByUser: { select: { name: true, email: true } }, lines: { select: { requestedQty: true, product: { select: { sku: true, name: true, unitLabel: true } }, assemblyConfiguration: { select: { assemblyQuantity: true, entryFittingProduct: { select: { sku: true } }, hoseProduct: { select: { sku: true } }, exitFittingProduct: { select: { sku: true } } } } } } } });
  if (!order || !order.deliveredToCustomerAt) return NextResponse.json({ error: "El comprobante sólo está disponible después de registrar la entrega" }, { status: 409 });
  const pdf = await renderToBuffer(React.createElement(OperationalDocumentPdf, { snapshot: { title: "Comprobante de entrega", folio: order.code, status: "Entregado al cliente", generatedAt: order.deliveredToCustomerAt, warehouse: order.warehouse ? `${order.warehouse.code} - ${order.warehouse.name}` : "Sin almacén", location: order.preparedForDeliveryLocation ? `${order.preparedForDeliveryLocation.code} - ${order.preparedForDeliveryLocation.name}` : null, responsible: order.deliveredByUser?.name || order.deliveredByUser?.email, reference: order.customerName, notes: order.preparedForDeliveryNotes, lines: order.lines.map((line) => line.product ? ({ sku: line.product.sku, name: line.product.name, quantity: line.requestedQty, unit: line.product.unitLabel || "unidad" }) : ({ sku: "ENSAMBLE", name: `${line.assemblyConfiguration?.entryFittingProduct.sku || ""} + ${line.assemblyConfiguration?.hoseProduct.sku || ""} + ${line.assemblyConfiguration?.exitFittingProduct.sku || ""}`.trim(), quantity: line.assemblyConfiguration?.assemblyQuantity || line.requestedQty, unit: "ensamble" })) } }) as unknown as Parameters<typeof renderToBuffer>[0]);
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${buildOperationalDocumentFilename("entrega", order.code)}"`, "Cache-Control": "private, no-store" } });
}
