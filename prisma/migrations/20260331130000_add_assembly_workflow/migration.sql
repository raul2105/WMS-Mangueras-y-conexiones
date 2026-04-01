-- Add assembly workflow columns
ALTER TABLE "Location" ADD COLUMN "usageType" TEXT NOT NULL DEFAULT 'STORAGE';
ALTER TABLE "InventoryMovement" ADD COLUMN "documentType" TEXT;
ALTER TABLE "InventoryMovement" ADD COLUMN "documentId" TEXT;
ALTER TABLE "InventoryMovement" ADD COLUMN "documentLineId" TEXT;
ALTER TABLE "ProductionOrder" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'GENERIC';

-- Assembly configuration
CREATE TABLE "AssemblyConfiguration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productionOrderId" TEXT NOT NULL,
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
    CONSTRAINT "AssemblyConfiguration_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AssemblyConfiguration_entryFittingProductId_fkey" FOREIGN KEY ("entryFittingProductId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AssemblyConfiguration_hoseProductId_fkey" FOREIGN KEY ("hoseProductId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AssemblyConfiguration_exitFittingProductId_fkey" FOREIGN KEY ("exitFittingProductId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AssemblyConfiguration_productionOrderId_key" ON "AssemblyConfiguration"("productionOrderId");
CREATE INDEX "AssemblyConfiguration_productionOrderId_idx" ON "AssemblyConfiguration"("productionOrderId");

-- Assembly work order
CREATE TABLE "AssemblyWorkOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productionOrderId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "wipLocationId" TEXT NOT NULL,
    "availabilityStatus" TEXT NOT NULL DEFAULT 'EXACT',
    "reservationStatus" TEXT NOT NULL DEFAULT 'NONE',
    "pickStatus" TEXT NOT NULL DEFAULT 'NOT_RELEASED',
    "wipStatus" TEXT NOT NULL DEFAULT 'NOT_IN_WIP',
    "consumptionStatus" TEXT NOT NULL DEFAULT 'NOT_CONSUMED',
    "hasShortage" BOOLEAN NOT NULL DEFAULT false,
    "releasedAt" DATETIME,
    "closedAt" DATETIME,
    "canceledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AssemblyWorkOrder_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AssemblyWorkOrder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AssemblyWorkOrder_wipLocationId_fkey" FOREIGN KEY ("wipLocationId") REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AssemblyWorkOrder_productionOrderId_key" ON "AssemblyWorkOrder"("productionOrderId");
CREATE INDEX "AssemblyWorkOrder_productionOrderId_idx" ON "AssemblyWorkOrder"("productionOrderId");
CREATE INDEX "AssemblyWorkOrder_warehouseId_pickStatus_idx" ON "AssemblyWorkOrder"("warehouseId", "pickStatus");

-- Assembly work order lines
CREATE TABLE "AssemblyWorkOrderLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assemblyWorkOrderId" TEXT NOT NULL,
    "componentRole" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "unitLabel" TEXT,
    "perAssemblyQty" REAL NOT NULL,
    "requiredQty" REAL NOT NULL,
    "reservedQty" REAL NOT NULL DEFAULT 0,
    "pickedQty" REAL NOT NULL DEFAULT 0,
    "wipQty" REAL NOT NULL DEFAULT 0,
    "consumedQty" REAL NOT NULL DEFAULT 0,
    "shortQty" REAL NOT NULL DEFAULT 0,
    "reservationStatus" TEXT NOT NULL DEFAULT 'NONE',
    "pickStatus" TEXT NOT NULL DEFAULT 'NOT_RELEASED',
    "wipStatus" TEXT NOT NULL DEFAULT 'NOT_IN_WIP',
    "consumptionStatus" TEXT NOT NULL DEFAULT 'NOT_CONSUMED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AssemblyWorkOrderLine_assemblyWorkOrderId_fkey" FOREIGN KEY ("assemblyWorkOrderId") REFERENCES "AssemblyWorkOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AssemblyWorkOrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AssemblyWorkOrderLine_assemblyWorkOrderId_componentRole_key" ON "AssemblyWorkOrderLine"("assemblyWorkOrderId", "componentRole");
CREATE INDEX "AssemblyWorkOrderLine_assemblyWorkOrderId_idx" ON "AssemblyWorkOrderLine"("assemblyWorkOrderId");
CREATE INDEX "AssemblyWorkOrderLine_productId_idx" ON "AssemblyWorkOrderLine"("productId");

-- Pick list
CREATE TABLE "PickList" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "assemblyWorkOrderId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "releasedAt" DATETIME,
    "completedAt" DATETIME,
    "canceledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PickList_assemblyWorkOrderId_fkey" FOREIGN KEY ("assemblyWorkOrderId") REFERENCES "AssemblyWorkOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PickList_code_key" ON "PickList"("code");
CREATE INDEX "PickList_assemblyWorkOrderId_status_idx" ON "PickList"("assemblyWorkOrderId", "status");

-- Pick tasks
CREATE TABLE "PickTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pickListId" TEXT NOT NULL,
    "assemblyWorkOrderLineId" TEXT NOT NULL,
    "sourceLocationId" TEXT NOT NULL,
    "targetWipLocationId" TEXT NOT NULL,
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
    CONSTRAINT "PickTask_pickListId_fkey" FOREIGN KEY ("pickListId") REFERENCES "PickList" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PickTask_assemblyWorkOrderLineId_fkey" FOREIGN KEY ("assemblyWorkOrderLineId") REFERENCES "AssemblyWorkOrderLine" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PickTask_sourceLocationId_fkey" FOREIGN KEY ("sourceLocationId") REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PickTask_targetWipLocationId_fkey" FOREIGN KEY ("targetWipLocationId") REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "PickTask_pickListId_sequence_idx" ON "PickTask"("pickListId", "sequence");
CREATE INDEX "PickTask_assemblyWorkOrderLineId_idx" ON "PickTask"("assemblyWorkOrderLineId");
CREATE INDEX "PickTask_sourceLocationId_status_idx" ON "PickTask"("sourceLocationId", "status");

-- Runtime indexes
CREATE INDEX "InventoryMovement_documentType_documentId_idx" ON "InventoryMovement"("documentType", "documentId");
