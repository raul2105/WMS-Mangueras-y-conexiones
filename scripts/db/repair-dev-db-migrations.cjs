const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const rootDir = path.resolve(__dirname, "..");
const dbPath = path.join(rootDir, "prisma", "dev.db");
const migrationsDir = path.join(rootDir, "prisma", "migrations");

const MIGRATIONS = [
  "20260310153000_add_product_technical_attribute_index",
  "20260310170000_add_product_equivalences",
  "20260310190000_add_product_subcategory",
  "20260330173000_add_runtime_indexes",
  "20260331130000_add_assembly_workflow",
  "20260331153000_add_traceability_labels",
];

function checksumForMigration(name) {
  const sqlPath = path.join(migrationsDir, name, "migration.sql");
  return crypto.createHash("sha256").update(fs.readFileSync(sqlPath)).digest("hex");
}

function tableExists(db, name) {
  return Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1").get(name),
  );
}

function indexExists(db, name) {
  return Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = ? LIMIT 1").get(name),
  );
}

function columnExists(db, tableName, columnName) {
  return db
    .prepare(`PRAGMA table_info("${tableName}")`)
    .all()
    .some((column) => column.name === columnName);
}

function ensureColumn(db, tableName, columnName, sql) {
  if (!columnExists(db, tableName, columnName)) {
    db.exec(sql);
  }
}

function ensureTable(db, tableName, sql) {
  if (!tableExists(db, tableName)) {
    db.exec(sql);
  }
}

function ensureIndex(db, indexName, sql) {
  if (!indexExists(db, indexName)) {
    db.exec(sql);
  }
}

function upsertMigrationRecord(db, migrationName) {
  const now = Date.now();
  const checksum = checksumForMigration(migrationName);
  const existing = db
    .prepare("SELECT id FROM _prisma_migrations WHERE migration_name = ? LIMIT 1")
    .get(migrationName);

  if (existing) {
    db.prepare(
      `UPDATE _prisma_migrations
       SET checksum = ?,
           finished_at = ?,
           rolled_back_at = NULL,
           logs = NULL,
           applied_steps_count = 1
       WHERE migration_name = ?`,
    ).run(checksum, now, migrationName);
    return;
  }

  db.prepare(
    `INSERT INTO _prisma_migrations
      (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
     VALUES (?, ?, ?, ?, NULL, NULL, ?, 1)`,
  ).run(crypto.randomUUID(), checksum, now, migrationName, now);
}

