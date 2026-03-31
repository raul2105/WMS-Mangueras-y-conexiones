-- Runtime query optimization indexes for local SQLite workloads
CREATE INDEX IF NOT EXISTS "Product_updatedAt_idx" ON "Product"("updatedAt");
CREATE INDEX IF NOT EXISTS "Product_type_idx" ON "Product"("type");
CREATE INDEX IF NOT EXISTS "Product_brand_idx" ON "Product"("brand");
CREATE INDEX IF NOT EXISTS "Product_categoryId_idx" ON "Product"("categoryId");
CREATE INDEX IF NOT EXISTS "Product_subcategory_idx" ON "Product"("subcategory");

CREATE INDEX IF NOT EXISTS "Location_warehouseId_isActive_code_idx" ON "Location"("warehouseId", "isActive", "code");
