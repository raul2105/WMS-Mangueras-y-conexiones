-- Link an approved replenishment proposal to the purchase order created from it.
ALTER TABLE "ReplenishmentProposal"
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "approvedByUserId" TEXT,
  ADD COLUMN "purchaseOrderId" TEXT;

CREATE UNIQUE INDEX "ReplenishmentProposal_purchaseOrderId_key"
  ON "ReplenishmentProposal"("purchaseOrderId");
CREATE INDEX "ReplenishmentProposal_approvedByUserId_idx"
  ON "ReplenishmentProposal"("approvedByUserId");

ALTER TABLE "ReplenishmentProposal"
  ADD CONSTRAINT "ReplenishmentProposal_purchaseOrderId_fkey"
    FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
