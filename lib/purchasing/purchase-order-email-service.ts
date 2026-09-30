import prisma from "@/lib/prisma";
import { buildPurchaseOrderEmailContract, STALE_PURCHASE_ORDER_EMAIL_CLAIM_MS, type PurchaseOrderEmailSource } from "@/lib/purchasing/purchase-order-email-contract";
import type { EmailProvider } from "@/lib/email/provider";
import { createFakeEmailProvider } from "@/lib/email/provider";
import { GmailDeliveryError, createGmailEmailProvider } from "@/lib/email/gmail-provider";
import { getGmailAccessTokenForUser, getGmailConnectionStatus, GmailReauthorizationRequiredError } from "@/lib/email/gmail-connection";
import { loadLatestPurchaseOrderDocument, parsePurchaseOrderDocumentSnapshot } from "@/lib/purchasing/purchase-order-document-service";
import { buildPurchaseOrderPdf } from "@/lib/purchasing/purchase-order-pdf";
import { PurchaseOrderEmailSendState } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

export type SendPurchaseOrderEmailInput = {
  purchaseOrderId: string;
  triggeredByUserId: string;
  triggerSource?: string;
  confirmUnknownResend?: boolean;
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
  senderEmail?: string;
  prismaClient?: PrismaClient;
};

export type ReconcilePurchaseOrderEmailResult = {
  reconciled: boolean;
  status: "RECONCILED" | "PO_NOT_FOUND" | "NOT_STALE" | "RACE_LOST";
};

/**
 * Convert a crashed sender claim to an explicit uncertain result after the
 * provider's bounded call and the maximum Lambda duration have elapsed.
 * This performs no provider I/O and never retries the message.
 */
export async function markStalePurchaseOrderEmailAttemptUnknown(input: {
  purchaseOrderId: string;
  reconciledByUserId: string;
  now?: Date;
}): Promise<ReconcilePurchaseOrderEmailResult> {
  const now = input.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    const order = await tx.purchaseOrder.findUnique({
      where: { id: input.purchaseOrderId },
      select: { id: true, emailSendState: true, emailSendClaimToken: true, emailSendClaimedAt: true },
    });
    if (!order) return { reconciled: false, status: "PO_NOT_FOUND" };
    if (order.emailSendState !== "SENDING" || !order.emailSendClaimToken || !order.emailSendClaimedAt ||
        now.getTime() - order.emailSendClaimedAt.getTime() < STALE_PURCHASE_ORDER_EMAIL_CLAIM_MS) {
      return { reconciled: false, status: "NOT_STALE" };
    }

    const attempt = await tx.purchaseOrderEmailAttempt.findFirst({
      where: { purchaseOrderId: input.purchaseOrderId, sendState: "SENDING" },
      orderBy: { attemptNumber: "desc" },
      select: { id: true },
    });
    const claim = await tx.purchaseOrder.updateMany({
      where: {
        id: input.purchaseOrderId,
        emailSendState: "SENDING",
        emailSendClaimToken: order.emailSendClaimToken,
        emailSendClaimedAt: order.emailSendClaimedAt,
      },
      data: {
        emailSendState: "SEND_UNKNOWN",
        emailSendClaimToken: null,
        emailSendClaimedAt: null,
        emailLastErrorCode: "STALE_SEND_REQUIRES_REVIEW",
        emailLastErrorMessage: "El proceso de envío terminó sin confirmar el resultado. Revisa Gmail antes de decidir un reenvío manual.",
      },
    });
    if (claim.count !== 1) return { reconciled: false, status: "RACE_LOST" };

    if (attempt) {
      await tx.purchaseOrderEmailAttempt.updateMany({
        where: { id: attempt.id, sendState: "SENDING" },
        data: {
          sendState: "SEND_UNKNOWN",
          errorCode: "STALE_SEND_REQUIRES_REVIEW",
          errorMessage: "El proceso de envío terminó sin confirmar el resultado. Revisa Gmail antes de decidir un reenvío manual.",
        },
      });
    }
    await tx.auditLog.create({
      data: {
        entityType: "PurchaseOrder",
        entityId: input.purchaseOrderId,
        action: "RECONCILE_PURCHASE_ORDER_EMAIL_UNKNOWN",
        before: JSON.stringify({ emailSendState: "SENDING", attemptId: attempt?.id ?? null }),
        after: JSON.stringify({ emailSendState: "SEND_UNKNOWN", requiresManagerReview: true }),
        actorUserId: input.reconciledByUserId,
        source: "purchasing/purchase-order-email-service",
      },
    });
    return { reconciled: true, status: "RECONCILED" };
  });
}

