CREATE TABLE "PurchaseOrderDocument" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "snapshotHash" TEXT,
    "createdForStatus" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrderDocument_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PurchaseOrderDocument_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PurchaseOrderDocument_purchaseOrderId_versionNumber_key"
ON "PurchaseOrderDocument"("purchaseOrderId", "versionNumber");

CREATE INDEX "PurchaseOrderDocument_purchaseOrderId_createdAt_idx"
ON "PurchaseOrderDocument"("purchaseOrderId", "createdAt");
