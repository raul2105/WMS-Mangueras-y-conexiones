-- Separate commercial ownership from physical warehouse task ownership.
-- Additive migration: existing assignedToUserId values remain commercial owners.

ALTER TABLE "SalesInternalOrder"
  ADD COLUMN "warehouseAssignmentMode" TEXT NOT NULL DEFAULT 'AUTO_STANDARD',
  ADD COLUMN "warehouseAssigneeUserId" TEXT,
  ADD COLUMN "warehouseClaimedByUserId" TEXT,
  ADD COLUMN "warehouseClaimedAt" TIMESTAMP(3),
  ADD COLUMN "warehouseLastActivityAt" TIMESTAMP(3);

ALTER TABLE "SalesInternalOrderPickTask"
  ADD COLUMN "assignmentMode" TEXT NOT NULL DEFAULT 'AUTO_STANDARD',
  ADD COLUMN "assignedToUserId" TEXT,
  ADD COLUMN "claimedByUserId" TEXT,
  ADD COLUMN "claimedAt" TIMESTAMP(3),
  ADD COLUMN "lastActivityAt" TIMESTAMP(3);

ALTER TABLE "SalesInternalOrder"
  ADD CONSTRAINT "SalesInternalOrder_warehouseAssigneeUserId_fkey"
    FOREIGN KEY ("warehouseAssigneeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "SalesInternalOrder_warehouseClaimedByUserId_fkey"
    FOREIGN KEY ("warehouseClaimedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SalesInternalOrderPickTask"
  ADD CONSTRAINT "SalesInternalOrderPickTask_assignedToUserId_fkey"
    FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "SalesInternalOrderPickTask_claimedByUserId_fkey"
    FOREIGN KEY ("claimedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "SalesInternalOrder_warehouseAssigneeUserId_idx"
  ON "SalesInternalOrder"("warehouseAssigneeUserId");
CREATE INDEX "SalesInternalOrder_warehouseClaimedByUserId_idx"
  ON "SalesInternalOrder"("warehouseClaimedByUserId");
CREATE INDEX "SalesInternalOrder_warehouseAssignmentMode_warehouseId_idx"
  ON "SalesInternalOrder"("warehouseAssignmentMode", "warehouseId");
CREATE INDEX "SalesInternalOrder_warehouseLastActivityAt_idx"
  ON "SalesInternalOrder"("warehouseLastActivityAt");
CREATE INDEX "SalesInternalOrderPickTask_assignedToUserId_status_idx"
  ON "SalesInternalOrderPickTask"("assignedToUserId", "status");
CREATE INDEX "SalesInternalOrderPickTask_claimedByUserId_status_idx"
  ON "SalesInternalOrderPickTask"("claimedByUserId", "status");
