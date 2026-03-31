-- CreateTable
CREATE TABLE "ProductEquivalence" (
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
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductEquivalence_productId_equivProductId_key" ON "ProductEquivalence"("productId", "equivProductId");

-- CreateIndex
CREATE INDEX "ProductEquivalence_productId_idx" ON "ProductEquivalence"("productId");

-- CreateIndex
CREATE INDEX "ProductEquivalence_equivProductId_idx" ON "ProductEquivalence"("equivProductId");

-- CreateIndex
CREATE INDEX "ProductEquivalence_active_idx" ON "ProductEquivalence"("active");
