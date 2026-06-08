ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "paymentTerms" TEXT;

ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "deliveryWarehouseId" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "deliveryAddressSnapshot" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "paymentTermsSnapshot" TEXT;

CREATE INDEX IF NOT EXISTS "PurchaseOrder_deliveryWarehouseId_idx"
ON "PurchaseOrder"("deliveryWarehouseId");
