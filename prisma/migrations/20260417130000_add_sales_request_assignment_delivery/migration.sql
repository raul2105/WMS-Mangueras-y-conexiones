PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_SalesInternalOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'BORRADOR',
    "customerName" TEXT,
    "warehouseId" TEXT,
    "dueDate" DATETIME,
    "notes" TEXT,
    "requestedByUserId" TEXT,
    "confirmedByUserId" TEXT,
    "cancelledByUserId" TEXT,
    "assignedToUserId" TEXT,
    "deliveredByUserId" TEXT,
    "confirmedAt" DATETIME,
    "cancelledAt" DATETIME,
    "assignedAt" DATETIME,
    "pulledAt" DATETIME,
    "deliveredToCustomerAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SalesInternalOrder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SalesInternalOrder_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SalesInternalOrder_confirmedByUserId_fkey" FOREIGN KEY ("confirmedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SalesInternalOrder_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SalesInternalOrder_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SalesInternalOrder_deliveredByUserId_fkey" FOREIGN KEY ("deliveredByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_SalesInternalOrder" (
    "id", "code", "status", "customerName", "warehouseId", "dueDate", "notes",
    "requestedByUserId", "confirmedByUserId", "cancelledByUserId",
    "confirmedAt", "cancelledAt", "createdAt", "updatedAt"
)
SELECT
    "id", "code", "status", "customerName", "warehouseId", "dueDate", "notes",
    "requestedByUserId", "confirmedByUserId", "cancelledByUserId",
    "confirmedAt", "cancelledAt", "createdAt", "updatedAt"
FROM "SalesInternalOrder";

DROP TABLE "SalesInternalOrder";
ALTER TABLE "new_SalesInternalOrder" RENAME TO "SalesInternalOrder";

CREATE UNIQUE INDEX "SalesInternalOrder_code_key" ON "SalesInternalOrder"("code");
CREATE INDEX "SalesInternalOrder_status_createdAt_idx" ON "SalesInternalOrder"("status", "createdAt");
CREATE INDEX "SalesInternalOrder_requestedByUserId_idx" ON "SalesInternalOrder"("requestedByUserId");
CREATE INDEX "SalesInternalOrder_assignedToUserId_idx" ON "SalesInternalOrder"("assignedToUserId");
CREATE INDEX "SalesInternalOrder_deliveredToCustomerAt_idx" ON "SalesInternalOrder"("deliveredToCustomerAt");
CREATE INDEX "SalesInternalOrder_warehouseId_idx" ON "SalesInternalOrder"("warehouseId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
