ALTER TABLE "AssemblyConfiguration"
  ADD COLUMN "compatibilityStatus" TEXT NOT NULL DEFAULT 'ALLOWED',
  ADD COLUMN "compatibilityReviewApproved" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "compatibilityReviewRules" TEXT;

CREATE TABLE "ReplenishmentPolicy" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "minimumStock" DOUBLE PRECISION NOT NULL,
    "maximumStock" DOUBLE PRECISION NOT NULL,
    "leadTimeDays" INTEGER NOT NULL DEFAULT 0,
    "reviewWindowDays" INTEGER NOT NULL DEFAULT 30,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReplenishmentPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReplenishmentProposal" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "availableStock" DOUBLE PRECISION NOT NULL,
    "incomingQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "consumedQuantity" DOUBLE PRECISION NOT NULL,
    "windowDays" INTEGER NOT NULL,
    "averageDailyConsumption" DOUBLE PRECISION NOT NULL,
    "recommendedQuantity" DOUBLE PRECISION NOT NULL,
    "purchaseUnitFactor" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "purchaseMoq" DOUBLE PRECISION,
    "reason" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReplenishmentProposal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReplenishmentPolicy_productId_warehouseId_key"
  ON "ReplenishmentPolicy"("productId", "warehouseId");
CREATE INDEX "ReplenishmentPolicy_warehouseId_active_idx"
  ON "ReplenishmentPolicy"("warehouseId", "active");
CREATE INDEX "ReplenishmentProposal_warehouseId_status_generatedAt_idx"
  ON "ReplenishmentProposal"("warehouseId", "status", "generatedAt");
CREATE INDEX "ReplenishmentProposal_productId_generatedAt_idx"
  ON "ReplenishmentProposal"("productId", "generatedAt");

ALTER TABLE "ReplenishmentPolicy"
  ADD CONSTRAINT "ReplenishmentPolicy_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReplenishmentPolicy"
  ADD CONSTRAINT "ReplenishmentPolicy_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReplenishmentProposal"
  ADD CONSTRAINT "ReplenishmentProposal_policyId_fkey"
  FOREIGN KEY ("policyId") REFERENCES "ReplenishmentPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReplenishmentProposal"
  ADD CONSTRAINT "ReplenishmentProposal_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReplenishmentProposal"
  ADD CONSTRAINT "ReplenishmentProposal_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
