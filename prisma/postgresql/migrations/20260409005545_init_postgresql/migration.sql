-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('IN', 'OUT', 'TRANSFER', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "LocationUsageType" AS ENUM ('STORAGE', 'RECEIVING', 'SHIPPING', 'STAGING', 'WIP');

-- CreateEnum
CREATE TYPE "ProductionOrderStatus" AS ENUM ('BORRADOR', 'ABIERTA', 'EN_PROCESO', 'COMPLETADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "SalesInternalOrderStatus" AS ENUM ('BORRADOR', 'CONFIRMADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "SalesInternalOrderLineKind" AS ENUM ('PRODUCT', 'CONFIGURED_ASSEMBLY');

-- CreateEnum
CREATE TYPE "ProductionOrderKind" AS ENUM ('GENERIC', 'ASSEMBLY_3PIECE');

-- CreateEnum
CREATE TYPE "LabelType" AS ENUM ('RECEIPT', 'PICKING', 'LOCATION', 'ADJUSTMENT', 'WIP');

-- CreateEnum
CREATE TYPE "LabelRendererKind" AS ENUM ('HTML', 'ZPL');

-- CreateEnum
CREATE TYPE "LabelSymbolKind" AS ENUM ('QR', 'CODE128');

-- CreateEnum
CREATE TYPE "LabelPrintJobStatus" AS ENUM ('PENDING', 'RENDERED', 'PRINTED', 'EXPORTED', 'FAILED');

-- CreateEnum
CREATE TYPE "AssemblyAvailabilityStatus" AS ENUM ('EXACT', 'INSUFFICIENT');

-- CreateEnum
CREATE TYPE "AssemblyReservationStatus" AS ENUM ('NONE', 'RESERVED', 'PARTIAL', 'RELEASED');

-- CreateEnum
CREATE TYPE "AssemblyPickStatus" AS ENUM ('NOT_RELEASED', 'RELEASED', 'IN_PROGRESS', 'PARTIAL', 'COMPLETED', 'CANCELED');

-- CreateEnum
CREATE TYPE "AssemblyWipStatus" AS ENUM ('NOT_IN_WIP', 'PARTIAL', 'IN_WIP', 'CONSUMED');

-- CreateEnum
CREATE TYPE "AssemblyConsumptionStatus" AS ENUM ('NOT_CONSUMED', 'PARTIAL', 'CONSUMED');

-- CreateEnum
CREATE TYPE "AssemblyComponentRole" AS ENUM ('ENTRY_FITTING', 'HOSE', 'EXIT_FITTING');

-- CreateEnum
CREATE TYPE "PickListStatus" AS ENUM ('DRAFT', 'RELEASED', 'IN_PROGRESS', 'PARTIAL', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PickTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'PARTIAL', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('BORRADOR', 'CONFIRMADA', 'EN_TRANSITO', 'RECIBIDA', 'PARCIAL', 'CANCELADA');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "referenceCode" TEXT,
    "imageUrl" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "unitLabel" TEXT NOT NULL DEFAULT 'unidad',
    "brand" TEXT,
    "subcategory" TEXT,
    "base_cost" DOUBLE PRECISION,
    "price" DOUBLE PRECISION,
    "attributes" TEXT,
    "categoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductTechnicalAttribute" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "keyNormalized" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "valueNormalized" TEXT NOT NULL,

    CONSTRAINT "ProductTechnicalAttribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductEquivalence" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "equivProductId" TEXT NOT NULL,
    "basisNorm" TEXT,
    "basisDash" INTEGER,
    "sourceSheet" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductEquivalence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "zone" TEXT,
    "aisle" TEXT,
    "rack" TEXT,
    "level" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "capacity" DOUBLE PRECISION,
    "usageType" "LocationUsageType" NOT NULL DEFAULT 'STORAGE',
    "warehouseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inventory" (
    "id" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reserved" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "available" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "productId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "type" "InventoryMovementType" NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TraceRecord" (
    "id" TEXT NOT NULL,
    "traceId" TEXT NOT NULL,
    "labelType" "LabelType" NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceEntityId" TEXT NOT NULL,
    "sourceDocumentType" TEXT,
    "sourceDocumentId" TEXT,
    "sourceDocumentLineId" TEXT,
    "companyName" TEXT NOT NULL,
    "operatorName" TEXT,
    "operatorUserId" TEXT,
    "reference" TEXT,
    "quantity" DOUBLE PRECISION,
    "unitLabel" TEXT,
    "payloadJson" TEXT NOT NULL,
    "productId" TEXT,
    "warehouseId" TEXT,
    "locationId" TEXT,
    "originMovementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TraceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabelTemplate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "labelType" "LabelType" NOT NULL,
    "rendererKind" "LabelRendererKind" NOT NULL DEFAULT 'HTML',
    "symbolKind" "LabelSymbolKind" NOT NULL DEFAULT 'QR',
    "paperSize" TEXT,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "definitionJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabelTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabelPrintJob" (
    "id" TEXT NOT NULL,
    "traceRecordId" TEXT NOT NULL,
    "labelTemplateId" TEXT NOT NULL,
    "status" "LabelPrintJobStatus" NOT NULL DEFAULT 'PENDING',
    "copies" INTEGER NOT NULL DEFAULT 1,
    "outputFormat" TEXT NOT NULL DEFAULT 'html',
    "payloadJson" TEXT NOT NULL,
    "htmlSnapshot" TEXT,
    "requestedBy" TEXT,
    "printedAt" TIMESTAMP(3),
    "exportedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabelPrintJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionOrder" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" "ProductionOrderKind" NOT NULL DEFAULT 'GENERIC',
    "status" "ProductionOrderStatus" NOT NULL DEFAULT 'BORRADOR',
    "priority" INTEGER NOT NULL DEFAULT 3,
    "customerName" TEXT,
    "dueDate" TIMESTAMP(3),
    "notes" TEXT,
    "sourceDocumentType" TEXT,
    "sourceDocumentId" TEXT,
    "sourceDocumentLineId" TEXT,
    "warehouseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesInternalOrder" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "SalesInternalOrderStatus" NOT NULL DEFAULT 'BORRADOR',
    "customerName" TEXT,
    "warehouseId" TEXT,
    "dueDate" TIMESTAMP(3),
    "notes" TEXT,
    "requestedByUserId" TEXT,
    "confirmedByUserId" TEXT,
    "cancelledByUserId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesInternalOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesInternalOrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "lineKind" "SalesInternalOrderLineKind" NOT NULL DEFAULT 'PRODUCT',
    "productId" TEXT,
    "requestedQty" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesInternalOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesInternalOrderAssemblyConfig" (
    "id" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "entryFittingProductId" TEXT NOT NULL,
    "hoseProductId" TEXT NOT NULL,
    "exitFittingProductId" TEXT NOT NULL,
    "hoseLength" DOUBLE PRECISION NOT NULL,
    "assemblyQuantity" DOUBLE PRECISION NOT NULL,
    "totalHoseRequired" DOUBLE PRECISION NOT NULL,
    "sourceDocumentRef" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesInternalOrderAssemblyConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesInternalOrderPickList" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "targetLocationId" TEXT NOT NULL,
    "status" "PickListStatus" NOT NULL DEFAULT 'DRAFT',
    "releasedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesInternalOrderPickList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesInternalOrderPickTask" (
    "id" TEXT NOT NULL,
    "pickListId" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "sourceLocationId" TEXT NOT NULL,
    "targetLocationId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "requestedQty" DOUBLE PRECISION NOT NULL,
    "reservedQty" DOUBLE PRECISION NOT NULL,
    "pickedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "shortQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "PickTaskStatus" NOT NULL DEFAULT 'PENDING',
    "shortReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesInternalOrderPickTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssemblyConfiguration" (
    "id" TEXT NOT NULL,
    "productionOrderId" TEXT NOT NULL,
    "entryFittingProductId" TEXT NOT NULL,
    "hoseProductId" TEXT NOT NULL,
    "exitFittingProductId" TEXT NOT NULL,
    "hoseLength" DOUBLE PRECISION NOT NULL,
    "assemblyQuantity" DOUBLE PRECISION NOT NULL,
    "totalHoseRequired" DOUBLE PRECISION NOT NULL,
    "sourceDocumentRef" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssemblyConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssemblyWorkOrder" (
    "id" TEXT NOT NULL,
    "productionOrderId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "wipLocationId" TEXT NOT NULL,
    "availabilityStatus" "AssemblyAvailabilityStatus" NOT NULL DEFAULT 'EXACT',
    "reservationStatus" "AssemblyReservationStatus" NOT NULL DEFAULT 'NONE',
    "pickStatus" "AssemblyPickStatus" NOT NULL DEFAULT 'NOT_RELEASED',
    "wipStatus" "AssemblyWipStatus" NOT NULL DEFAULT 'NOT_IN_WIP',
    "consumptionStatus" "AssemblyConsumptionStatus" NOT NULL DEFAULT 'NOT_CONSUMED',
    "hasShortage" BOOLEAN NOT NULL DEFAULT false,
    "releasedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssemblyWorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssemblyWorkOrderLine" (
    "id" TEXT NOT NULL,
    "assemblyWorkOrderId" TEXT NOT NULL,
    "componentRole" "AssemblyComponentRole" NOT NULL,
    "productId" TEXT NOT NULL,
    "unitLabel" TEXT,
    "perAssemblyQty" DOUBLE PRECISION NOT NULL,
    "requiredQty" DOUBLE PRECISION NOT NULL,
    "reservedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pickedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "wipQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "consumedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "shortQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reservationStatus" "AssemblyReservationStatus" NOT NULL DEFAULT 'NONE',
    "pickStatus" "AssemblyPickStatus" NOT NULL DEFAULT 'NOT_RELEASED',
    "wipStatus" "AssemblyWipStatus" NOT NULL DEFAULT 'NOT_IN_WIP',
    "consumptionStatus" "AssemblyConsumptionStatus" NOT NULL DEFAULT 'NOT_CONSUMED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssemblyWorkOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PickList" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "assemblyWorkOrderId" TEXT NOT NULL,
    "status" "PickListStatus" NOT NULL DEFAULT 'DRAFT',
    "releasedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PickList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PickTask" (
    "id" TEXT NOT NULL,
    "pickListId" TEXT NOT NULL,
    "assemblyWorkOrderLineId" TEXT NOT NULL,
    "sourceLocationId" TEXT NOT NULL,
    "targetWipLocationId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "requestedQty" DOUBLE PRECISION NOT NULL,
    "reservedQty" DOUBLE PRECISION NOT NULL,
    "pickedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "shortQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "PickTaskStatus" NOT NULL DEFAULT 'PENDING',
    "shortReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PickTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "action" TEXT NOT NULL,
    "before" TEXT,
    "after" TEXT,
    "actor" TEXT,
    "actorUserId" TEXT,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportLog" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER,
    "rows" INTEGER,
    "skus" INTEGER,
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taxId" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierProduct" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "supplierSku" TEXT,
    "unitPrice" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "leadTimeDays" INTEGER,

    CONSTRAINT "SupplierProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'BORRADOR',
    "expectedDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderLine" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qtyOrdered" INTEGER NOT NULL,
    "qtyReceived" INTEGER NOT NULL DEFAULT 0,
    "unitPrice" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'MXN',

    CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseReceipt" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "referenceDoc" TEXT,

    CONSTRAINT "PurchaseReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseReceiptLine" (
    "id" TEXT NOT NULL,
    "purchaseReceiptId" TEXT NOT NULL,
    "purchaseOrderLineId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qtyReceived" INTEGER NOT NULL,

    CONSTRAINT "PurchaseReceiptLine_pkey" PRIMARY KEY ("id")
);

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

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "Product_referenceCode_key" ON "Product"("referenceCode");

-- CreateIndex
CREATE INDEX "Product_updatedAt_idx" ON "Product"("updatedAt");

-- CreateIndex
CREATE INDEX "Product_type_idx" ON "Product"("type");

-- CreateIndex
CREATE INDEX "Product_brand_idx" ON "Product"("brand");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- CreateIndex
CREATE INDEX "Product_subcategory_idx" ON "Product"("subcategory");

-- CreateIndex
CREATE INDEX "ProductTechnicalAttribute_productId_idx" ON "ProductTechnicalAttribute"("productId");

-- CreateIndex
CREATE INDEX "ProductTechnicalAttribute_keyNormalized_idx" ON "ProductTechnicalAttribute"("keyNormalized");

-- CreateIndex
CREATE INDEX "ProductTechnicalAttribute_keyNormalized_valueNormalized_idx" ON "ProductTechnicalAttribute"("keyNormalized", "valueNormalized");

-- CreateIndex
CREATE INDEX "ProductTechnicalAttribute_valueNormalized_idx" ON "ProductTechnicalAttribute"("valueNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "ProductTechnicalAttribute_productId_keyNormalized_valueNorm_key" ON "ProductTechnicalAttribute"("productId", "keyNormalized", "valueNormalized");

-- CreateIndex
CREATE INDEX "ProductEquivalence_productId_idx" ON "ProductEquivalence"("productId");

-- CreateIndex
CREATE INDEX "ProductEquivalence_equivProductId_idx" ON "ProductEquivalence"("equivProductId");

-- CreateIndex
CREATE INDEX "ProductEquivalence_active_idx" ON "ProductEquivalence"("active");

-- CreateIndex
CREATE UNIQUE INDEX "ProductEquivalence_productId_equivProductId_key" ON "ProductEquivalence"("productId", "equivProductId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_code_key" ON "Warehouse"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Location_code_key" ON "Location"("code");

-- CreateIndex
CREATE INDEX "Location_warehouseId_isActive_code_idx" ON "Location"("warehouseId", "isActive", "code");

-- CreateIndex
CREATE INDEX "Inventory_productId_idx" ON "Inventory"("productId");

-- CreateIndex
CREATE INDEX "Inventory_locationId_idx" ON "Inventory"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "Inventory_productId_locationId_key" ON "Inventory"("productId", "locationId");

-- CreateIndex
CREATE INDEX "InventoryMovement_productId_idx" ON "InventoryMovement"("productId");

-- CreateIndex
CREATE INDEX "InventoryMovement_locationId_idx" ON "InventoryMovement"("locationId");

-- CreateIndex
CREATE INDEX "InventoryMovement_type_idx" ON "InventoryMovement"("type");

-- CreateIndex
CREATE INDEX "InventoryMovement_createdAt_idx" ON "InventoryMovement"("createdAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_documentType_documentId_idx" ON "InventoryMovement"("documentType", "documentId");

-- CreateIndex
CREATE INDEX "InventoryMovement_traceId_idx" ON "InventoryMovement"("traceId");

-- CreateIndex
CREATE INDEX "InventoryMovement_operatorUserId_idx" ON "InventoryMovement"("operatorUserId");

-- CreateIndex
CREATE UNIQUE INDEX "TraceRecord_traceId_key" ON "TraceRecord"("traceId");

-- CreateIndex
CREATE UNIQUE INDEX "TraceRecord_originMovementId_key" ON "TraceRecord"("originMovementId");

-- CreateIndex
CREATE INDEX "TraceRecord_labelType_idx" ON "TraceRecord"("labelType");

-- CreateIndex
CREATE INDEX "TraceRecord_sourceDocumentType_sourceDocumentId_idx" ON "TraceRecord"("sourceDocumentType", "sourceDocumentId");

-- CreateIndex
CREATE INDEX "TraceRecord_createdAt_idx" ON "TraceRecord"("createdAt");

-- CreateIndex
CREATE INDEX "TraceRecord_operatorUserId_idx" ON "TraceRecord"("operatorUserId");

-- CreateIndex
CREATE UNIQUE INDEX "TraceRecord_sourceEntityType_sourceEntityId_key" ON "TraceRecord"("sourceEntityType", "sourceEntityId");

-- CreateIndex
CREATE UNIQUE INDEX "LabelTemplate_code_key" ON "LabelTemplate"("code");

-- CreateIndex
CREATE INDEX "LabelTemplate_labelType_isActive_isDefault_idx" ON "LabelTemplate"("labelType", "isActive", "isDefault");

-- CreateIndex
CREATE INDEX "LabelPrintJob_traceRecordId_createdAt_idx" ON "LabelPrintJob"("traceRecordId", "createdAt");

-- CreateIndex
CREATE INDEX "LabelPrintJob_labelTemplateId_idx" ON "LabelPrintJob"("labelTemplateId");

-- CreateIndex
CREATE INDEX "LabelPrintJob_status_idx" ON "LabelPrintJob"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionOrder_code_key" ON "ProductionOrder"("code");

-- CreateIndex
CREATE INDEX "ProductionOrder_warehouseId_idx" ON "ProductionOrder"("warehouseId");

-- CreateIndex
CREATE INDEX "ProductionOrder_status_idx" ON "ProductionOrder"("status");

-- CreateIndex
CREATE INDEX "ProductionOrder_createdAt_idx" ON "ProductionOrder"("createdAt");

-- CreateIndex
CREATE INDEX "ProductionOrder_sourceDocumentType_sourceDocumentId_idx" ON "ProductionOrder"("sourceDocumentType", "sourceDocumentId");

-- CreateIndex
CREATE INDEX "ProductionOrderItem_orderId_idx" ON "ProductionOrderItem"("orderId");

-- CreateIndex
CREATE INDEX "ProductionOrderItem_productId_idx" ON "ProductionOrderItem"("productId");

-- CreateIndex
CREATE INDEX "ProductionOrderItem_locationId_idx" ON "ProductionOrderItem"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionOrderItem_orderId_productId_locationId_key" ON "ProductionOrderItem"("orderId", "productId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesInternalOrder_code_key" ON "SalesInternalOrder"("code");

-- CreateIndex
CREATE INDEX "SalesInternalOrder_status_createdAt_idx" ON "SalesInternalOrder"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SalesInternalOrder_requestedByUserId_idx" ON "SalesInternalOrder"("requestedByUserId");

-- CreateIndex
CREATE INDEX "SalesInternalOrder_warehouseId_idx" ON "SalesInternalOrder"("warehouseId");

-- CreateIndex
CREATE INDEX "SalesInternalOrderLine_orderId_idx" ON "SalesInternalOrderLine"("orderId");

-- CreateIndex
CREATE INDEX "SalesInternalOrderLine_productId_idx" ON "SalesInternalOrderLine"("productId");

-- CreateIndex
CREATE INDEX "SalesInternalOrderLine_orderId_lineKind_idx" ON "SalesInternalOrderLine"("orderId", "lineKind");

-- CreateIndex
CREATE UNIQUE INDEX "SalesInternalOrderAssemblyConfig_orderLineId_key" ON "SalesInternalOrderAssemblyConfig"("orderLineId");

-- CreateIndex
CREATE INDEX "SalesInternalOrderAssemblyConfig_entryFittingProductId_idx" ON "SalesInternalOrderAssemblyConfig"("entryFittingProductId");

-- CreateIndex
CREATE INDEX "SalesInternalOrderAssemblyConfig_hoseProductId_idx" ON "SalesInternalOrderAssemblyConfig"("hoseProductId");

-- CreateIndex
CREATE INDEX "SalesInternalOrderAssemblyConfig_exitFittingProductId_idx" ON "SalesInternalOrderAssemblyConfig"("exitFittingProductId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesInternalOrderPickList_code_key" ON "SalesInternalOrderPickList"("code");

-- CreateIndex
CREATE INDEX "SalesInternalOrderPickList_orderId_status_idx" ON "SalesInternalOrderPickList"("orderId", "status");

-- CreateIndex
CREATE INDEX "SalesInternalOrderPickList_targetLocationId_idx" ON "SalesInternalOrderPickList"("targetLocationId");

-- CreateIndex
CREATE INDEX "SalesInternalOrderPickTask_pickListId_sequence_idx" ON "SalesInternalOrderPickTask"("pickListId", "sequence");

-- CreateIndex
CREATE INDEX "SalesInternalOrderPickTask_orderLineId_idx" ON "SalesInternalOrderPickTask"("orderLineId");

-- CreateIndex
CREATE INDEX "SalesInternalOrderPickTask_sourceLocationId_status_idx" ON "SalesInternalOrderPickTask"("sourceLocationId", "status");

-- CreateIndex
CREATE INDEX "SalesInternalOrderPickTask_targetLocationId_status_idx" ON "SalesInternalOrderPickTask"("targetLocationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AssemblyConfiguration_productionOrderId_key" ON "AssemblyConfiguration"("productionOrderId");

-- CreateIndex
CREATE INDEX "AssemblyConfiguration_productionOrderId_idx" ON "AssemblyConfiguration"("productionOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "AssemblyWorkOrder_productionOrderId_key" ON "AssemblyWorkOrder"("productionOrderId");

-- CreateIndex
CREATE INDEX "AssemblyWorkOrder_productionOrderId_idx" ON "AssemblyWorkOrder"("productionOrderId");

-- CreateIndex
CREATE INDEX "AssemblyWorkOrder_warehouseId_pickStatus_idx" ON "AssemblyWorkOrder"("warehouseId", "pickStatus");

-- CreateIndex
CREATE INDEX "AssemblyWorkOrderLine_assemblyWorkOrderId_idx" ON "AssemblyWorkOrderLine"("assemblyWorkOrderId");

-- CreateIndex
CREATE INDEX "AssemblyWorkOrderLine_productId_idx" ON "AssemblyWorkOrderLine"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "AssemblyWorkOrderLine_assemblyWorkOrderId_componentRole_key" ON "AssemblyWorkOrderLine"("assemblyWorkOrderId", "componentRole");

-- CreateIndex
CREATE UNIQUE INDEX "PickList_code_key" ON "PickList"("code");

-- CreateIndex
CREATE INDEX "PickList_assemblyWorkOrderId_status_idx" ON "PickList"("assemblyWorkOrderId", "status");

-- CreateIndex
CREATE INDEX "PickTask_pickListId_sequence_idx" ON "PickTask"("pickListId", "sequence");

-- CreateIndex
CREATE INDEX "PickTask_assemblyWorkOrderLineId_idx" ON "PickTask"("assemblyWorkOrderLineId");

-- CreateIndex
CREATE INDEX "PickTask_sourceLocationId_status_idx" ON "PickTask"("sourceLocationId", "status");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_idx" ON "AuditLog"("entityType");

-- CreateIndex
CREATE INDEX "AuditLog_entityId_idx" ON "AuditLog"("entityId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_idx" ON "AuditLog"("actorUserId");

-- CreateIndex
CREATE INDEX "ImportLog_status_idx" ON "ImportLog"("status");

-- CreateIndex
CREATE INDEX "ImportLog_createdAt_idx" ON "ImportLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_code_key" ON "Supplier"("code");

-- CreateIndex
CREATE INDEX "Supplier_isActive_idx" ON "Supplier"("isActive");

-- CreateIndex
CREATE INDEX "SupplierProduct_supplierId_idx" ON "SupplierProduct"("supplierId");

-- CreateIndex
CREATE INDEX "SupplierProduct_productId_idx" ON "SupplierProduct"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierProduct_supplierId_productId_key" ON "SupplierProduct"("supplierId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_folio_key" ON "PurchaseOrder"("folio");

-- CreateIndex
CREATE INDEX "PurchaseOrder_supplierId_idx" ON "PurchaseOrder"("supplierId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_status_idx" ON "PurchaseOrder"("status");

-- CreateIndex
CREATE INDEX "PurchaseOrder_createdAt_idx" ON "PurchaseOrder"("createdAt");

-- CreateIndex
CREATE INDEX "PurchaseOrderLine_purchaseOrderId_idx" ON "PurchaseOrderLine"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "PurchaseOrderLine_productId_idx" ON "PurchaseOrderLine"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrderLine_purchaseOrderId_productId_key" ON "PurchaseOrderLine"("purchaseOrderId", "productId");

-- CreateIndex
CREATE INDEX "PurchaseReceipt_purchaseOrderId_idx" ON "PurchaseReceipt"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "PurchaseReceipt_receivedAt_idx" ON "PurchaseReceipt"("receivedAt");

-- CreateIndex
CREATE INDEX "PurchaseReceiptLine_purchaseReceiptId_idx" ON "PurchaseReceiptLine"("purchaseReceiptId");

-- CreateIndex
CREATE INDEX "PurchaseReceiptLine_purchaseOrderLineId_idx" ON "PurchaseReceiptLine"("purchaseOrderLineId");

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTechnicalAttribute" ADD CONSTRAINT "ProductTechnicalAttribute_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductEquivalence" ADD CONSTRAINT "ProductEquivalence_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductEquivalence" ADD CONSTRAINT "ProductEquivalence_equivProductId_fkey" FOREIGN KEY ("equivProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_operatorUserId_fkey" FOREIGN KEY ("operatorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TraceRecord" ADD CONSTRAINT "TraceRecord_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TraceRecord" ADD CONSTRAINT "TraceRecord_operatorUserId_fkey" FOREIGN KEY ("operatorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TraceRecord" ADD CONSTRAINT "TraceRecord_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TraceRecord" ADD CONSTRAINT "TraceRecord_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TraceRecord" ADD CONSTRAINT "TraceRecord_originMovementId_fkey" FOREIGN KEY ("originMovementId") REFERENCES "InventoryMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabelPrintJob" ADD CONSTRAINT "LabelPrintJob_traceRecordId_fkey" FOREIGN KEY ("traceRecordId") REFERENCES "TraceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabelPrintJob" ADD CONSTRAINT "LabelPrintJob_labelTemplateId_fkey" FOREIGN KEY ("labelTemplateId") REFERENCES "LabelTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrderItem" ADD CONSTRAINT "ProductionOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ProductionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrderItem" ADD CONSTRAINT "ProductionOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrderItem" ADD CONSTRAINT "ProductionOrderItem_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInternalOrder" ADD CONSTRAINT "SalesInternalOrder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInternalOrder" ADD CONSTRAINT "SalesInternalOrder_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInternalOrder" ADD CONSTRAINT "SalesInternalOrder_confirmedByUserId_fkey" FOREIGN KEY ("confirmedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInternalOrder" ADD CONSTRAINT "SalesInternalOrder_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInternalOrderLine" ADD CONSTRAINT "SalesInternalOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesInternalOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInternalOrderLine" ADD CONSTRAINT "SalesInternalOrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInternalOrderAssemblyConfig" ADD CONSTRAINT "SalesInternalOrderAssemblyConfig_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "SalesInternalOrderLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInternalOrderAssemblyConfig" ADD CONSTRAINT "SalesInternalOrderAssemblyConfig_entryFittingProductId_fkey" FOREIGN KEY ("entryFittingProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInternalOrderAssemblyConfig" ADD CONSTRAINT "SalesInternalOrderAssemblyConfig_hoseProductId_fkey" FOREIGN KEY ("hoseProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInternalOrderAssemblyConfig" ADD CONSTRAINT "SalesInternalOrderAssemblyConfig_exitFittingProductId_fkey" FOREIGN KEY ("exitFittingProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInternalOrderPickList" ADD CONSTRAINT "SalesInternalOrderPickList_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesInternalOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInternalOrderPickList" ADD CONSTRAINT "SalesInternalOrderPickList_targetLocationId_fkey" FOREIGN KEY ("targetLocationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInternalOrderPickTask" ADD CONSTRAINT "SalesInternalOrderPickTask_pickListId_fkey" FOREIGN KEY ("pickListId") REFERENCES "SalesInternalOrderPickList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInternalOrderPickTask" ADD CONSTRAINT "SalesInternalOrderPickTask_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "SalesInternalOrderLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInternalOrderPickTask" ADD CONSTRAINT "SalesInternalOrderPickTask_sourceLocationId_fkey" FOREIGN KEY ("sourceLocationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInternalOrderPickTask" ADD CONSTRAINT "SalesInternalOrderPickTask_targetLocationId_fkey" FOREIGN KEY ("targetLocationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyConfiguration" ADD CONSTRAINT "AssemblyConfiguration_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyConfiguration" ADD CONSTRAINT "AssemblyConfiguration_entryFittingProductId_fkey" FOREIGN KEY ("entryFittingProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyConfiguration" ADD CONSTRAINT "AssemblyConfiguration_hoseProductId_fkey" FOREIGN KEY ("hoseProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyConfiguration" ADD CONSTRAINT "AssemblyConfiguration_exitFittingProductId_fkey" FOREIGN KEY ("exitFittingProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyWorkOrder" ADD CONSTRAINT "AssemblyWorkOrder_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyWorkOrder" ADD CONSTRAINT "AssemblyWorkOrder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyWorkOrder" ADD CONSTRAINT "AssemblyWorkOrder_wipLocationId_fkey" FOREIGN KEY ("wipLocationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyWorkOrderLine" ADD CONSTRAINT "AssemblyWorkOrderLine_assemblyWorkOrderId_fkey" FOREIGN KEY ("assemblyWorkOrderId") REFERENCES "AssemblyWorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyWorkOrderLine" ADD CONSTRAINT "AssemblyWorkOrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickList" ADD CONSTRAINT "PickList_assemblyWorkOrderId_fkey" FOREIGN KEY ("assemblyWorkOrderId") REFERENCES "AssemblyWorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickTask" ADD CONSTRAINT "PickTask_pickListId_fkey" FOREIGN KEY ("pickListId") REFERENCES "PickList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickTask" ADD CONSTRAINT "PickTask_assemblyWorkOrderLineId_fkey" FOREIGN KEY ("assemblyWorkOrderLineId") REFERENCES "AssemblyWorkOrderLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickTask" ADD CONSTRAINT "PickTask_sourceLocationId_fkey" FOREIGN KEY ("sourceLocationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickTask" ADD CONSTRAINT "PickTask_targetWipLocationId_fkey" FOREIGN KEY ("targetWipLocationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierProduct" ADD CONSTRAINT "SupplierProduct_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierProduct" ADD CONSTRAINT "SupplierProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceiptLine" ADD CONSTRAINT "PurchaseReceiptLine_purchaseReceiptId_fkey" FOREIGN KEY ("purchaseReceiptId") REFERENCES "PurchaseReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceiptLine" ADD CONSTRAINT "PurchaseReceiptLine_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "PurchaseOrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
