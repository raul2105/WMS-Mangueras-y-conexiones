ALTER TABLE "PurchaseOrder" ADD COLUMN "emailSendState" TEXT NOT NULL DEFAULT 'NOT_SENT';
ALTER TABLE "PurchaseOrder" ADD COLUMN "emailRecipientSnapshot" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN "emailSubjectSnapshot" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN "emailBodySnapshot" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN "emailDocumentVersionSnapshot" INTEGER;
ALTER TABLE "PurchaseOrder" ADD COLUMN "emailLastAttemptAt" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN "emailLastSentAt" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN "emailLastErrorCode" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN "emailLastErrorMessage" TEXT;

CREATE INDEX IF NOT EXISTS "PurchaseOrder_emailSendState_idx"
ON "PurchaseOrder"("emailSendState");

CREATE TABLE IF NOT EXISTS "PurchaseOrderEmailAttempt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "purchaseOrderId" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "sendState" TEXT NOT NULL,
  "recipientEmail" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "purchaseOrderDocumentId" TEXT,
  "documentVersion" INTEGER,
  "snapshotHash" TEXT,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "triggeredByUserId" TEXT,
  "triggerSource" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchaseOrderEmailAttempt_purchaseOrderId_attemptNumber_key" UNIQUE ("purchaseOrderId", "attemptNumber"),
  CONSTRAINT "PurchaseOrderEmailAttempt_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PurchaseOrderEmailAttempt_purchaseOrderDocumentId_fkey" FOREIGN KEY ("purchaseOrderDocumentId") REFERENCES "PurchaseOrderDocument" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "PurchaseOrderEmailAttempt_triggeredByUserId_fkey" FOREIGN KEY ("triggeredByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "PurchaseOrderEmailAttempt_purchaseOrderId_createdAt_idx"
ON "PurchaseOrderEmailAttempt"("purchaseOrderId", "createdAt");

CREATE INDEX IF NOT EXISTS "PurchaseOrderEmailAttempt_sendState_idx"
ON "PurchaseOrderEmailAttempt"("sendState");

CREATE INDEX IF NOT EXISTS "PurchaseOrderEmailAttempt_triggeredByUserId_idx"
ON "PurchaseOrderEmailAttempt"("triggeredByUserId");

CREATE INDEX IF NOT EXISTS "PurchaseOrderEmailAttempt_purchaseOrderDocumentId_idx"
ON "PurchaseOrderEmailAttempt"("purchaseOrderDocumentId");
