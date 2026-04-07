-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("userId", "roleId"),
    CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "grantedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("roleId", "permissionId"),
    CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "action" TEXT NOT NULL,
    "before" TEXT,
    "after" TEXT,
    "actor" TEXT,
    "actorUserId" TEXT,
    "source" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AuditLog" ("action", "actor", "after", "before", "createdAt", "entityId", "entityType", "id", "source") SELECT "action", "actor", "after", "before", "createdAt", "entityId", "entityType", "id", "source" FROM "AuditLog";
DROP TABLE "AuditLog";
ALTER TABLE "new_AuditLog" RENAME TO "AuditLog";
CREATE INDEX "AuditLog_entityType_idx" ON "AuditLog"("entityType");
CREATE INDEX "AuditLog_entityId_idx" ON "AuditLog"("entityId");
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX "AuditLog_actorUserId_idx" ON "AuditLog"("actorUserId");
CREATE TABLE "new_InventoryMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "traceId" TEXT,
    "operatorName" TEXT,
    "operatorUserId" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "documentType" TEXT,
    "documentId" TEXT,
    "documentLineId" TEXT,
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
    CONSTRAINT "InventoryMovement_operatorUserId_fkey" FOREIGN KEY ("operatorUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InventoryMovement_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_InventoryMovement" ("createdAt", "documentId", "documentLineId", "documentType", "fromLocationCode", "id", "locationId", "notes", "operatorName", "productId", "quantity", "reference", "referenceFileMime", "referenceFileName", "referenceFilePath", "referenceFileSize", "toLocationCode", "traceId", "type") SELECT "createdAt", "documentId", "documentLineId", "documentType", "fromLocationCode", "id", "locationId", "notes", "operatorName", "productId", "quantity", "reference", "referenceFileMime", "referenceFileName", "referenceFilePath", "referenceFileSize", "toLocationCode", "traceId", "type" FROM "InventoryMovement";
DROP TABLE "InventoryMovement";
ALTER TABLE "new_InventoryMovement" RENAME TO "InventoryMovement";
CREATE INDEX "InventoryMovement_productId_idx" ON "InventoryMovement"("productId");
CREATE INDEX "InventoryMovement_locationId_idx" ON "InventoryMovement"("locationId");
CREATE INDEX "InventoryMovement_type_idx" ON "InventoryMovement"("type");
CREATE INDEX "InventoryMovement_createdAt_idx" ON "InventoryMovement"("createdAt");
CREATE INDEX "InventoryMovement_documentType_documentId_idx" ON "InventoryMovement"("documentType", "documentId");
CREATE INDEX "InventoryMovement_traceId_idx" ON "InventoryMovement"("traceId");
CREATE INDEX "InventoryMovement_operatorUserId_idx" ON "InventoryMovement"("operatorUserId");
CREATE TABLE "new_TraceRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "traceId" TEXT NOT NULL,
    "labelType" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceEntityId" TEXT NOT NULL,
    "sourceDocumentType" TEXT,
    "sourceDocumentId" TEXT,
    "sourceDocumentLineId" TEXT,
    "companyName" TEXT NOT NULL,
    "operatorName" TEXT,
    "operatorUserId" TEXT,
    "reference" TEXT,
    "quantity" REAL,
    "unitLabel" TEXT,
    "payloadJson" TEXT NOT NULL,
    "productId" TEXT,
    "warehouseId" TEXT,
    "locationId" TEXT,
    "originMovementId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TraceRecord_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TraceRecord_operatorUserId_fkey" FOREIGN KEY ("operatorUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TraceRecord_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TraceRecord_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TraceRecord_originMovementId_fkey" FOREIGN KEY ("originMovementId") REFERENCES "InventoryMovement" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TraceRecord" ("companyName", "createdAt", "id", "labelType", "locationId", "operatorName", "originMovementId", "payloadJson", "productId", "quantity", "reference", "sourceDocumentId", "sourceDocumentLineId", "sourceDocumentType", "sourceEntityId", "sourceEntityType", "traceId", "unitLabel", "updatedAt", "warehouseId") SELECT "companyName", "createdAt", "id", "labelType", "locationId", "operatorName", "originMovementId", "payloadJson", "productId", "quantity", "reference", "sourceDocumentId", "sourceDocumentLineId", "sourceDocumentType", "sourceEntityId", "sourceEntityType", "traceId", "unitLabel", "updatedAt", "warehouseId" FROM "TraceRecord";
DROP TABLE "TraceRecord";
ALTER TABLE "new_TraceRecord" RENAME TO "TraceRecord";
CREATE UNIQUE INDEX "TraceRecord_traceId_key" ON "TraceRecord"("traceId");
CREATE UNIQUE INDEX "TraceRecord_originMovementId_key" ON "TraceRecord"("originMovementId");
CREATE INDEX "TraceRecord_labelType_idx" ON "TraceRecord"("labelType");
CREATE INDEX "TraceRecord_sourceDocumentType_sourceDocumentId_idx" ON "TraceRecord"("sourceDocumentType", "sourceDocumentId");
CREATE INDEX "TraceRecord_createdAt_idx" ON "TraceRecord"("createdAt");
CREATE INDEX "TraceRecord_operatorUserId_idx" ON "TraceRecord"("operatorUserId");
CREATE UNIQUE INDEX "TraceRecord_sourceEntityType_sourceEntityId_key" ON "TraceRecord"("sourceEntityType", "sourceEntityId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_isActive_idx" ON "User"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Role_code_key" ON "Role"("code");

-- CreateIndex
CREATE INDEX "Role_isActive_idx" ON "Role"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE INDEX "UserRole_roleId_idx" ON "UserRole"("roleId");

-- CreateIndex
CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");

