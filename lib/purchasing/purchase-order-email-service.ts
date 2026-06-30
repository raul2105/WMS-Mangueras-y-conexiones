import prisma from "@/lib/prisma";
import { buildPurchaseOrderEmailContract, type PurchaseOrderEmailSource } from "@/lib/purchasing/purchase-order-email-contract";
import { getEmailProvider, type EmailProvider, createFakeEmailProvider } from "@/lib/email/provider";
import { loadLatestPurchaseOrderDocument, parsePurchaseOrderDocumentSnapshot } from "@/lib/purchasing/purchase-order-document-service";
import { buildPurchaseOrderPdf } from "@/lib/purchasing/purchase-order-pdf";
import { PurchaseOrderEmailSendState } from "@prisma/client";

export type SendPurchaseOrderEmailInput = {
  purchaseOrderId: string;
  triggeredByUserId: string;
  triggerSource?: string;
};

export type SendPurchaseOrderEmailResult = {
  success: boolean;
  attemptId?: string;
  messageId?: string;
  errorCode?: string;
  errorMessage?: string;
  sendState: PurchaseOrderEmailSendState;
};

export type EmailServiceConfig = {
  provider: EmailProvider;
};

/**
 * Send a Purchase Order email with official PDF attachment.
 * Persists the attempt and updates the PO email fields.
 */
