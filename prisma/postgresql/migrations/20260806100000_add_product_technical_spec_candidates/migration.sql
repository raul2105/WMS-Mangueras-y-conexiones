-- Keep pending technical values separate from the published product specification.

CREATE TABLE "ProductTechnicalSpecCandidate" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "family" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "normalizedValue" TEXT,
  "unit" TEXT,
  "isSafetyCritical" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductTechnicalSpecCandidate_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ProductTechnicalSpecCandidate"
  ADD CONSTRAINT "ProductTechnicalSpecCandidate_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ProductTechnicalSpecCandidate_sourceId_fkey"
    FOREIGN KEY ("sourceId") REFERENCES "ProductTechnicalSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "ProductTechnicalSpecCandidate_productId_sourceId_key_key"
  ON "ProductTechnicalSpecCandidate"("productId", "sourceId", "key");
CREATE INDEX "ProductTechnicalSpecCandidate_productId_sourceId_idx"
  ON "ProductTechnicalSpecCandidate"("productId", "sourceId");
