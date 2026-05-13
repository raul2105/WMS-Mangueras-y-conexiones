ALTER TABLE "SalesInternalOrder"
ADD COLUMN "sourceMaterialRequestId" TEXT;

WITH parsed_requests AS (
  SELECT
    "id",
    substring("notes" from 'Creado desde solicitud móvil (.+)$') AS request_id
  FROM "SalesInternalOrder"
  WHERE "sourceMaterialRequestId" IS NULL
    AND "notes" LIKE 'Creado desde solicitud móvil %'
),
deduped_requests AS (
  SELECT
    "id",
    request_id,
    ROW_NUMBER() OVER (PARTITION BY request_id ORDER BY "id") AS row_num
  FROM parsed_requests
  WHERE request_id IS NOT NULL
    AND request_id <> ''
)
UPDATE "SalesInternalOrder" AS sales_order
SET "sourceMaterialRequestId" = deduped_requests.request_id
FROM deduped_requests
WHERE sales_order."id" = deduped_requests."id"
  AND deduped_requests.row_num = 1;

CREATE UNIQUE INDEX "SalesInternalOrder_sourceMaterialRequestId_key"
ON "SalesInternalOrder"("sourceMaterialRequestId");
