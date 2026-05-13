CREATE UNIQUE INDEX "InventoryMovement_sales_delivery_out_line_unique"
ON "InventoryMovement" ("documentId", "documentLineId")
WHERE "type" = 'OUT'
  AND "documentType" = 'SALES_INTERNAL_ORDER_DELIVERY'
  AND "documentId" IS NOT NULL
  AND "documentLineId" IS NOT NULL;
