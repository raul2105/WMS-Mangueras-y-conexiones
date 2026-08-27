ALTER TABLE "AssemblyConfiguration"
  ADD COLUMN "workingPressureBar" DOUBLE PRECISION,
  ADD COLUMN "operatingTemperatureC" DOUBLE PRECISION,
  ADD COLUMN "medium" TEXT,
  ADD COLUMN "application" TEXT,
  ADD COLUMN "assemblyMethod" TEXT;

ALTER TABLE "SalesInternalOrderAssemblyConfig"
  ADD COLUMN "workingPressureBar" DOUBLE PRECISION,
  ADD COLUMN "operatingTemperatureC" DOUBLE PRECISION,
  ADD COLUMN "medium" TEXT,
  ADD COLUMN "application" TEXT,
  ADD COLUMN "assemblyMethod" TEXT;