/**
 * Send a Purchase Order email with official PDF attachment.
 * Persists the attempt and updates the PO email fields.
 */
export async function sendPurchaseOrderEmail(
  input: SendPurchaseOrderEmailInput,
  config?: EmailServiceConfig
): Promise<SendPurchaseOrderEmailResult> {
  const db = config?.prismaClient ?? prisma;
  const { purchaseOrderId, triggeredByUserId, triggerSource = "MANUAL" } = input;
  let provider = config?.provider;
  let senderEmail = config ? (config.senderEmail ?? "mailer@wms.invalid") : null;
  let managerGmail: Awaited<ReturnType<typeof getGmailConnectionStatus>> | null = null;
  if (!provider) {
    managerGmail = await getGmailConnectionStatus(triggeredByUserId);
    if (!managerGmail.connected || !managerGmail.email) {
      return { success: false, errorCode: "GMAIL_NOT_CONNECTED", errorMessage: "Conecta una cuenta Gmail personal antes de enviar.", sendState: "FAILED" };
    }
    if (managerGmail.status !== "CONNECTED") {
      return { success: false, errorCode: "GMAIL_REAUTH_REQUIRED", errorMessage: "La conexión Gmail requiere volver a autorizarse.", sendState: "FAILED" };
    }
    senderEmail = managerGmail.email;
  }
  if (!senderEmail) {
    return { success: false, errorCode: "GMAIL_SENDER_UNAVAILABLE", errorMessage: "No se pudo verificar la cuenta Gmail remitente.", sendState: "FAILED" };
  }

  // 1. Load PO with all required relations
  const order = await db.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    select: {
      id: true,
      folio: true,
      status: true,
      deliveryAddressSnapshot: true,
      paymentTermsSnapshot: true,
      expectedDate: true,
      emailSendState: true,
      updatedAt: true,
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
  const documentRecord = await loadLatestPurchaseOrderDocument({ purchaseOrderId, prismaClient: db });
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

  if (order.emailSendState === "SEND_UNKNOWN" && !input.confirmUnknownResend) {
    return { success: false, errorCode: "SEND_RESULT_UNKNOWN", errorMessage: "El resultado del envío anterior es incierto. Confirma explícitamente un reenvío manual después de verificar Gmail.", sendState: "SEND_UNKNOWN" };
  }
  if (order.emailSendState === "SENDING") {
    return { success: false, errorCode: "SEND_IN_PROGRESS", errorMessage: "El intento anterior sigue en curso o requiere conciliación manual.", sendState: "SENDING" };
  }
  const effectiveTriggerSource = order.emailSendState === "SEND_UNKNOWN"
    ? "MANUAL_RESEND_UNCERTAIN"
    : order.emailSendState === "SENT" || order.emailSendState === "RESENT"
      ? "MANUAL_RESEND"
      : order.emailSendState === "FAILED"
        ? "MANUAL_RETRY"
        : triggerSource;

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

  if (!provider && managerGmail) {
    try {
      provider = createGmailEmailProvider({
        accessToken: await getGmailAccessTokenForUser(triggeredByUserId),
        fromEmail: managerGmail.email,
      });
    } catch (error) {
      const reauthorizationRequired = error instanceof GmailReauthorizationRequiredError;
      return {
        success: false,
        errorCode: reauthorizationRequired ? "GMAIL_REAUTH_REQUIRED" : "GMAIL_TOKEN_UNAVAILABLE",
        errorMessage: reauthorizationRequired
          ? "La conexión Gmail requiere volver a autorizarse."
          : "No se pudo renovar la sesión de Gmail. Inténtalo nuevamente antes de enviar.",
        sendState: "FAILED",
      };
    }
  }
  if (!provider) {
    return { success: false, errorCode: "GMAIL_NOT_CONNECTED", errorMessage: "No se pudo configurar el envío Gmail.", sendState: "FAILED" };
  }

  // Claim the order before creating the durable attempt; provider I/O stays outside DB transactions.
  const claimToken = randomUUID();
  const claim = await db.purchaseOrder.updateMany({
    where: {
      id: purchaseOrderId,
      emailSendClaimToken: null,
      emailSendState: order.emailSendState,
      updatedAt: order.updatedAt,
    },
    data: {
      updatedAt: new Date(Math.max(Date.now(), order.updatedAt.getTime() + 1)),
      emailSendState: "SENDING",
      emailSendClaimToken: claimToken,
      emailSendClaimedAt: new Date(),
      emailLastAttemptAt: new Date(),
      emailLastErrorCode: null,
      emailLastErrorMessage: null,
    },
  });
  if (claim.count !== 1) {
    return { success: false, errorCode: "SEND_IN_PROGRESS", errorMessage: "Ya existe un envío en curso o pendiente de conciliación.", sendState: "SENDING" };
  }

  const attemptNumber = await db.purchaseOrderEmailAttempt.count({ where: { purchaseOrderId } }) + 1;
  let attempt;
  try {
    attempt = await db.purchaseOrderEmailAttempt.create({
      data: {
        purchaseOrderId,
        attemptNumber,
        sendState: "SENDING",
        recipientEmail: emailContract.recipientEmail,
        subject: emailContract.subject,
        body: emailContract.body,
        purchaseOrderDocumentId: documentRecord?.id ?? null,
        documentVersion: emailContract.document.versionNumber,
        snapshotHash: documentSnapshot?.metadata.snapshotHash ?? documentRecord?.snapshotHash ?? null,
        errorCode: null,
        errorMessage: null,
        triggeredByUserId,
        triggerSource: effectiveTriggerSource,
        provider: provider.providerId,
        senderEmail,
      },
    });
  } catch {
    await db.purchaseOrder.updateMany({
      where: { id: purchaseOrderId, emailSendClaimToken: claimToken },
      data: { emailSendState: order.emailSendState ?? "NOT_SENT", emailSendClaimToken: null, emailSendClaimedAt: null },
    });
    return { success: false, errorCode: "ATTEMPT_PERSIST_FAILED", errorMessage: "No se pudo registrar el intento de correo antes del envío.", sendState: "FAILED" };
  }

  let finalSendState: PurchaseOrderEmailSendState = attemptNumber === 1 ? "SENT" : "RESENT";
  let messageId: string | undefined;
  let errorCode: string | undefined;
  let errorMessage: string | undefined;
  try {
    const attachmentFilename = `OC-${order.folio.replace(/^OC-/, '')}-v${emailContract.document.versionNumber}.pdf`;
    const result = await provider.send({
      to: emailContract.recipientEmail,
      subject: emailContract.subject,
      body: emailContract.body,
      attachment: { filename: attachmentFilename, content: pdfBuffer, contentType: "application/pdf" },
    });
    messageId = result.messageId;
  } catch (error) {
    const deliveryUnknown = !(error instanceof GmailDeliveryError) || error.deliveryUnknown;
    finalSendState = deliveryUnknown ? "SEND_UNKNOWN" : "FAILED";
    errorCode = error instanceof GmailDeliveryError ? error.errorCode : "PROVIDER_RESULT_UNKNOWN";
    errorMessage = error instanceof GmailDeliveryError
      ? error.message
      : "El proveedor no confirmó el resultado; verifica la bandeja Gmail antes de reenviar.";
  }

  await db.purchaseOrderEmailAttempt.update({
    where: { id: attempt.id },
    data: { sendState: finalSendState, providerMessageId: messageId ?? null, errorCode: errorCode ?? null, errorMessage: errorMessage ?? null },
  });
  const finalized = await db.purchaseOrder.updateMany({
    where: { id: purchaseOrderId, emailSendClaimToken: claimToken },
    data: {
      emailSendState: finalSendState,
      emailSendClaimToken: null,
      emailSendClaimedAt: null,
      emailRecipientSnapshot: emailContract.recipientEmail,
      emailSubjectSnapshot: emailContract.subject,
      emailBodySnapshot: emailContract.body,
      emailDocumentVersionSnapshot: emailContract.document.versionNumber,
      ...(messageId ? { emailLastSentAt: new Date() } : {}),
      emailLastErrorCode: errorCode ?? null,
      emailLastErrorMessage: errorMessage ?? null,
    },
  });
  if (finalized.count !== 1) {
    return { success: false, attemptId: attempt.id, errorCode: "FINALIZE_PENDING", errorMessage: "El intento quedó registrado y requiere conciliación manual.", sendState: "SEND_UNKNOWN" };
  }

  return {
    success: finalSendState === "SENT" || finalSendState === "RESENT",
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
 * Get the email provider backed by the calling Manager's Gmail connection.
 */
export async function getEmailService(userId: string): Promise<{ provider: EmailProvider; senderEmail: string } | null> {
  const connection = await getGmailConnectionStatus(userId);
  if (!connection.connected || connection.status !== "CONNECTED") {
    return null;
  }
  try {
    const provider = createGmailEmailProvider({
      accessToken: await getGmailAccessTokenForUser(userId),
      fromEmail: connection.email,
    });
    return { provider, senderEmail: connection.email };
  } catch {
    return null;
  }
}
