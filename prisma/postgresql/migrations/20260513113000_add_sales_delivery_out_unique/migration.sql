WITH "ranked_delivery_out" AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "documentId", "documentLineId"
      ORDER BY "createdAt" ASC, id ASC
    ) AS row_num
  FROM "InventoryMovement"
  WHERE "type" = 'OUT'
    AND "documentType" = 'SALES_INTERNAL_ORDER_DELIVERY'
    AND "documentId" IS NOT NULL
    AND "documentLineId" IS NOT NULL
)
DELETE FROM "InventoryMovement"
WHERE id IN (
  SELECT id
  FROM "ranked_delivery_out"
  WHERE row_num > 1
);

CREATE UNIQUE INDEX "InventoryMovement_sales_delivery_out_line_unique"
ON "InventoryMovement" ("documentId", "documentLineId")
WHERE "type" = 'OUT'
  AND "documentType" = 'SALES_INTERNAL_ORDER_DELIVERY'
  AND "documentId" IS NOT NULL
  AND "documentLineId" IS NOT NULL;
