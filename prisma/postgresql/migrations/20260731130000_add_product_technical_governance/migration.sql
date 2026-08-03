-- Versioned technical specs, source documents, validated product assets and compatibility rules.

CREATE TABLE "ProductTechnicalSource" (
  "id" TEXT NOT NULL,
  "supplierName" TEXT NOT NULL,
  "documentRef" TEXT NOT NULL,
  "documentVersion" TEXT,
  "sourceUrl" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "reviewedAt" TIMESTAMP(3),
  "reviewedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductTechnicalSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductTechnicalSpec" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "family" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "normalizedValue" TEXT,
  "unit" TEXT,
  "isSafetyCritical" BOOLEAN NOT NULL DEFAULT false,
  "sourceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductTechnicalSpec_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductAsset" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'PRIMARY_IMAGE',
  "url" TEXT NOT NULL,
  "brandSnapshot" TEXT,
  "validationStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "sourceId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductCompatibilityRule" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "compatibleProductId" TEXT NOT NULL,
  "ruleType" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'BLOCK',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sourceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductCompatibilityRule_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ProductTechnicalSource"
  ADD CONSTRAINT "ProductTechnicalSource_reviewedByUserId_fkey"
    FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductTechnicalSpec"
  ADD CONSTRAINT "ProductTechnicalSpec_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ProductTechnicalSpec_sourceId_fkey"
    FOREIGN KEY ("sourceId") REFERENCES "ProductTechnicalSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductAsset"
  ADD CONSTRAINT "ProductAsset_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ProductAsset_sourceId_fkey"
    FOREIGN KEY ("sourceId") REFERENCES "ProductTechnicalSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductCompatibilityRule"
  ADD CONSTRAINT "ProductCompatibilityRule_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ProductCompatibilityRule_compatibleProductId_fkey"
    FOREIGN KEY ("compatibleProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ProductCompatibilityRule_sourceId_fkey"
    FOREIGN KEY ("sourceId") REFERENCES "ProductTechnicalSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "ProductTechnicalSpec_productId_key_key"
  ON "ProductTechnicalSpec"("productId", "key");
CREATE UNIQUE INDEX "ProductCompatibilityRule_productId_compatibleProductId_ruleType_key"
  ON "ProductCompatibilityRule"("productId", "compatibleProductId", "ruleType");
CREATE INDEX "ProductTechnicalSource_supplierName_status_idx"
  ON "ProductTechnicalSource"("supplierName", "status");
CREATE INDEX "ProductTechnicalSpec_productId_family_idx"
  ON "ProductTechnicalSpec"("productId", "family");
CREATE INDEX "ProductTechnicalSpec_key_normalizedValue_idx"
  ON "ProductTechnicalSpec"("key", "normalizedValue");
CREATE INDEX "ProductAsset_productId_kind_validationStatus_idx"
  ON "ProductAsset"("productId", "kind", "validationStatus");
CREATE INDEX "ProductCompatibilityRule_productId_active_idx"
  ON "ProductCompatibilityRule"("productId", "active");
CREATE INDEX "ProductCompatibilityRule_compatibleProductId_active_idx"
  ON "ProductCompatibilityRule"("compatibleProductId", "active");
