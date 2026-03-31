PRAGMA foreign_keys=OFF;

-- Rebuild Product to include new columns and cascade behavior expected by current schema.
CREATE TABLE "new_Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sku" TEXT NOT NULL,
    "referenceCode" TEXT,
    "imageUrl" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "brand" TEXT,
    "base_cost" REAL,
    "price" REAL,
    "attributes" TEXT,
    "categoryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_Product" ("id", "sku", "name", "description", "type", "brand", "base_cost", "price", "attributes", "categoryId", "createdAt", "updatedAt")
SELECT "id", "sku", "name", "description", "type", "brand", "base_cost", "price", "attributes", "categoryId", "createdAt", "updatedAt"
FROM "Product";

DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";

CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");
CREATE UNIQUE INDEX "Product_referenceCode_key" ON "Product"("referenceCode");

-- Category unique index expected by current schema.
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- Warehouse/Location core tables.
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "Warehouse_code_key" ON "Warehouse"("code");

CREATE TABLE "Location" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "zone" TEXT,
    "aisle" TEXT,
    "rack" TEXT,
    "level" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT 1,
    "capacity" REAL,
    "warehouseId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Location_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Location_code_key" ON "Location"("code");

-- Seed default warehouse + staging location for legacy inventory migration.
INSERT OR IGNORE INTO "Warehouse" ("id", "code", "name", "description", "address", "isActive", "createdAt", "updatedAt")
VALUES ('wh-default', 'DEFAULT', 'Default Warehouse', 'Auto-created staging warehouse', NULL, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO "Location" ("id", "code", "name", "zone", "aisle", "rack", "level", "isActive", "capacity", "warehouseId", "createdAt", "updatedAt")
VALUES ('loc-staging-default', 'STAGING-DEFAULT', 'Staging - DEFAULT', 'STAGING', NULL, NULL, NULL, 1, NULL, 'wh-default', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Rebuild Inventory to location-based model.
CREATE TABLE "new_Inventory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quantity" REAL NOT NULL DEFAULT 0,
    "reserved" REAL NOT NULL DEFAULT 0,
    "available" REAL NOT NULL DEFAULT 0,
    "productId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Inventory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Inventory_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_Inventory" ("id", "quantity", "reserved", "available", "productId", "locationId", "updatedAt")
SELECT
    i."id",
    i."quantity",
    0,
    i."quantity",
    i."productId",
    'loc-staging-default',
    i."updatedAt"
FROM "Inventory" i;

DROP TABLE "Inventory";
ALTER TABLE "new_Inventory" RENAME TO "Inventory";

CREATE UNIQUE INDEX "Inventory_productId_locationId_key" ON "Inventory"("productId", "locationId");
CREATE INDEX "Inventory_productId_idx" ON "Inventory"("productId");
CREATE INDEX "Inventory_locationId_idx" ON "Inventory"("locationId");

-- Inventory movement table.
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "referenceFilePath" TEXT,
    "referenceFileName" TEXT,
    "referenceFileMime" TEXT,
    "referenceFileSize" INTEGER,
    "productId" TEXT NOT NULL,
    "locationId" TEXT,
    "fromLocationCode" TEXT,
    "toLocationCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventoryMovement_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "InventoryMovement_productId_idx" ON "InventoryMovement"("productId");
CREATE INDEX "InventoryMovement_locationId_idx" ON "InventoryMovement"("locationId");
CREATE INDEX "InventoryMovement_type_idx" ON "InventoryMovement"("type");
CREATE INDEX "InventoryMovement_createdAt_idx" ON "InventoryMovement"("createdAt");

-- Production orders and items.
CREATE TABLE "ProductionOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'BORRADOR',
    "priority" INTEGER NOT NULL DEFAULT 3,
    "customerName" TEXT,
    "dueDate" DATETIME,
    "notes" TEXT,
    "warehouseId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductionOrder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ProductionOrder_code_key" ON "ProductionOrder"("code");
CREATE INDEX "ProductionOrder_warehouseId_idx" ON "ProductionOrder"("warehouseId");
CREATE INDEX "ProductionOrder_status_idx" ON "ProductionOrder"("status");
CREATE INDEX "ProductionOrder_createdAt_idx" ON "ProductionOrder"("createdAt");

CREATE TABLE "ProductionOrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductionOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ProductionOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductionOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProductionOrderItem_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ProductionOrderItem_orderId_productId_locationId_key" ON "ProductionOrderItem"("orderId", "productId", "locationId");
CREATE INDEX "ProductionOrderItem_orderId_idx" ON "ProductionOrderItem"("orderId");
CREATE INDEX "ProductionOrderItem_productId_idx" ON "ProductionOrderItem"("productId");
CREATE INDEX "ProductionOrderItem_locationId_idx" ON "ProductionOrderItem"("locationId");

PRAGMA foreign_keys=ON;
