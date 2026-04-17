ALTER TABLE "SalesInternalOrder"
  ADD COLUMN "assignedToUserId" TEXT,
  ADD COLUMN "assignedAt" TIMESTAMP(3),
  ADD COLUMN "pulledAt" TIMESTAMP(3),
  ADD COLUMN "deliveredToCustomerAt" TIMESTAMP(3),
  ADD COLUMN "deliveredByUserId" TEXT;

ALTER TABLE "SalesInternalOrder"
  ADD CONSTRAINT "SalesInternalOrder_assignedToUserId_fkey"
    FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "SalesInternalOrder_deliveredByUserId_fkey"
    FOREIGN KEY ("deliveredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "SalesInternalOrder_assignedToUserId_idx" ON "SalesInternalOrder"("assignedToUserId");
CREATE INDEX "SalesInternalOrder_deliveredToCustomerAt_idx" ON "SalesInternalOrder"("deliveredToCustomerAt");
