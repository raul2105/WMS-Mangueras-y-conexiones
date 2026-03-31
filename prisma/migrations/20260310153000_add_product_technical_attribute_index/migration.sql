-- CreateTable
CREATE TABLE "ProductTechnicalAttribute" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "keyNormalized" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "valueNormalized" TEXT NOT NULL,
    CONSTRAINT "ProductTechnicalAttribute_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductTechnicalAttribute_productId_keyNormalized_valueNormalized_key" ON "ProductTechnicalAttribute"("productId", "keyNormalized", "valueNormalized");

-- CreateIndex
CREATE INDEX "ProductTechnicalAttribute_productId_idx" ON "ProductTechnicalAttribute"("productId");

-- CreateIndex
CREATE INDEX "ProductTechnicalAttribute_keyNormalized_idx" ON "ProductTechnicalAttribute"("keyNormalized");

-- CreateIndex
CREATE INDEX "ProductTechnicalAttribute_keyNormalized_valueNormalized_idx" ON "ProductTechnicalAttribute"("keyNormalized", "valueNormalized");

-- CreateIndex
CREATE INDEX "ProductTechnicalAttribute_valueNormalized_idx" ON "ProductTechnicalAttribute"("valueNormalized");
