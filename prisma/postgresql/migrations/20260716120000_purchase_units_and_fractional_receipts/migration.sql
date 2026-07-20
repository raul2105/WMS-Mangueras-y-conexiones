-- Preserve existing OC quantities as supplier quantities and introduce an
-- immutable conversion to the product base unit for future purchase lines.
ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "purchaseUnitLabel" TEXT,
  ADD COLUMN IF NOT EXISTS "purchaseUnitFactor" DOUBLE PRECISION NOT NULL DEFAULT 1;

ALTER TABLE "PurchaseOrderLine"
  ALTER COLUMN "qtyOrdered" TYPE DOUBLE PRECISION USING "qtyOrdered"::DOUBLE PRECISION,
  ALTER COLUMN "qtyReceived" TYPE DOUBLE PRECISION USING "qtyReceived"::DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "purchaseUnitLabel" TEXT,
  ADD COLUMN IF NOT EXISTS "purchaseUnitFactor" DOUBLE PRECISION NOT NULL DEFAULT 1;

ALTER TABLE "PurchaseReceiptLine"
  ALTER COLUMN "qtyReceived" TYPE DOUBLE PRECISION USING "qtyReceived"::DOUBLE PRECISION,
  ALTER COLUMN "qtyDamaged" TYPE DOUBLE PRECISION USING "qtyDamaged"::DOUBLE PRECISION,
  ALTER COLUMN "qtyMissing" TYPE DOUBLE PRECISION USING "qtyMissing"::DOUBLE PRECISION,
  ALTER COLUMN "qtyRejected" TYPE DOUBLE PRECISION USING "qtyRejected"::DOUBLE PRECISION,
  ALTER COLUMN "qtySurplusReported" TYPE DOUBLE PRECISION USING "qtySurplusReported"::DOUBLE PRECISION;
