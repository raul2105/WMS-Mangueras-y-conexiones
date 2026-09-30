-- Preserve the exact approved equivalence/rule context selected when a sales line is created.
-- Existing lines remain null; no historical context is inferred.
ALTER TABLE "SalesInternalOrderLine"
ADD COLUMN "technicalSelectionSnapshot" TEXT;
