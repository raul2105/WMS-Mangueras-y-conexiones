-- Reconcile the schema used by the application with a fresh migrate-deploy
-- installation. Some DEV databases already received these additions outside
-- migration history; preserve their rows and accept existing matching objects.
BEGIN;

ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "primarySupplierId" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "supplierBrandId" TEXT;
ALTER TABLE "SalesInternalOrder" ADD COLUMN IF NOT EXISTS "sourceMaterialRequestCode" TEXT;

CREATE TABLE IF NOT EXISTS "SupplierBrand" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SupplierBrand_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SupplierBrand_supplierId_idx" ON "SupplierBrand"("supplierId");
CREATE UNIQUE INDEX IF NOT EXISTS "SupplierBrand_supplierId_name_key" ON "SupplierBrand"("supplierId", "name");
CREATE INDEX IF NOT EXISTS "Product_primarySupplierId_idx" ON "Product"("primarySupplierId");
CREATE INDEX IF NOT EXISTS "Product_supplierBrandId_idx" ON "Product"("supplierBrandId");
CREATE INDEX IF NOT EXISTS "ProductTechnicalSource_reviewedByUserId_idx" ON "ProductTechnicalSource"("reviewedByUserId");
CREATE INDEX IF NOT EXISTS "SalesInternalOrder_sourceMaterialRequestCode_idx" ON "SalesInternalOrder"("sourceMaterialRequestCode");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"Product"'::regclass AND conname = 'Product_primarySupplierId_fkey') THEN
        ALTER TABLE "Product" ADD CONSTRAINT "Product_primarySupplierId_fkey" FOREIGN KEY ("primarySupplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"Product"'::regclass AND conname = 'Product_supplierBrandId_fkey') THEN
        ALTER TABLE "Product" ADD CONSTRAINT "Product_supplierBrandId_fkey" FOREIGN KEY ("supplierBrandId") REFERENCES "SupplierBrand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"SupplierBrand"'::regclass AND conname = 'SupplierBrand_supplierId_fkey') THEN
        ALTER TABLE "SupplierBrand" ADD CONSTRAINT "SupplierBrand_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"PurchaseOrder"'::regclass AND conname = 'PurchaseOrder_deliveryWarehouseId_fkey') THEN
        ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_deliveryWarehouseId_fkey" FOREIGN KEY ("deliveryWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF to_regclass('"ProductCompatibilityRule_productId_compatibleProductId_ruleType"') IS NOT NULL
       AND to_regclass('"ProductCompatibilityRule_productId_compatibleProductId_rule_key"') IS NULL THEN
        ALTER INDEX "ProductCompatibilityRule_productId_compatibleProductId_ruleType" RENAME TO "ProductCompatibilityRule_productId_compatibleProductId_rule_key";
    END IF;
END $$;

COMMIT;