export async function sendPurchaseOrderEmail(
  input: SendPurchaseOrderEmailInput,
  config: EmailServiceConfig
): Promise<SendPurchaseOrderEmailResult> {
  const { purchaseOrderId, triggeredByUserId, triggerSource = "MANUAL" } = input;
  const provider = config.provider;

  // 1. Load PO with all required relations
  const order = await prisma.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    select: {
      id: true,
      folio: true,
      status: true,
      deliveryAddressSnapshot: true,
      paymentTermsSnapshot: true,
      expectedDate: true,
      emailSendState: true,
      emailRecipientSnapshot: true,
      emailSubjectSnapshot: true,
      emailBodySnapshot: true,
      emailDocumentVersionSnapshot: true,
      supplier: {
        select: {
          id: true,
          code: true,
          name: true,
          businessName: true,
          legalName: true,
          email: true,
          paymentTerms: true,
        },
      },
    },
  });

  if (!order) {
    return { success: false, errorCode: "PO_NOT_FOUND", errorMessage: "Orden de compra no encontrada", sendState: "FAILED" };
  }

  // 2. Load official document
  const documentRecord = await loadLatestPurchaseOrderDocument({ purchaseOrderId, prismaClient: prisma });
  let documentSnapshot = null;
  if (documentRecord) {
    try {
      documentSnapshot = parsePurchaseOrderDocumentSnapshot(documentRecord.snapshotJson);
    } catch {
      documentSnapshot = null;
    }
  }

  // 3. Build email contract to validate preconditions
  const emailContract = buildPurchaseOrderEmailContract({
    purchaseOrder: {
      ...order,
      emailLastAttemptAt: null,
      emailLastSentAt: null,
      emailLastErrorCode: null,
      emailLastErrorMessage: null,
    } as PurchaseOrderEmailSource,
    documentRecord,
    documentSnapshot,
    providerConfigured: true, // We know provider exists because we got here
  });

  // 4. Validate preconditions
  if (emailContract.blockedReasons.length > 0) {
    return {
      success: false,
      errorCode: "BLOCKED",
      errorMessage: emailContract.blockedReasons.join("; "),
      sendState: "FAILED",
    };
  }

  if (!emailContract.recipientEmail) {
    return {
      success: false,
      errorCode: "NO_RECIPIENT",
      errorMessage: "El proveedor no tiene email registrado",
      sendState: "FAILED",
    };
  }

  if (!emailContract.document) {
    return {
      success: false,
      errorCode: "NO_DOCUMENT",
      errorMessage: "No existe el documento oficial congelado de la OC",
      sendState: "FAILED",
    };
  }

  // 5. Determine attempt number and new send state
  const existingAttempts = await prisma.purchaseOrderEmailAttempt.count({
    where: { purchaseOrderId },
  });
  const attemptNumber = existingAttempts + 1;
  const isResend = attemptNumber > 1;
  const newSendState: PurchaseOrderEmailSendState = isResend ? "RESENT" : "SENT";

  // 6. Generate PDF attachment from frozen snapshot
  let pdfBuffer: Buffer;
  try {
    if (!documentSnapshot) {
      return {
        success: false,
        errorCode: "SNAPSHOT_MISSING",
        errorMessage: "Snapshot del documento oficial no disponible para generar PDF",
        sendState: "FAILED",
      };
    }
    const pdfResult = await buildPurchaseOrderPdf({
      documentSnapshot,
      purchaseOrderFolio: order.folio,
    });
    pdfBuffer = Buffer.from(pdfResult.pdfArrayBuffer);
  } catch (error) {
    return {
      success: false,
      errorCode: "PDF_GENERATION_FAILED",
      errorMessage: `Error generando PDF: ${error instanceof Error ? error.message : "Error desconocido"}`,
      sendState: "FAILED",
    };
  }

  // 7. Send email with attachment
  let messageId: string;
  let errorCode: string | undefined;
  let errorMessage: string | undefined;
  let finalSendState: PurchaseOrderEmailSendState = newSendState;

  try {
    const attachmentFilename = `OC-${order.folio.replace(/^OC-/, '')}-v${emailContract.document.versionNumber}.pdf`;
    const result = await provider.send({
      to: emailContract.recipientEmail,
      subject: emailContract.subject,
      body: emailContract.body,
      attachment: {
        filename: attachmentFilename,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    });
    messageId = result.messageId;
  } catch (error) {
    errorCode = "PROVIDER_ERROR";
    errorMessage = error instanceof Error ? error.message : "Error desconocido del proveedor de correo";
    finalSendState = "FAILED";
    messageId = "";
  }

  // 8. Persist attempt record
  const attempt = await prisma.purchaseOrderEmailAttempt.create({
    data: {
      purchaseOrderId,
      attemptNumber,
      sendState: finalSendState,
      recipientEmail: emailContract.recipientEmail,
      subject: emailContract.subject,
      body: emailContract.body,
      purchaseOrderDocumentId: documentRecord?.id ?? null,
      documentVersion: emailContract.document.versionNumber,
      snapshotHash: documentSnapshot?.metadata.snapshotHash ?? documentRecord?.snapshotHash ?? null,
      errorCode: errorCode ?? null,
      errorMessage: errorMessage ?? null,
      triggeredByUserId,
      triggerSource,
    },
  });

  // 9. Update PO email fields
  await prisma.purchaseOrder.update({
    where: { id: purchaseOrderId },
    data: {
      emailSendState: finalSendState,
      emailRecipientSnapshot: emailContract.recipientEmail,
      emailSubjectSnapshot: emailContract.subject,
      emailBodySnapshot: emailContract.body,
      emailDocumentVersionSnapshot: emailContract.document.versionNumber,
      emailLastAttemptAt: new Date(),
      ...(finalSendState !== "FAILED" ? { emailLastSentAt: new Date() } : {}),
      emailLastErrorCode: errorCode ?? null,
      emailLastErrorMessage: errorMessage ?? null,
    },
  });

  return {
    success: finalSendState !== "FAILED",
    attemptId: attempt.id,
    messageId,
    errorCode,
    errorMessage,
    sendState: finalSendState,
  };
}

/**
 * Create a fake email service for testing
 */
export function createFakeEmailService() {
  const { provider, sentEmails } = createFakeEmailProvider();
  return {
    provider,
    sentEmails,
    async send(input: SendPurchaseOrderEmailInput) {
      return sendPurchaseOrderEmail(input, { provider });
    },
  };
}

/**
 * Get production email service with real provider
 * Returns null if provider is not configured
 */
export async function getEmailService(): Promise<{ provider: EmailProvider } | null> {
  const provider = getEmailProvider();
  if (!provider) {
    return null;
  }
  return { provider };
}