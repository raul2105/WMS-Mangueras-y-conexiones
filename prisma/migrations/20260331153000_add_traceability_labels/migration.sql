-- Product canonical unit for labeling
ALTER TABLE "Product" ADD COLUMN "unitLabel" TEXT NOT NULL DEFAULT 'unidad';

-- Movement trace metadata
ALTER TABLE "InventoryMovement" ADD COLUMN "traceId" TEXT;
ALTER TABLE "InventoryMovement" ADD COLUMN "operatorName" TEXT;

-- Trace records
CREATE TABLE "TraceRecord" (
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
    CONSTRAINT "TraceRecord_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TraceRecord_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TraceRecord_originMovementId_fkey" FOREIGN KEY ("originMovementId") REFERENCES "InventoryMovement" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TraceRecord_traceId_key" ON "TraceRecord"("traceId");
CREATE UNIQUE INDEX "TraceRecord_sourceEntityType_sourceEntityId_key" ON "TraceRecord"("sourceEntityType", "sourceEntityId");
CREATE UNIQUE INDEX "TraceRecord_originMovementId_key" ON "TraceRecord"("originMovementId");
CREATE INDEX "TraceRecord_labelType_idx" ON "TraceRecord"("labelType");
CREATE INDEX "TraceRecord_sourceDocumentType_sourceDocumentId_idx" ON "TraceRecord"("sourceDocumentType", "sourceDocumentId");
CREATE INDEX "TraceRecord_createdAt_idx" ON "TraceRecord"("createdAt");

-- Label templates
CREATE TABLE "LabelTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "labelType" TEXT NOT NULL,
    "rendererKind" TEXT NOT NULL DEFAULT 'HTML',
    "symbolKind" TEXT NOT NULL DEFAULT 'QR',
    "paperSize" TEXT,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "definitionJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "LabelTemplate_code_key" ON "LabelTemplate"("code");
CREATE INDEX "LabelTemplate_labelType_isActive_isDefault_idx" ON "LabelTemplate"("labelType", "isActive", "isDefault");

-- Print jobs
CREATE TABLE "LabelPrintJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "traceRecordId" TEXT NOT NULL,
    "labelTemplateId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "copies" INTEGER NOT NULL DEFAULT 1,
    "outputFormat" TEXT NOT NULL DEFAULT 'html',
    "payloadJson" TEXT NOT NULL,
    "htmlSnapshot" TEXT,
    "requestedBy" TEXT,
    "printedAt" DATETIME,
    "exportedAt" DATETIME,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LabelPrintJob_traceRecordId_fkey" FOREIGN KEY ("traceRecordId") REFERENCES "TraceRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LabelPrintJob_labelTemplateId_fkey" FOREIGN KEY ("labelTemplateId") REFERENCES "LabelTemplate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "LabelPrintJob_traceRecordId_createdAt_idx" ON "LabelPrintJob"("traceRecordId", "createdAt");
CREATE INDEX "LabelPrintJob_labelTemplateId_idx" ON "LabelPrintJob"("labelTemplateId");
CREATE INDEX "LabelPrintJob_status_idx" ON "LabelPrintJob"("status");

CREATE INDEX "InventoryMovement_traceId_idx" ON "InventoryMovement"("traceId");
