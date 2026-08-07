-- Keep source approval lookups indexed for existing and fresh PostgreSQL deployments.
CREATE INDEX IF NOT EXISTS "ProductAsset_sourceId_idx"
  ON "ProductAsset"("sourceId");
