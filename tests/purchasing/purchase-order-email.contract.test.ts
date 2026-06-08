import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { PurchaseOrderDocumentRecord, PurchaseOrderDocumentSnapshot } from "@/lib/purchasing/purchase-order-document-service";
import {
  buildPurchaseOrderEmailBody,
  buildPurchaseOrderEmailContract,
  buildPurchaseOrderEmailSubject,
  getPurchaseOrderEmailStateLabel,
  resolvePurchaseOrderEmailRecipient,
} from "@/lib/purchasing/purchase-order-email-contract";

function readWorkspaceFile(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("purchase order email contract", () => {
  const documentSnapshot = {
    documentVersion: 1,
    generatedAt: "2026-06-05T12:00:00.000Z",
    purchaseOrder: {
      id: "po-1",
      folio: "OC-2026-0042",
      status: "CONFIRMADA",
      deliveryWarehouseId: "warehouse-1",
      expectedDate: "2026-06-10T00:00:00.000Z",
      notes: null,
      deliveryAddressSnapshot: "Carretera 1 Km 10",
      paymentTermsSnapshot: "30 días",
      createdAt: "2026-06-05T11:30:00.000Z",
    },
    supplier: {
      code: "SUP-001",
      name: "Proveedor Documento",
      businessName: "Proveedor Documento SA",
      legalName: "Proveedor Documento SA de CV",
      taxId: "AAA010101AAA",
      email: "compras@proveedor.test",
      phone: null,
      address: null,
      paymentTerms: "30 días",
    },
    lines: [],
    totals: {
      subtotal: 0,
      total: 0,
      currency: "MXN",
    },
    metadata: {
      source: "tests",
      snapshotHash: "abc123",
      lineCount: 0,
    },
  } satisfies PurchaseOrderDocumentSnapshot;

  const documentRecord = {
    id: "doc-1",
    purchaseOrderId: "po-1",
    versionNumber: 1,
    snapshotJson: JSON.stringify(documentSnapshot),
    snapshotHash: "abc123",
    createdForStatus: "CONFIRMADA",
    createdAt: new Date("2026-06-05T12:00:00.000Z"),
  } satisfies PurchaseOrderDocumentRecord;

  const purchaseOrder = {
    id: "po-1",
    folio: "OC-2026-0042",
    status: "CONFIRMADA",
    emailSendState: "NOT_SENT",
    emailRecipientSnapshot: null,
    emailSubjectSnapshot: null,
    emailBodySnapshot: null,
    emailDocumentVersionSnapshot: null,
    emailLastAttemptAt: null,
    emailLastSentAt: null,
    emailLastErrorCode: null,
    emailLastErrorMessage: null,
    deliveryAddressSnapshot: "Carretera 1 Km 10",
    paymentTermsSnapshot: "30 días",
    expectedDate: "2026-06-10T00:00:00.000Z",
    supplier: {
      code: "SUP-001",
      name: "Proveedor Documento",
      legalName: "Proveedor Documento SA de CV",
      businessName: "Proveedor Documento SA",
      email: "compras@proveedor.test",
      paymentTerms: "30 días",
    },
  } satisfies Parameters<typeof buildPurchaseOrderEmailContract>[0]["purchaseOrder"];

  it("builds a deterministic subject, body and recipient from the frozen PO context", () => {
    const contract = buildPurchaseOrderEmailContract({
      purchaseOrder,
      documentRecord,
      documentSnapshot,
      providerConfigured: false,
    });

    expect(buildPurchaseOrderEmailSubject({ folio: purchaseOrder.folio })).toBe(
      "Orden de Compra OC-2026-0042 - WMS Mangueras y Conexiones",
    );
    expect(resolvePurchaseOrderEmailRecipient({
      persistedRecipientEmail: null,
      frozenSupplierEmail: documentSnapshot.supplier.email,
      liveSupplierEmail: purchaseOrder.supplier.email,
    })).toBe("compras@proveedor.test");
    expect(buildPurchaseOrderEmailBody({
      folio: purchaseOrder.folio,
      supplierDisplayName: "Proveedor Documento SA",
      documentVersion: 1,
      expectedDate: purchaseOrder.expectedDate,
      deliveryAddress: purchaseOrder.deliveryAddressSnapshot,
      paymentTerms: purchaseOrder.paymentTermsSnapshot,
    })).toContain("Documento oficial: v1");

    expect(contract.recipientEmail).toBe("compras@proveedor.test");
    expect(contract.subject).toBe("Orden de Compra OC-2026-0042 - WMS Mangueras y Conexiones");
    expect(contract.body).toContain("Carretera 1 Km 10");
    expect(contract.body).toContain("Términos de pago: 30 días");
    expect(contract.document?.versionNumber).toBe(1);
    expect(contract.document?.attachmentFilename).toBe("OC-2026-0042.pdf");
    expect(contract.sendStateLabel).toBe("No enviado");
    expect(contract.providerNote).toContain("KAN-85");
    expect(contract.canSend).toBe(false);
  });

  it("falls back to the live supplier email when the frozen email is empty", () => {
    const contract = buildPurchaseOrderEmailContract({
      purchaseOrder: {
        ...purchaseOrder,
        supplier: {
          ...purchaseOrder.supplier,
          email: "compras-vivas@proveedor.test",
        },
      },
      documentRecord,
      documentSnapshot: {
        ...documentSnapshot,
        supplier: {
          ...documentSnapshot.supplier,
          email: null,
        },
      },
      providerConfigured: false,
    });

    expect(contract.recipientEmail).toBe("compras-vivas@proveedor.test");
    expect(contract.blockedReasons).toHaveLength(0);
  });

  it("blocks contracts that still have no official document", () => {
    const contract = buildPurchaseOrderEmailContract({
      purchaseOrder,
      providerConfigured: false,
    });

    expect(contract.document).toBeNull();
    expect(contract.blockedReasons).toContain("No existe el documento oficial congelado de la OC.");
    expect(contract.canSend).toBe(false);
  });

  it("blocks contracts with a corrupt document snapshot", () => {
    const contract = buildPurchaseOrderEmailContract({
      purchaseOrder,
      documentRecord: {
        ...documentRecord,
        versionNumber: 2,
      },
      documentSnapshot: null,
      providerConfigured: false,
    });

    expect(contract.document?.versionNumber).toBe(2);
    expect(contract.document?.isSnapshotValid).toBe(false);
    expect(contract.blockedReasons).toContain("El snapshot oficial está corrupto o es inválido.");
  });

  it("labels send states explicitly and keeps the UI contract visible in source", () => {
    expect(getPurchaseOrderEmailStateLabel("SENT")).toBe("Enviado");
    expect(getPurchaseOrderEmailStateLabel("RESENT")).toBe("Reenviado");
    expect(getPurchaseOrderEmailStateLabel("FAILED")).toBe("Fallido");

    const helperContent = readWorkspaceFile("lib/purchasing/purchase-order-email-contract.ts");
    const pageContent = readWorkspaceFile("app/(shell)/purchasing/orders/[id]/page.tsx");

    expect(helperContent).toContain("Orden de Compra");
    expect(helperContent).toContain("El envío real por correo no está configurado en este entorno");
    expect(pageContent).toContain("Correo al proveedor");
    expect(pageContent).toContain("Vista previa del cuerpo");
    expect(pageContent).toContain("Enviar por correo");
    expect(pageContent).toContain("KAN-85");
  });
});
