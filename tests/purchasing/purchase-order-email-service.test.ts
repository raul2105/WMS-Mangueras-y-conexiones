import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";
import { getEmailService, markStalePurchaseOrderEmailAttemptUnknown, sendPurchaseOrderEmail } from "@/lib/purchasing/purchase-order-email-service";
import { buildPurchaseOrderEmailContract } from "@/lib/purchasing/purchase-order-email-contract";

vi.mock("@/lib/prisma", () => ({
  default: {
    purchaseOrder: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    purchaseOrderEmailAttempt: {
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
    },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
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

vi.mock("@/lib/email/gmail-connection", () => ({
  getGmailAccessTokenForUser: vi.fn(),
  getGmailConnectionStatus: vi.fn(),
}));

vi.mock("@/lib/purchasing/purchase-order-email-contract", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/purchasing/purchase-order-email-contract")>(),
  buildPurchaseOrderEmailContract: vi.fn(),
}));

import prisma from "@/lib/prisma";
import { loadLatestPurchaseOrderDocument, parsePurchaseOrderDocumentSnapshot } from "@/lib/purchasing/purchase-order-document-service";
import { buildPurchaseOrderPdf } from "@/lib/purchasing/purchase-order-pdf";
import { getEmailProvider, createFakeEmailProvider } from "@/lib/email/provider";
import { getGmailAccessTokenForUser, getGmailConnectionStatus } from "@/lib/email/gmail-connection";

describe("purchase order email service", () => {
  const mockOrder = {
    id: "po-1",
    folio: "OC-2026-0042",
    status: "CONFIRMADA",
    emailSendState: "NOT_SENT",
    updatedAt: new Date("2026-06-05T11:30:00.000Z"),
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
    (prisma.purchaseOrderEmailAttempt.update as Mock).mockResolvedValue({});
    (prisma.purchaseOrderEmailAttempt.updateMany as Mock).mockResolvedValue({ count: 1 });
    (prisma.purchaseOrder.update as Mock).mockResolvedValue({});
    (prisma.purchaseOrder.updateMany as Mock).mockResolvedValue({ count: 1 });
    (prisma.auditLog.create as Mock).mockResolvedValue({});
    (prisma.$transaction as Mock).mockImplementation(async (work: (tx: unknown) => Promise<unknown>) => work(prisma));
    (getGmailConnectionStatus as Mock).mockResolvedValue({ connected: false });
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
        sendState: "SENDING",
        recipientEmail: "compras@proveedor.test",
        senderEmail: "mailer@wms.invalid",
        provider: "fake",
      }),
    }));
    expect(prisma.purchaseOrderEmailAttempt.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ sendState: "SENT", providerMessageId: "fake-msg-123" }),
    }));
  });

  it("does not use an environment provider when the Manager has no personal Gmail connection", async () => {
    const result = await sendPurchaseOrderEmail({
      purchaseOrderId: "po-1",
      triggeredByUserId: "user-1",
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("GMAIL_NOT_CONNECTED");
    expect(getEmailProvider).not.toHaveBeenCalled();
    expect(getGmailAccessTokenForUser).not.toHaveBeenCalled();
  });

  it("resolves a Gmail provider and sender only for the requested Manager", async () => {
    (getGmailConnectionStatus as Mock).mockResolvedValue({ connected: true, status: "CONNECTED", email: "manager@example.test", connectedAt: new Date() });
    (getGmailAccessTokenForUser as Mock).mockResolvedValue("user-scoped-access-token");

    const emailService = await getEmailService("manager-7");

    expect(emailService?.senderEmail).toBe("manager@example.test");
    expect(emailService?.provider.providerId).toBe("gmail");
    expect(getGmailConnectionStatus).toHaveBeenCalledWith("manager-7");
    expect(getGmailAccessTokenForUser).toHaveBeenCalledWith("manager-7", "manager@example.test");
  });

  it("requires an explicit manual confirmation before retrying an uncertain send", async () => {
    (prisma.purchaseOrder.findUnique as Mock).mockResolvedValue({ ...mockOrder, emailSendState: "SEND_UNKNOWN" });

    const result = await sendPurchaseOrderEmail({ purchaseOrderId: "po-1", triggeredByUserId: "user-1" }, { provider: fakeProvider });

    expect(result).toMatchObject({ success: false, errorCode: "SEND_RESULT_UNKNOWN", sendState: "SEND_UNKNOWN" });
    expect(fakeProvider.send).not.toHaveBeenCalled();
    expect(prisma.purchaseOrder.updateMany).not.toHaveBeenCalled();
  });

  it("records an acknowledged uncertain retry with a distinct manual-resend source", async () => {
    (prisma.purchaseOrder.findUnique as Mock).mockResolvedValue({ ...mockOrder, emailSendState: "SEND_UNKNOWN" });
    (prisma.purchaseOrderEmailAttempt.count as Mock).mockResolvedValue(1);

    const result = await sendPurchaseOrderEmail({
      purchaseOrderId: "po-1",
      triggeredByUserId: "user-1",
      confirmUnknownResend: true,
    }, { provider: fakeProvider });

    expect(result.sendState).toBe("RESENT");
    expect(prisma.purchaseOrderEmailAttempt.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ attemptNumber: 2, triggerSource: "MANUAL_RESEND_UNCERTAIN" }),
    }));
  });

  it("serializes concurrent sends with a durable order claim", async () => {
    (prisma.purchaseOrder.updateMany as Mock).mockResolvedValue({ count: 0 });

    const result = await sendPurchaseOrderEmail({ purchaseOrderId: "po-1", triggeredByUserId: "user-1" }, { provider: fakeProvider });

    expect(result).toMatchObject({ success: false, errorCode: "SEND_IN_PROGRESS", sendState: "SENDING" });
    expect(fakeProvider.send).not.toHaveBeenCalled();
    expect(prisma.purchaseOrderEmailAttempt.create).not.toHaveBeenCalled();
  });

  it("reconciles only a stale sending claim without sending and records the reviewing Manager", async () => {
    (prisma.purchaseOrder.findUnique as Mock).mockResolvedValue({
      id: "po-1",
      emailSendState: "SENDING",
      emailSendClaimToken: "claim-1",
      emailSendClaimedAt: new Date(Date.now() - 180_000),
    });
    (prisma.purchaseOrderEmailAttempt.findFirst as Mock).mockResolvedValue({ id: "attempt-stale" });

    const result = await markStalePurchaseOrderEmailAttemptUnknown({
      purchaseOrderId: "po-1",
      reconciledByUserId: "manager-1",
    });

    expect(result).toEqual({ reconciled: true, status: "RECONCILED" });
    expect(prisma.purchaseOrder.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ emailSendClaimToken: "claim-1", emailSendState: "SENDING" }),
      data: expect.objectContaining({ emailSendState: "SEND_UNKNOWN", emailSendClaimToken: null }),
    }));
    expect(prisma.purchaseOrderEmailAttempt.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "attempt-stale", sendState: "SENDING" },
      data: expect.objectContaining({ sendState: "SEND_UNKNOWN", errorCode: "STALE_SEND_REQUIRES_REVIEW" }),
    }));
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ actorUserId: "manager-1", action: "RECONCILE_PURCHASE_ORDER_EMAIL_UNKNOWN" }),
    }));
    expect(fakeProvider.send).not.toHaveBeenCalled();
  });

  it("does not reconcile a recent sending claim", async () => {
    (prisma.purchaseOrder.findUnique as Mock).mockResolvedValue({
      id: "po-1",
      emailSendState: "SENDING",
      emailSendClaimToken: "claim-1",
      emailSendClaimedAt: new Date(Date.now() - 30_000),
    });

    const result = await markStalePurchaseOrderEmailAttemptUnknown({ purchaseOrderId: "po-1", reconciledByUserId: "manager-1" });

    expect(result).toEqual({ reconciled: false, status: "NOT_STALE" });
    expect(prisma.purchaseOrder.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("releases a stale claim with no attempt row after a crash before attempt persistence", async () => {
    (prisma.purchaseOrder.findUnique as Mock).mockResolvedValue({
      id: "po-1",
      emailSendState: "SENDING",
      emailSendClaimToken: "orphan-claim",
      emailSendClaimedAt: new Date(Date.now() - 180_000),
    });
    (prisma.purchaseOrderEmailAttempt.findFirst as Mock).mockResolvedValue(null);

    const result = await markStalePurchaseOrderEmailAttemptUnknown({ purchaseOrderId: "po-1", reconciledByUserId: "manager-1" });

    expect(result).toEqual({ reconciled: true, status: "RECONCILED" });
    expect(prisma.purchaseOrderEmailAttempt.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ before: expect.stringContaining('"attemptId":null') }),
    }));
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
    expect(result.sendState).toBe("SEND_UNKNOWN");
    expect(result.errorCode).toBe("PROVIDER_RESULT_UNKNOWN");
    expect(result.errorMessage).not.toContain("SES rate limit");
  });

  it("should mark as RESEND on second attempt", async () => {
    (prisma.purchaseOrder.findUnique as Mock).mockResolvedValue({ ...mockOrder, emailSendState: "SENT" });
    (prisma.purchaseOrderEmailAttempt.count as Mock).mockResolvedValue(1);
    (prisma.purchaseOrderEmailAttempt.findFirst as Mock).mockResolvedValue({ attemptNumber: 1 });

    const result = await sendPurchaseOrderEmail({
      purchaseOrderId: "po-1",
      triggeredByUserId: "user-1",
    }, { provider: fakeProvider });

    expect(result.success).toBe(true);
    expect(result.sendState).toBe("RESENT");
    expect(prisma.purchaseOrderEmailAttempt.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ triggerSource: "MANUAL_RESEND" }),
    }));
  });
});
