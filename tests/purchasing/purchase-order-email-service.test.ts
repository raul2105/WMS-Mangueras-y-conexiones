import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";
import { sendPurchaseOrderEmail } from "@/lib/purchasing/purchase-order-email-service";
import { buildPurchaseOrderEmailContract } from "@/lib/purchasing/purchase-order-email-contract";

vi.mock("@/lib/prisma", () => ({
  default: {
    purchaseOrder: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    purchaseOrderEmailAttempt: {
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/purchasing/purchase-order-document-service", () => ({
  loadLatestPurchaseOrderDocument: vi.fn(),
  parsePurchaseOrderDocumentSnapshot: vi.fn(),
}));

vi.mock("@/lib/purchasing/purchase-order-pdf", () => ({
  buildPurchaseOrderPdf: vi.fn(),
}));

vi.mock("@/lib/email/provider", () => ({
  getEmailProvider: vi.fn(),
  createFakeEmailProvider: vi.fn(),
}));

vi.mock("@/lib/purchasing/purchase-order-email-contract", () => ({
  buildPurchaseOrderEmailContract: vi.fn(),
}));

import prisma from "@/lib/prisma";
import { loadLatestPurchaseOrderDocument, parsePurchaseOrderDocumentSnapshot } from "@/lib/purchasing/purchase-order-document-service";
import { buildPurchaseOrderPdf } from "@/lib/purchasing/purchase-order-pdf";
import { getEmailProvider, createFakeEmailProvider } from "@/lib/email/provider";

describe("purchase order email service", () => {
  const mockOrder = {
    id: "po-1",
    folio: "OC-2026-0042",
    status: "CONFIRMADA",
    emailSendState: "NOT_SENT",
    emailRecipientSnapshot: null,
    emailSubjectSnapshot: null,
    emailBodySnapshot: null,
    emailDocumentVersionSnapshot: null,
    deliveryAddressSnapshot: "Carretera 1 Km 10",
    paymentTermsSnapshot: "30 días",
    expectedDate: "2026-06-10T00:00:00.000Z",
    supplier: {
      id: "sup-1",
      code: "SUP-001",
      name: "Proveedor Test",
      businessName: "Proveedor Test SA",
      legalName: "Proveedor Test SA de CV",
      email: "compras@proveedor.test",
      paymentTerms: "30 días",
    },
  };

  const mockDocumentRecord = {
    id: "doc-1",
    purchaseOrderId: "po-1",
    versionNumber: 1,
    snapshotJson: "{}",
    snapshotHash: "abc123",
    createdForStatus: "CONFIRMADA",
    createdAt: new Date("2026-06-05T12:00:00.000Z"),
  };

  const mockDocumentSnapshot = {
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
      name: "Proveedor Test",
      businessName: "Proveedor Test SA",
      legalName: "Proveedor Test SA de CV",
      taxId: "AAA010101AAA",
      email: "compras@proveedor.test",
      phone: null,
      address: null,
      paymentTerms: "30 días",
    },
    lines: [],
    totals: { subtotal: 0, total: 0, currency: "MXN" },
    metadata: { source: "test", snapshotHash: "abc123", lineCount: 0 },
  };

  const mockContract = {
    sendState: "NOT_SENT",
    providerConfigured: true,
    recipientEmail: "compras@proveedor.test",
    subject: "Orden de Compra OC-2026-0042 - WMS Mangueras y Conexiones",
    body: "Hola Proveedor Test SA,\n\nAdjuntamos la Orden de Compra OC-2026-0042...",
    blockedReasons: [],
    canSend: true,
    document: {
      versionNumber: 1,
      snapshotHash: "abc123",
      attachmentFilename: "OC-2026-0042.pdf",
      isSnapshotValid: true,
    },
  };

  const fakeProvider = {
    providerId: "fake",
    send: vi.fn().mockResolvedValue({ messageId: "fake-msg-123" }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    (prisma.purchaseOrder.findUnique as Mock).mockResolvedValue(mockOrder);
    (loadLatestPurchaseOrderDocument as Mock).mockResolvedValue(mockDocumentRecord);
    (parsePurchaseOrderDocumentSnapshot as Mock).mockReturnValue(mockDocumentSnapshot);
    (buildPurchaseOrderPdf as Mock).mockResolvedValue({ pdfArrayBuffer: new ArrayBuffer(100), filename: "test.pdf" });
    (getEmailProvider as Mock).mockReturnValue(fakeProvider);
    (createFakeEmailProvider as Mock).mockReturnValue({ 
      provider: fakeProvider, 
      sentEmails: [] 
    });
    (buildPurchaseOrderEmailContract as Mock).mockReturnValue(mockContract);
    (prisma.purchaseOrderEmailAttempt.count as Mock).mockResolvedValue(0);
    (prisma.purchaseOrderEmailAttempt.findFirst as Mock).mockResolvedValue(null);
    (prisma.purchaseOrderEmailAttempt.create as Mock).mockResolvedValue({ id: "attempt-1" });
    (prisma.purchaseOrder.update as Mock).mockResolvedValue({});
  });

  it("should send email successfully with fake provider", async () => {
    const result = await sendPurchaseOrderEmail({
      purchaseOrderId: "po-1",
      triggeredByUserId: "user-1",
    }, { provider: fakeProvider });

    expect(result.success).toBe(true);
    expect(result.attemptId).toBe("attempt-1");
    expect(result.messageId).toBe("fake-msg-123");
    expect(result.sendState).toBe("SENT");
    expect(fakeProvider.send).toHaveBeenCalledWith(expect.objectContaining({
      to: "compras@proveedor.test",
      subject: mockContract.subject,
      body: mockContract.body,
      attachment: expect.objectContaining({
        filename: "OC-2026-0042-v1.pdf", // OC prefix stripped from folio
        contentType: "application/pdf",
      }),
    }));
    expect(prisma.purchaseOrderEmailAttempt.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        purchaseOrderId: "po-1",
        attemptNumber: 1,
        sendState: "SENT",
        recipientEmail: "compras@proveedor.test",
      }),
    }));
  });

  it("should fail when provider is not configured", async () => {
    (getEmailProvider as Mock).mockReturnValue(null);
    (createFakeEmailProvider as Mock).mockReturnValue({ 
      provider: { providerId: "fake", send: vi.fn() }, 
      sentEmails: [] 
    });

    const result = await sendPurchaseOrderEmail({
      purchaseOrderId: "po-1",
      triggeredByUserId: "user-1",
    }, { provider: { providerId: "fake", send: vi.fn() } });

    expect(result.success).toBe(false);
  });

  it("should fail when supplier email is missing", async () => {
    (buildPurchaseOrderEmailContract as Mock).mockReturnValue({
      ...mockContract,
      recipientEmail: null,
      blockedReasons: ["El proveedor no tiene email registrado."],
      canSend: false,
    });

    const result = await sendPurchaseOrderEmail({
      purchaseOrderId: "po-1",
      triggeredByUserId: "user-1",
    }, { provider: fakeProvider });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("BLOCKED");
    expect(fakeProvider.send).not.toHaveBeenCalled();
  });

  it("should fail when official document is missing", async () => {
    (buildPurchaseOrderEmailContract as Mock).mockReturnValue({
      ...mockContract,
      document: null,
      blockedReasons: ["No existe el documento oficial congelado de la OC."],
      canSend: false,
    });

    const result = await sendPurchaseOrderEmail({
      purchaseOrderId: "po-1",
      triggeredByUserId: "user-1",
    }, { provider: fakeProvider });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("BLOCKED");
  });

  it("should fail when provider throws error", async () => {
    const failingProvider = {
      providerId: "fake",
      send: vi.fn().mockRejectedValue(new Error("SES rate limit exceeded")),
    };

    const result = await sendPurchaseOrderEmail({
      purchaseOrderId: "po-1",
      triggeredByUserId: "user-1",
    }, { provider: failingProvider });

    expect(result.success).toBe(false);
    expect(result.sendState).toBe("FAILED");
    expect(result.errorCode).toBe("PROVIDER_ERROR");
  });

  it("should mark as RESEND on second attempt", async () => {
    (prisma.purchaseOrderEmailAttempt.count as Mock).mockResolvedValue(1);
    (prisma.purchaseOrderEmailAttempt.findFirst as Mock).mockResolvedValue({ attemptNumber: 1 });

    const result = await sendPurchaseOrderEmail({
      purchaseOrderId: "po-1",
      triggeredByUserId: "user-1",
    }, { provider: fakeProvider });

    expect(result.success).toBe(true);
    expect(result.sendState).toBe("RESENT");
  });
});