-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "businessName" TEXT,
    "taxId" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "SalesInternalOrder"
ADD COLUMN "customerId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Customer_code_key" ON "Customer"("code");

-- CreateIndex
CREATE INDEX "Customer_isActive_idx" ON "Customer"("isActive");

-- CreateIndex
CREATE INDEX "Customer_name_idx" ON "Customer"("name");

-- CreateIndex
CREATE INDEX "Customer_taxId_idx" ON "Customer"("taxId");

-- CreateIndex
CREATE INDEX "SalesInternalOrder_customerId_idx" ON "SalesInternalOrder"("customerId");

-- AddForeignKey
ALTER TABLE "SalesInternalOrder"
ADD CONSTRAINT "SalesInternalOrder_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
