-- Preserve line-level receiving discrepancies for operational traceability.
ALTER TABLE "PurchaseReceiptLine" ADD COLUMN IF NOT EXISTS "qtyDamaged" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseReceiptLine" ADD COLUMN IF NOT EXISTS "qtyMissing" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseReceiptLine" ADD COLUMN IF NOT EXISTS "qtyRejected" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseReceiptLine" ADD COLUMN IF NOT EXISTS "qtySurplusReported" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseReceiptLine" ADD COLUMN IF NOT EXISTS "discrepancyReason" TEXT;
