import { buildPurchaseOrderPdfFilename, getSupplierDisplayLines } from "@/lib/purchasing/purchase-order-pdf";
import type {
  PurchaseOrderDocumentRecord,
  PurchaseOrderDocumentSnapshot,
} from "@/lib/purchasing/purchase-order-document-service";

export type PurchaseOrderEmailSendState = "NOT_SENT" | "SENT" | "RESENT" | "FAILED";

export const PURCHASE_ORDER_EMAIL_SEND_STATE_LABELS: Record<PurchaseOrderEmailSendState, string> = {
  NOT_SENT: "No enviado",
  SENT: "Enviado",
  RESENT: "Reenviado",
  FAILED: "Fallido",
};

function normalizeText(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function formatDateToken(value: string | Date | null | undefined) {
  if (!value) return "Pendiente";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Pendiente";
  return date.toISOString().slice(0, 10);
}

function formatOptionalText(value: string | null | undefined) {
  return normalizeText(value) ?? "No definido";
}

function formatSupplierDisplayName(input: {
  businessName?: string | null;
  legalName?: string | null;
  name?: string | null;
}) {
  const { primary } = getSupplierDisplayLines({
    code: "",
    name: input.name ?? "",
    businessName: input.businessName ?? null,
    legalName: input.legalName ?? null,
    taxId: null,
    email: null,
    phone: null,
    address: null,
    paymentTerms: null,
  });

  return primary === "—" ? "Proveedor" : primary;
}

export type PurchaseOrderEmailSource = {
  id: string;
  folio: string;
  status: string;
  emailSendState: PurchaseOrderEmailSendState | null;
  emailRecipientSnapshot: string | null;
  emailSubjectSnapshot: string | null;
  emailBodySnapshot: string | null;
  emailDocumentVersionSnapshot: number | null;
  emailLastAttemptAt: Date | string | null;
  emailLastSentAt: Date | string | null;
  emailLastErrorCode: string | null;
  emailLastErrorMessage: string | null;
  deliveryAddressSnapshot: string | null;
  paymentTermsSnapshot: string | null;
  expectedDate: Date | string | null;
  supplier: {
    code: string;
    name: string;
    legalName?: string | null;
    businessName: string | null;
    email: string | null;
    paymentTerms: string | null;
  };
};

export type PurchaseOrderEmailContract = {
  purchaseOrderId: string;
  folio: string;
  status: string;
  sendState: PurchaseOrderEmailSendState;
  sendStateLabel: string;
  providerConfigured: boolean;
  providerNote: string;
  recipientEmail: string | null;
  subject: string;
  body: string;
  canSend: boolean;
  blockedReasons: string[];
  document: {
    versionNumber: number;
    snapshotHash: string | null;
    attachmentFilename: string | null;
    isSnapshotValid: boolean;
  } | null;
  lastAttemptAt: string | null;
  lastSentAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
};

export function getPurchaseOrderEmailStateLabel(state: PurchaseOrderEmailSendState | null | undefined) {
  return PURCHASE_ORDER_EMAIL_SEND_STATE_LABELS[state ?? "NOT_SENT"];
}

export function buildPurchaseOrderEmailSubject(input: { folio: string }) {
  const folio = normalizeText(input.folio) ?? "OC";
  return `Orden de Compra ${folio} - WMS Mangueras y Conexiones`;
}

export function resolvePurchaseOrderEmailRecipient(input: {
  persistedRecipientEmail?: string | null;
  frozenSupplierEmail?: string | null;
  liveSupplierEmail?: string | null;
}) {
  return normalizeText(input.persistedRecipientEmail)
    ?? normalizeText(input.frozenSupplierEmail)
    ?? normalizeText(input.liveSupplierEmail);
}

export function buildPurchaseOrderEmailBody(input: {
  folio: string;
  supplierDisplayName: string;
  documentVersion: number | null;
  expectedDate: string | Date | null;
  deliveryAddress: string | null;
  paymentTerms: string | null;
}) {
  const documentVersionText = input.documentVersion ? `v${input.documentVersion}` : "Pendiente";
  const expectedDateText = formatDateToken(input.expectedDate);
  const deliveryAddressText = formatOptionalText(input.deliveryAddress);
  const paymentTermsText = formatOptionalText(input.paymentTerms);

  return [
    `Hola ${normalizeText(input.supplierDisplayName) ?? "Proveedor"},`,
    "",
    `Adjuntamos la Orden de Compra ${normalizeText(input.folio) ?? "OC"} de WMS Mangueras y Conexiones.`,
    "",
    "Datos de referencia:",
    `Folio: ${normalizeText(input.folio) ?? "OC"}`,
    `Documento oficial: ${documentVersionText}`,
    `Fecha esperada: ${expectedDateText}`,
    `Dirección de entrega: ${deliveryAddressText}`,
    `Términos de pago: ${paymentTermsText}`,
    "",
    "El PDF adjunto corresponde al documento oficial congelado de la OC.",
    "",
    "Saludos,",
    "Compras",
    "WMS Mangueras y Conexiones",
  ].join("\n");
}

function getDocumentContext(input: {
  purchaseOrder: PurchaseOrderEmailSource;
  documentSnapshot?: PurchaseOrderDocumentSnapshot | null;
}) {
  const supplierDisplayName = formatSupplierDisplayName(input.purchaseOrder.supplier);
  const documentVersion = input.documentSnapshot?.documentVersion
    ?? input.purchaseOrder.emailDocumentVersionSnapshot
    ?? null;

  return {
    supplierDisplayName,
    documentVersion,
    expectedDate: input.documentSnapshot?.purchaseOrder.expectedDate
      ?? input.purchaseOrder.expectedDate,
    deliveryAddress: input.documentSnapshot?.purchaseOrder.deliveryAddressSnapshot
      ?? input.purchaseOrder.deliveryAddressSnapshot,
    paymentTerms: input.documentSnapshot?.purchaseOrder.paymentTermsSnapshot
      ?? input.purchaseOrder.paymentTermsSnapshot
      ?? input.purchaseOrder.supplier.paymentTerms,
  };
}

export function buildPurchaseOrderEmailContract(input: {
  purchaseOrder: PurchaseOrderEmailSource;
  documentRecord?: PurchaseOrderDocumentRecord | null;
  documentSnapshot?: PurchaseOrderDocumentSnapshot | null;
  providerConfigured?: boolean;
}): PurchaseOrderEmailContract {
  const providerConfigured = input.providerConfigured ?? false;
  const documentRecord = input.documentRecord ?? null;
  const documentSnapshot = input.documentSnapshot ?? null;
  const context = getDocumentContext({
    purchaseOrder: input.purchaseOrder,
    documentSnapshot,
  });

  const sendState = input.purchaseOrder.emailSendState ?? "NOT_SENT";
  const sendStateLabel = getPurchaseOrderEmailStateLabel(sendState);
  const recipientEmail = resolvePurchaseOrderEmailRecipient({
    persistedRecipientEmail: input.purchaseOrder.emailRecipientSnapshot,
    frozenSupplierEmail: documentSnapshot?.supplier.email,
    liveSupplierEmail: input.purchaseOrder.supplier.email,
  });
  const subject = normalizeText(input.purchaseOrder.emailSubjectSnapshot)
    ?? buildPurchaseOrderEmailSubject({ folio: input.purchaseOrder.folio });
  const body = normalizeText(input.purchaseOrder.emailBodySnapshot)
    ?? buildPurchaseOrderEmailBody({
      folio: input.purchaseOrder.folio,
      supplierDisplayName: context.supplierDisplayName,
      documentVersion: context.documentVersion,
      expectedDate: context.expectedDate,
      deliveryAddress: context.deliveryAddress,
      paymentTerms: context.paymentTerms,
    });

  const blockedReasons: string[] = [];
  if (!documentRecord && !documentSnapshot) {
    blockedReasons.push("No existe el documento oficial congelado de la OC.");
  } else if (documentRecord && !documentSnapshot) {
    blockedReasons.push("El snapshot oficial está corrupto o es inválido.");
  }
  if (!recipientEmail) {
    blockedReasons.push("El proveedor no tiene email registrado.");
  }

  const attachmentVersion = documentRecord?.versionNumber ?? documentSnapshot?.documentVersion ?? null;
  const document = documentRecord || documentSnapshot
    ? {
        versionNumber: attachmentVersion ?? 0,
        snapshotHash: documentSnapshot?.metadata.snapshotHash ?? documentRecord?.snapshotHash ?? null,
        attachmentFilename: documentSnapshot ? buildPurchaseOrderPdfFilename(input.purchaseOrder.folio) : null,
        isSnapshotValid: Boolean(documentSnapshot),
      }
    : null;

  const providerNote = providerConfigured
    ? "El proveedor de correo está configurado para la siguiente fase."
    : "El envío real por correo no está configurado en este entorno. KAN-85 lo habilitará.";

  return {
    purchaseOrderId: input.purchaseOrder.id,
    folio: input.purchaseOrder.folio,
    status: input.purchaseOrder.status,
    sendState,
    sendStateLabel,
    providerConfigured,
    providerNote,
    recipientEmail,
    subject,
    body,
    canSend: providerConfigured && blockedReasons.length === 0,
    blockedReasons,
    document,
    lastAttemptAt: normalizeDateTime(input.purchaseOrder.emailLastAttemptAt),
    lastSentAt: normalizeDateTime(input.purchaseOrder.emailLastSentAt),
    lastErrorCode: normalizeText(input.purchaseOrder.emailLastErrorCode),
    lastErrorMessage: normalizeText(input.purchaseOrder.emailLastErrorMessage),
  };
}

function normalizeDateTime(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}
