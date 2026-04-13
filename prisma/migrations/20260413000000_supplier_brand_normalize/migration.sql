-- =============================================================================
-- Migration: supplier_brand_normalize
-- Target:    PostgreSQL (AWS RDS)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Extend Supplier with legalName and businessName
-- -----------------------------------------------------------------------------
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "legalName" TEXT;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "businessName" TEXT;

-- Backfill: copy existing name into both fields for all current rows
UPDATE "Supplier"
SET
  "legalName"    = "name",
  "businessName" = "name"
WHERE "legalName" IS NULL;

-- -----------------------------------------------------------------------------
-- 2. Create SupplierBrand table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "SupplierBrand" (
    "id"         TEXT        NOT NULL,
    "supplierId" TEXT        NOT NULL,
    "name"       TEXT        NOT NULL,
    "isActive"   BOOLEAN     NOT NULL DEFAULT true,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierBrand_pkey"         PRIMARY KEY ("id"),
    CONSTRAINT "SupplierBrand_supplierId_fkey"
        FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "SupplierBrand_supplierId_name_key"
    ON "SupplierBrand"("supplierId", "name");

CREATE INDEX IF NOT EXISTS "SupplierBrand_supplierId_idx"
    ON "SupplierBrand"("supplierId");

-- -----------------------------------------------------------------------------
-- 3. Extend Product with primarySupplierId and supplierBrandId
-- -----------------------------------------------------------------------------
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "primarySupplierId" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "supplierBrandId"   TEXT;

-- Add foreign key constraints
ALTER TABLE "Product"
    ADD CONSTRAINT "Product_primarySupplierId_fkey"
        FOREIGN KEY ("primarySupplierId") REFERENCES "Supplier" ("id")
        ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Product"
    ADD CONSTRAINT "Product_supplierBrandId_fkey"
        FOREIGN KEY ("supplierBrandId") REFERENCES "SupplierBrand" ("id")
        ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Product_primarySupplierId_idx"
    ON "Product"("primarySupplierId");

CREATE INDEX IF NOT EXISTS "Product_supplierBrandId_idx"
    ON "Product"("supplierBrandId");
