-- Add optional supplier identity fields used by purchasing/import flows.
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "legalName" TEXT;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "businessName" TEXT;
