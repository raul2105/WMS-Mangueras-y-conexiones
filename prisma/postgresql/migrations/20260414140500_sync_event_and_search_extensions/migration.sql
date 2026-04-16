CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS "SyncEvent" (
  "id" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "payload" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "SyncEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SyncEvent_status_createdAt_idx" ON "SyncEvent"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "SyncEvent_entityType_entityId_idx" ON "SyncEvent"("entityType", "entityId");
CREATE INDEX IF NOT EXISTS "SyncEvent_createdAt_idx" ON "SyncEvent"("createdAt");

CREATE INDEX IF NOT EXISTS "Product_sku_lower_trgm_idx"
  ON "Product" USING GIN (lower("sku") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Product_referenceCode_lower_trgm_idx"
  ON "Product" USING GIN (lower(COALESCE("referenceCode", '')) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Product_name_lower_trgm_idx"
  ON "Product" USING GIN (lower("name") gin_trgm_ops);
