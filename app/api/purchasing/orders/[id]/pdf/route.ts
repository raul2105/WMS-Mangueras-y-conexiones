import { NextRequest, NextResponse } from "next/server";
import React from "react";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import {
  loadLatestPurchaseOrderDocument,
  parsePurchaseOrderDocumentSnapshot,
} from "@/lib/purchasing/purchase-order-document-service";
import { buildPurchaseOrderPdfFilename, PurchaseOrderPdfDocument } from "@/lib/purchasing/purchase-order-pdf";
import { renderToBuffer } from "@react-pdf/renderer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requirePermission("purchasing.manage");
  const { id } = await params;

  const documentRecord = await loadLatestPurchaseOrderDocument({ purchaseOrderId: id, prismaClient: prisma });

  if (!documentRecord) {
    return NextResponse.json(
      { error: "Documento oficial no generado para esta orden de compra" },
      { status: 404 },
    );
  }

  const snapshot = parsePurchaseOrderDocumentSnapshot(documentRecord.snapshotJson);
  const pdfBuffer = await renderToBuffer(
    React.createElement(PurchaseOrderPdfDocument, { snapshot }) as unknown as Parameters<typeof renderToBuffer>[0],
  );
  const filename = buildPurchaseOrderPdfFilename(snapshot.purchaseOrder.folio);

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}
