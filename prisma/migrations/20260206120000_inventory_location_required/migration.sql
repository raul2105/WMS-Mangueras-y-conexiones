-- Create DEFAULT warehouse if missing
INSERT OR IGNORE INTO "Warehouse" ("code", "name", "description", "address", "isActive", "createdAt", "updatedAt")
VALUES ('DEFAULT', 'Default Warehouse', 'Auto-created staging warehouse', NULL, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Create STAGING locations for each warehouse
INSERT OR IGNORE INTO "Location" ("code", "name", "zone", "isActive", "warehouseId", "createdAt", "updatedAt")
SELECT 'STAGING-' || w."code", 'Staging - ' || w."name", 'STAGING', 1, w."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Warehouse" w;

-- Migrate NULL inventory locations to DEFAULT staging
UPDATE "Inventory"
SET "locationId" = (
  SELECT "id" FROM "Location" WHERE "code" = 'STAGING-DEFAULT' LIMIT 1
)
WHERE "locationId" IS NULL;

PRAGMA foreign_keys=OFF;

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
SELECT "id", "quantity", "reserved", "available", "productId", "locationId", "updatedAt"
FROM "Inventory";

DROP TABLE "Inventory";
ALTER TABLE "new_Inventory" RENAME TO "Inventory";

CREATE UNIQUE INDEX "Inventory_productId_locationId_key" ON "Inventory"("productId", "locationId");
CREATE INDEX "Inventory_productId_idx" ON "Inventory"("productId");
CREATE INDEX "Inventory_locationId_idx" ON "Inventory"("locationId");

PRAGMA foreign_keys=ON;
