ALTER TABLE "Supplier" ADD COLUMN "paymentTerms" TEXT;

ALTER TABLE "PurchaseOrder" ADD COLUMN "deliveryWarehouseId" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN "deliveryAddressSnapshot" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN "paymentTermsSnapshot" TEXT;

CREATE INDEX IF NOT EXISTS "PurchaseOrder_deliveryWarehouseId_idx"
ON "PurchaseOrder"("deliveryWarehouseId");
