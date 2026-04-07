-- Redefine sales order lines to support mixed request lines
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_SalesInternalOrderLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "lineKind" TEXT NOT NULL DEFAULT 'PRODUCT',
    "productId" TEXT,
    "requestedQty" REAL NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SalesInternalOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesInternalOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SalesInternalOrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_SalesInternalOrderLine" ("createdAt", "id", "notes", "orderId", "productId", "requestedQty", "updatedAt")
SELECT "createdAt", "id", "notes", "orderId", "productId", "requestedQty", "updatedAt"
FROM "SalesInternalOrderLine";

DROP TABLE "SalesInternalOrderLine";
ALTER TABLE "new_SalesInternalOrderLine" RENAME TO "SalesInternalOrderLine";
CREATE INDEX "SalesInternalOrderLine_orderId_idx" ON "SalesInternalOrderLine"("orderId");
CREATE INDEX "SalesInternalOrderLine_productId_idx" ON "SalesInternalOrderLine"("productId");
CREATE INDEX "SalesInternalOrderLine_orderId_lineKind_idx" ON "SalesInternalOrderLine"("orderId", "lineKind");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

CREATE TABLE "SalesInternalOrderAssemblyConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderLineId" TEXT NOT NULL,
    "entryFittingProductId" TEXT NOT NULL,
    "hoseProductId" TEXT NOT NULL,
    "exitFittingProductId" TEXT NOT NULL,
    "hoseLength" REAL NOT NULL,
    "assemblyQuantity" REAL NOT NULL,
    "totalHoseRequired" REAL NOT NULL,
    "sourceDocumentRef" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SalesInternalOrderAssemblyConfig_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "SalesInternalOrderLine" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SalesInternalOrderAssemblyConfig_entryFittingProductId_fkey" FOREIGN KEY ("entryFittingProductId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SalesInternalOrderAssemblyConfig_hoseProductId_fkey" FOREIGN KEY ("hoseProductId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SalesInternalOrderAssemblyConfig_exitFittingProductId_fkey" FOREIGN KEY ("exitFittingProductId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SalesInternalOrderAssemblyConfig_orderLineId_key" ON "SalesInternalOrderAssemblyConfig"("orderLineId");
CREATE INDEX "SalesInternalOrderAssemblyConfig_entryFittingProductId_idx" ON "SalesInternalOrderAssemblyConfig"("entryFittingProductId");
CREATE INDEX "SalesInternalOrderAssemblyConfig_hoseProductId_idx" ON "SalesInternalOrderAssemblyConfig"("hoseProductId");
CREATE INDEX "SalesInternalOrderAssemblyConfig_exitFittingProductId_idx" ON "SalesInternalOrderAssemblyConfig"("exitFittingProductId");

CREATE TABLE "SalesInternalOrderPickList" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "targetLocationId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "releasedAt" DATETIME,
    "completedAt" DATETIME,
    "canceledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SalesInternalOrderPickList_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesInternalOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SalesInternalOrderPickList_targetLocationId_fkey" FOREIGN KEY ("targetLocationId") REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SalesInternalOrderPickList_code_key" ON "SalesInternalOrderPickList"("code");
CREATE INDEX "SalesInternalOrderPickList_orderId_status_idx" ON "SalesInternalOrderPickList"("orderId", "status");
CREATE INDEX "SalesInternalOrderPickList_targetLocationId_idx" ON "SalesInternalOrderPickList"("targetLocationId");

CREATE TABLE "SalesInternalOrderPickTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pickListId" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "sourceLocationId" TEXT NOT NULL,
    "targetLocationId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "requestedQty" REAL NOT NULL,
    "reservedQty" REAL NOT NULL,
    "pickedQty" REAL NOT NULL DEFAULT 0,
    "shortQty" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "shortReason" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SalesInternalOrderPickTask_pickListId_fkey" FOREIGN KEY ("pickListId") REFERENCES "SalesInternalOrderPickList" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SalesInternalOrderPickTask_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "SalesInternalOrderLine" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SalesInternalOrderPickTask_sourceLocationId_fkey" FOREIGN KEY ("sourceLocationId") REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SalesInternalOrderPickTask_targetLocationId_fkey" FOREIGN KEY ("targetLocationId") REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "SalesInternalOrderPickTask_pickListId_sequence_idx" ON "SalesInternalOrderPickTask"("pickListId", "sequence");
CREATE INDEX "SalesInternalOrderPickTask_orderLineId_idx" ON "SalesInternalOrderPickTask"("orderLineId");
CREATE INDEX "SalesInternalOrderPickTask_sourceLocationId_status_idx" ON "SalesInternalOrderPickTask"("sourceLocationId", "status");
CREATE INDEX "SalesInternalOrderPickTask_targetLocationId_status_idx" ON "SalesInternalOrderPickTask"("targetLocationId", "status");
