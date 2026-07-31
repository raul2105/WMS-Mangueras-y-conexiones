-- KAN-133 operational exceptions, delivery evidence, cancellation reversal and returns.
-- Additive migration: it does not mutate existing orders or inventory balances.

CREATE TYPE "SalesInternalOrderExceptionType" AS ENUM ('SHORTAGE', 'CANCELLATION_REQUEST');
CREATE TYPE "SalesInternalOrderExceptionStatus" AS ENUM ('OPEN', 'RESOLVED', 'REJECTED');
CREATE TYPE "SalesInternalOrderExceptionResolution" AS ENUM ('WAIT_REPLENISHMENT', 'PARTIAL_DELIVERY', 'SUBSTITUTE_PRODUCT', 'REDUCE_QUANTITY', 'URGENT_PURCHASE', 'CANCEL_LINE', 'CANCEL_ORDER', 'REJECT_CANCELLATION');
CREATE TYPE "SalesInternalOrderReturnKind" AS ENUM ('CANCELLATION_REVERSAL', 'CUSTOMER_RETURN');
CREATE TYPE "SalesInternalOrderReturnStatus" AS ENUM ('REQUESTED', 'RECEIVED', 'COMPLETED', 'REJECTED');
CREATE TYPE "SalesInternalOrderReturnDisposition" AS ENUM ('RESTOCK', 'REPAIR', 'SCRAP', 'REJECT');

ALTER TABLE "SalesInternalOrder"
  ADD COLUMN "preparedForDeliveryEvidenceUrl" TEXT,
  ADD COLUMN "deliveryRecipientName" TEXT,
  ADD COLUMN "deliveryMethod" TEXT,
  ADD COLUMN "deliveryNotes" TEXT,
  ADD COLUMN "deliveryEvidenceUrl" TEXT,
  ADD COLUMN "deliveryExceptionReason" TEXT;

CREATE TABLE "SalesInternalOrderException" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "orderLineId" TEXT,
  "pickTaskId" TEXT,
  "type" "SalesInternalOrderExceptionType" NOT NULL,
  "status" "SalesInternalOrderExceptionStatus" NOT NULL DEFAULT 'OPEN',
  "reportedQty" DOUBLE PRECISION,
  "reason" TEXT NOT NULL,
  "reportedByUserId" TEXT,
  "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolution" "SalesInternalOrderExceptionResolution",
  "resolutionNotes" TEXT,
  "decidedByUserId" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SalesInternalOrderException_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalesInternalOrderReturn" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "exceptionId" TEXT,
  "kind" "SalesInternalOrderReturnKind" NOT NULL,
  "status" "SalesInternalOrderReturnStatus" NOT NULL DEFAULT 'REQUESTED',
  "reason" TEXT NOT NULL,
  "requestedByUserId" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "receivedByUserId" TEXT,
  "receivedAt" TIMESTAMP(3),
  "completedByUserId" TEXT,
  "completedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SalesInternalOrderReturn_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalesInternalOrderReturnItem" (
  "id" TEXT NOT NULL,
  "returnId" TEXT NOT NULL,
  "orderLineId" TEXT,
  "productId" TEXT NOT NULL,
  "sourceLocationId" TEXT,
  "destinationLocationId" TEXT,
  "quantity" DOUBLE PRECISION NOT NULL,
  "disposition" "SalesInternalOrderReturnDisposition" NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalesInternalOrderReturnItem_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SalesInternalOrderException"
  ADD CONSTRAINT "SalesInternalOrderException_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesInternalOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SalesInternalOrderException_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "SalesInternalOrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "SalesInternalOrderException_pickTaskId_fkey" FOREIGN KEY ("pickTaskId") REFERENCES "SalesInternalOrderPickTask"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "SalesInternalOrderException_reportedByUserId_fkey" FOREIGN KEY ("reportedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "SalesInternalOrderException_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SalesInternalOrderReturn"
  ADD CONSTRAINT "SalesInternalOrderReturn_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesInternalOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SalesInternalOrderReturn_exceptionId_fkey" FOREIGN KEY ("exceptionId") REFERENCES "SalesInternalOrderException"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "SalesInternalOrderReturn_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "SalesInternalOrderReturn_receivedByUserId_fkey" FOREIGN KEY ("receivedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "SalesInternalOrderReturn_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SalesInternalOrderReturnItem"
  ADD CONSTRAINT "SalesInternalOrderReturnItem_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "SalesInternalOrderReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SalesInternalOrderReturnItem_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "SalesInternalOrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "SalesInternalOrderReturnItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "SalesInternalOrderReturnItem_sourceLocationId_fkey" FOREIGN KEY ("sourceLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "SalesInternalOrderReturnItem_destinationLocationId_fkey" FOREIGN KEY ("destinationLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "SalesInternalOrderException_orderId_status_type_idx" ON "SalesInternalOrderException"("orderId", "status", "type");
CREATE INDEX "SalesInternalOrderException_orderLineId_idx" ON "SalesInternalOrderException"("orderLineId");
CREATE INDEX "SalesInternalOrderException_pickTaskId_idx" ON "SalesInternalOrderException"("pickTaskId");
CREATE INDEX "SalesInternalOrderReturn_orderId_status_kind_idx" ON "SalesInternalOrderReturn"("orderId", "status", "kind");
CREATE INDEX "SalesInternalOrderReturn_exceptionId_idx" ON "SalesInternalOrderReturn"("exceptionId");
CREATE INDEX "SalesInternalOrderReturnItem_returnId_idx" ON "SalesInternalOrderReturnItem"("returnId");
CREATE INDEX "SalesInternalOrderReturnItem_productId_idx" ON "SalesInternalOrderReturnItem"("productId");
