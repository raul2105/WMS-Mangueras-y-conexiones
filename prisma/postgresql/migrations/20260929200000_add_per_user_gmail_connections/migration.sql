-- Per-user Gmail OAuth connections and explicit purchase-order send claims.
-- Additive only: existing attempts and purchase orders remain intact.
BEGIN;

ALTER TYPE "PurchaseOrderEmailSendState" ADD VALUE IF NOT EXISTS 'SENDING';
ALTER TYPE "PurchaseOrderEmailSendState" ADD VALUE IF NOT EXISTS 'SEND_UNKNOWN';

CREATE TYPE "UserGmailConnectionStatus" AS ENUM ('CONNECTED', 'REAUTH_REQUIRED');

ALTER TABLE "PurchaseOrder"
  ADD COLUMN "emailSendClaimToken" TEXT,
  ADD COLUMN "emailSendClaimedAt" TIMESTAMP(3);

ALTER TABLE "PurchaseOrderEmailAttempt"
  ADD COLUMN "senderEmail" TEXT,
  ADD COLUMN "provider" TEXT,
  ADD COLUMN "providerMessageId" TEXT;

CREATE TABLE "UserGmailConnection" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "googleSub" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "encryptedRefreshToken" TEXT NOT NULL,
  "scopes" TEXT NOT NULL,
  "status" "UserGmailConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
  "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastValidatedAt" TIMESTAMP(3),
  "reauthRequiredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserGmailConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserGmailConnection_userId_key" ON "UserGmailConnection"("userId");
CREATE UNIQUE INDEX "UserGmailConnection_googleSub_key" ON "UserGmailConnection"("googleSub");
CREATE INDEX "UserGmailConnection_status_idx" ON "UserGmailConnection"("status");

ALTER TABLE "UserGmailConnection"
  ADD CONSTRAINT "UserGmailConnection_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
