ALTER TABLE "ProductCompatibilityRule"
  ADD COLUMN "decision" TEXT NOT NULL DEFAULT 'REQUIRES_REVIEW',
  ADD COLUMN "governanceStatus" TEXT NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "ruleRevision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "validFrom" TIMESTAMP(3),
  ADD COLUMN "validTo" TIMESTAMP(3),
  ADD COLUMN "maxWorkingPressureBar" DECIMAL(12,3),
  ADD COLUMN "minTemperatureC" DECIMAL(8,2),
  ADD COLUMN "maxTemperatureC" DECIMAL(8,2),
  ADD COLUMN "medium" TEXT,
  ADD COLUMN "application" TEXT,
  ADD COLUMN "assemblyMethod" TEXT;

-- Historical rules remain unapproved. Explicit blocks retain their preventive
-- effect while every other legacy rule requires technical review.
UPDATE "ProductCompatibilityRule"
SET "decision" = CASE
  WHEN UPPER("severity") = 'BLOCK' THEN 'BLOCKED'
  ELSE 'REQUIRES_REVIEW'
END,
"governanceStatus" = 'DRAFT';

CREATE INDEX "ProductCompatibilityRule_decision_governanceStatus_active_idx"
  ON "ProductCompatibilityRule"("decision", "governanceStatus", "active");
CREATE INDEX "ProductCompatibilityRule_validFrom_validTo_idx"
  ON "ProductCompatibilityRule"("validFrom", "validTo");

ALTER TABLE "AssemblyConfiguration"
  ADD COLUMN "compatibilityReviewReason" TEXT,
  ADD COLUMN "compatibilityReviewedByUserId" TEXT;

ALTER TABLE "AssemblyConfiguration"
  ALTER COLUMN "compatibilityStatus" SET DEFAULT 'REQUIRES_REVIEW';
