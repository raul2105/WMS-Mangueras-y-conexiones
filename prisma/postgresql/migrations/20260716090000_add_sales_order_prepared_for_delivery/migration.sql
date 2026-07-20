ALTER TABLE "SalesInternalOrder"
  ADD COLUMN "preparedForDeliveryByUserId" TEXT,
  ADD COLUMN "preparedForDeliveryLocationId" TEXT,
  ADD COLUMN "preparedForDeliveryAt" TIMESTAMP(3),
  ADD COLUMN "preparedForDeliveryNotes" TEXT;

ALTER TABLE "SalesInternalOrder"
  ADD CONSTRAINT "SalesInternalOrder_preparedForDeliveryByUserId_fkey"
    FOREIGN KEY ("preparedForDeliveryByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "SalesInternalOrder_preparedForDeliveryLocationId_fkey"
    FOREIGN KEY ("preparedForDeliveryLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "SalesInternalOrder_preparedForDeliveryAt_idx" ON "SalesInternalOrder"("preparedForDeliveryAt");
CREATE INDEX "SalesInternalOrder_preparedForDeliveryLocationId_idx" ON "SalesInternalOrder"("preparedForDeliveryLocationId");