function repairDatabase(db) {
  ensureTable(
    db,
    "ProductTechnicalAttribute",
    `CREATE TABLE "ProductTechnicalAttribute" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "productId" TEXT NOT NULL,
      "key" TEXT NOT NULL,
      "keyNormalized" TEXT NOT NULL,
      "value" TEXT NOT NULL,
      "valueNormalized" TEXT NOT NULL,
      CONSTRAINT "ProductTechnicalAttribute_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
  );
  ensureIndex(
    db,
    "ProductTechnicalAttribute_productId_keyNormalized_valueNormalized_key",
    `CREATE UNIQUE INDEX "ProductTechnicalAttribute_productId_keyNormalized_valueNormalized_key"
     ON "ProductTechnicalAttribute"("productId", "keyNormalized", "valueNormalized")`,
  );
  ensureIndex(
    db,
    "ProductTechnicalAttribute_productId_idx",
    `CREATE INDEX "ProductTechnicalAttribute_productId_idx" ON "ProductTechnicalAttribute"("productId")`,
  );
  ensureIndex(
    db,
    "ProductTechnicalAttribute_keyNormalized_idx",
    `CREATE INDEX "ProductTechnicalAttribute_keyNormalized_idx" ON "ProductTechnicalAttribute"("keyNormalized")`,
  );
  ensureIndex(
    db,
    "ProductTechnicalAttribute_keyNormalized_valueNormalized_idx",
    `CREATE INDEX "ProductTechnicalAttribute_keyNormalized_valueNormalized_idx"
     ON "ProductTechnicalAttribute"("keyNormalized", "valueNormalized")`,
  );
  ensureIndex(
    db,
    "ProductTechnicalAttribute_valueNormalized_idx",
    `CREATE INDEX "ProductTechnicalAttribute_valueNormalized_idx" ON "ProductTechnicalAttribute"("valueNormalized")`,
  );
  upsertMigrationRecord(db, "20260310153000_add_product_technical_attribute_index");

  ensureTable(
    db,
    "ProductEquivalence",
    `CREATE TABLE "ProductEquivalence" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "productId" TEXT NOT NULL,
      "equivProductId" TEXT NOT NULL,
      "basisNorm" TEXT,
      "basisDash" INTEGER,
      "sourceSheet" TEXT,
      "notes" TEXT,
      "active" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "ProductEquivalence_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ProductEquivalence_equivProductId_fkey" FOREIGN KEY ("equivProductId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
  );
  ensureIndex(
    db,
    "ProductEquivalence_productId_equivProductId_key",
    `CREATE UNIQUE INDEX "ProductEquivalence_productId_equivProductId_key"
     ON "ProductEquivalence"("productId", "equivProductId")`,
  );
  ensureIndex(
    db,
    "ProductEquivalence_productId_idx",
    `CREATE INDEX "ProductEquivalence_productId_idx" ON "ProductEquivalence"("productId")`,
  );
  ensureIndex(
    db,
    "ProductEquivalence_equivProductId_idx",
    `CREATE INDEX "ProductEquivalence_equivProductId_idx" ON "ProductEquivalence"("equivProductId")`,
  );
  ensureIndex(
    db,
    "ProductEquivalence_active_idx",
    `CREATE INDEX "ProductEquivalence_active_idx" ON "ProductEquivalence"("active")`,
  );
  upsertMigrationRecord(db, "20260310170000_add_product_equivalences");

  ensureColumn(db, "Product", "subcategory", `ALTER TABLE "Product" ADD COLUMN "subcategory" TEXT`);
  upsertMigrationRecord(db, "20260310190000_add_product_subcategory");

  ensureIndex(
    db,
    "Product_updatedAt_idx",
    `CREATE INDEX "Product_updatedAt_idx" ON "Product"("updatedAt")`,
  );
  ensureIndex(db, "Product_type_idx", `CREATE INDEX "Product_type_idx" ON "Product"("type")`);
  ensureIndex(db, "Product_brand_idx", `CREATE INDEX "Product_brand_idx" ON "Product"("brand")`);
  ensureIndex(
    db,
    "Product_categoryId_idx",
    `CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId")`,
  );
  ensureIndex(
    db,
    "Product_subcategory_idx",
    `CREATE INDEX "Product_subcategory_idx" ON "Product"("subcategory")`,
  );
  ensureIndex(
    db,
    "Location_warehouseId_isActive_code_idx",
    `CREATE INDEX "Location_warehouseId_isActive_code_idx"
     ON "Location"("warehouseId", "isActive", "code")`,
  );
  upsertMigrationRecord(db, "20260330173000_add_runtime_indexes");

  ensureColumn(
    db,
    "Location",
    "usageType",
    `ALTER TABLE "Location" ADD COLUMN "usageType" TEXT NOT NULL DEFAULT 'STORAGE'`,
  );
  ensureColumn(
    db,
    "InventoryMovement",
    "documentType",
    `ALTER TABLE "InventoryMovement" ADD COLUMN "documentType" TEXT`,
  );
  ensureColumn(
    db,
    "InventoryMovement",
    "documentId",
    `ALTER TABLE "InventoryMovement" ADD COLUMN "documentId" TEXT`,
  );
  ensureColumn(
    db,
    "InventoryMovement",
    "documentLineId",
    `ALTER TABLE "InventoryMovement" ADD COLUMN "documentLineId" TEXT`,
  );
  ensureColumn(
    db,
    "ProductionOrder",
    "kind",
    `ALTER TABLE "ProductionOrder" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'GENERIC'`,
  );
  ensureTable(
    db,
    "AssemblyConfiguration",
    `CREATE TABLE "AssemblyConfiguration" (
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
    )`,
  );
  ensureIndex(
    db,
    "AssemblyConfiguration_productionOrderId_key",
    `CREATE UNIQUE INDEX "AssemblyConfiguration_productionOrderId_key"
     ON "AssemblyConfiguration"("productionOrderId")`,
  );
  ensureIndex(
    db,
    "AssemblyConfiguration_productionOrderId_idx",
    `CREATE INDEX "AssemblyConfiguration_productionOrderId_idx"
     ON "AssemblyConfiguration"("productionOrderId")`,
  );
  ensureTable(
    db,
    "AssemblyWorkOrder",
    `CREATE TABLE "AssemblyWorkOrder" (
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
    )`,
  );
  ensureIndex(
    db,
    "AssemblyWorkOrder_productionOrderId_key",
    `CREATE UNIQUE INDEX "AssemblyWorkOrder_productionOrderId_key"
     ON "AssemblyWorkOrder"("productionOrderId")`,
  );
  ensureIndex(
    db,
    "AssemblyWorkOrder_productionOrderId_idx",
    `CREATE INDEX "AssemblyWorkOrder_productionOrderId_idx"
     ON "AssemblyWorkOrder"("productionOrderId")`,
  );
  ensureIndex(
    db,
    "AssemblyWorkOrder_warehouseId_pickStatus_idx",
    `CREATE INDEX "AssemblyWorkOrder_warehouseId_pickStatus_idx"
     ON "AssemblyWorkOrder"("warehouseId", "pickStatus")`,
  );
  ensureTable(
    db,
    "AssemblyWorkOrderLine",
    `CREATE TABLE "AssemblyWorkOrderLine" (
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
    )`,
  );
  ensureIndex(
    db,
    "AssemblyWorkOrderLine_assemblyWorkOrderId_componentRole_key",
    `CREATE UNIQUE INDEX "AssemblyWorkOrderLine_assemblyWorkOrderId_componentRole_key"
     ON "AssemblyWorkOrderLine"("assemblyWorkOrderId", "componentRole")`,
  );
  ensureIndex(
    db,
    "AssemblyWorkOrderLine_assemblyWorkOrderId_idx",
    `CREATE INDEX "AssemblyWorkOrderLine_assemblyWorkOrderId_idx"
     ON "AssemblyWorkOrderLine"("assemblyWorkOrderId")`,
  );
  ensureIndex(
    db,
    "AssemblyWorkOrderLine_productId_idx",
    `CREATE INDEX "AssemblyWorkOrderLine_productId_idx" ON "AssemblyWorkOrderLine"("productId")`,
  );
  ensureTable(
    db,
    "PickList",
    `CREATE TABLE "PickList" (
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
    )`,
  );
  ensureIndex(db, "PickList_code_key", `CREATE UNIQUE INDEX "PickList_code_key" ON "PickList"("code")`);
  ensureIndex(
    db,
    "PickList_assemblyWorkOrderId_status_idx",
    `CREATE INDEX "PickList_assemblyWorkOrderId_status_idx"
     ON "PickList"("assemblyWorkOrderId", "status")`,
  );
  ensureTable(
    db,
    "PickTask",
    `CREATE TABLE "PickTask" (
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
    )`,
  );
  ensureIndex(
    db,
    "PickTask_pickListId_sequence_idx",
    `CREATE INDEX "PickTask_pickListId_sequence_idx" ON "PickTask"("pickListId", "sequence")`,
  );
  ensureIndex(
    db,
    "PickTask_assemblyWorkOrderLineId_idx",
    `CREATE INDEX "PickTask_assemblyWorkOrderLineId_idx" ON "PickTask"("assemblyWorkOrderLineId")`,
  );
  ensureIndex(
    db,
    "PickTask_sourceLocationId_status_idx",
    `CREATE INDEX "PickTask_sourceLocationId_status_idx" ON "PickTask"("sourceLocationId", "status")`,
  );
  ensureIndex(
    db,
    "InventoryMovement_documentType_documentId_idx",
    `CREATE INDEX "InventoryMovement_documentType_documentId_idx"
     ON "InventoryMovement"("documentType", "documentId")`,
  );
  upsertMigrationRecord(db, "20260331130000_add_assembly_workflow");

  ensureColumn(
    db,
    "Product",
    "unitLabel",
    `ALTER TABLE "Product" ADD COLUMN "unitLabel" TEXT NOT NULL DEFAULT 'unidad'`,
  );
  ensureColumn(
    db,
    "InventoryMovement",
    "traceId",
    `ALTER TABLE "InventoryMovement" ADD COLUMN "traceId" TEXT`,
  );
  ensureColumn(
    db,
    "InventoryMovement",
    "operatorName",
    `ALTER TABLE "InventoryMovement" ADD COLUMN "operatorName" TEXT`,
  );
  ensureTable(
    db,
    "TraceRecord",
    `CREATE TABLE "TraceRecord" (
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
    )`,
  );
  ensureIndex(
    db,
    "TraceRecord_traceId_key",
    `CREATE UNIQUE INDEX "TraceRecord_traceId_key" ON "TraceRecord"("traceId")`,
  );
  ensureIndex(
    db,
    "TraceRecord_sourceEntityType_sourceEntityId_key",
    `CREATE UNIQUE INDEX "TraceRecord_sourceEntityType_sourceEntityId_key"
     ON "TraceRecord"("sourceEntityType", "sourceEntityId")`,
  );
  ensureIndex(
    db,
    "TraceRecord_originMovementId_key",
    `CREATE UNIQUE INDEX "TraceRecord_originMovementId_key" ON "TraceRecord"("originMovementId")`,
  );
  ensureIndex(
    db,
    "TraceRecord_labelType_idx",
    `CREATE INDEX "TraceRecord_labelType_idx" ON "TraceRecord"("labelType")`,
  );
  ensureIndex(
    db,
    "TraceRecord_sourceDocumentType_sourceDocumentId_idx",
    `CREATE INDEX "TraceRecord_sourceDocumentType_sourceDocumentId_idx"
     ON "TraceRecord"("sourceDocumentType", "sourceDocumentId")`,
  );
  ensureIndex(
    db,
    "TraceRecord_createdAt_idx",
    `CREATE INDEX "TraceRecord_createdAt_idx" ON "TraceRecord"("createdAt")`,
  );
  ensureTable(
    db,
    "LabelTemplate",
    `CREATE TABLE "LabelTemplate" (
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
    )`,
  );
  ensureIndex(
    db,
    "LabelTemplate_code_key",
    `CREATE UNIQUE INDEX "LabelTemplate_code_key" ON "LabelTemplate"("code")`,
  );
  ensureIndex(
    db,
    "LabelTemplate_labelType_isActive_isDefault_idx",
    `CREATE INDEX "LabelTemplate_labelType_isActive_isDefault_idx"
     ON "LabelTemplate"("labelType", "isActive", "isDefault")`,
  );
  ensureTable(
    db,
    "LabelPrintJob",
    `CREATE TABLE "LabelPrintJob" (
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
    )`,
  );
  ensureIndex(
    db,
    "LabelPrintJob_traceRecordId_createdAt_idx",
    `CREATE INDEX "LabelPrintJob_traceRecordId_createdAt_idx"
     ON "LabelPrintJob"("traceRecordId", "createdAt")`,
  );
  ensureIndex(
    db,
    "LabelPrintJob_labelTemplateId_idx",
    `CREATE INDEX "LabelPrintJob_labelTemplateId_idx" ON "LabelPrintJob"("labelTemplateId")`,
  );
  ensureIndex(
    db,
    "LabelPrintJob_status_idx",
    `CREATE INDEX "LabelPrintJob_status_idx" ON "LabelPrintJob"("status")`,
  );
  ensureIndex(
    db,
    "InventoryMovement_traceId_idx",
    `CREATE INDEX "InventoryMovement_traceId_idx" ON "InventoryMovement"("traceId")`,
  );
  upsertMigrationRecord(db, "20260331153000_add_traceability_labels");
}

if (!fs.existsSync(dbPath)) {
  throw new Error(`Database not found at ${dbPath}`);
}

const db = new DatabaseSync(dbPath);

db.exec("BEGIN IMMEDIATE");
try {
  repairDatabase(db);
  db.exec("COMMIT");
  const rows = db
    .prepare(
      `SELECT migration_name, finished_at, applied_steps_count
       FROM _prisma_migrations
       WHERE migration_name IN (${MIGRATIONS.map(() => "?").join(", ")})
       ORDER BY migration_name`,
    )
    .all(...MIGRATIONS);
  console.log(JSON.stringify(rows, null, 2));
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
} finally {
  db.close();
}
