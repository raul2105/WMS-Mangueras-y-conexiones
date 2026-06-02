-- CreateTable
CREATE TABLE "PurchaseOrderDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "purchaseOrderId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "snapshotHash" TEXT,
    "createdForStatus" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PurchaseOrderDocument_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrderDocument_purchaseOrderId_versionNumber_key"
ON "PurchaseOrderDocument"("purchaseOrderId", "versionNumber");

-- CreateIndex
CREATE INDEX "PurchaseOrderDocument_purchaseOrderId_createdAt_idx"
ON "PurchaseOrderDocument"("purchaseOrderId", "createdAt");
