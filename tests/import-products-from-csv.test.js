import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { importProductsFromCsv } from "../scripts/data/import-products-from-csv.cjs";

const shouldRunPostgresSuite = process.env.RUN_POSTGRES_TESTS === "1";
const describeDb = shouldRunPostgresSuite ? describe : describe.skip;

const prisma = new PrismaClient();

const CSV_HEADER = "sku,name,type,description,brand,unitLabel,base_cost,price,category,subcategory,quantity,location,attributes,referenceCode,imageUrl";

function csvEscape(value) {
  const text = value === undefined || value === null ? "" : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function csvRow(values) {
  return values.map(csvEscape).join(",");
}

function csv(...rows) {
  return [CSV_HEADER, ...rows].join("\n");
}

function writeTempCsv(content) {
  const filePath = path.join(os.tmpdir(), `kan95-${crypto.randomUUID()}.csv`);
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

async function runImport(content, options = {}) {
  const filePath = writeTempCsv(content);
  try {
    return await importProductsFromCsv({
      filePath,
      dryRun: options.dryRun ?? false,
      prismaClient: prisma,
    });
  } finally {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // ignore temp file cleanup errors
    }
  }
}

async function resetDb() {
  await prisma.purchaseReceiptLine.deleteMany();
  await prisma.purchaseReceipt.deleteMany();
  await prisma.purchaseOrderLine.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.supplierProduct.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.salesInternalOrderPickTask.deleteMany();
  await prisma.salesInternalOrderPickList.deleteMany();
  await prisma.salesInternalOrderAssemblyConfig.deleteMany();
  await prisma.salesInternalOrderLine.deleteMany();
  await prisma.salesInternalOrder.deleteMany();
  await prisma.pickTask.deleteMany();
  await prisma.pickList.deleteMany();
  await prisma.assemblyWorkOrderLine.deleteMany();
  await prisma.assemblyWorkOrder.deleteMany();
  await prisma.assemblyConfiguration.deleteMany();
  await prisma.inventoryMovement.deleteMany();
  await prisma.productionOrderItem.deleteMany();
  await prisma.productionOrder.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.productTechnicalAttribute.deleteMany();
  await prisma.productEquivalence.deleteMany();
  await prisma.importLog.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.location.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
}

async function seedWarehouseWithLocations(codes) {
  const warehouse = await prisma.warehouse.create({
    data: {
      code: `WH-${crypto.randomUUID().slice(0, 8)}`,
      name: "Warehouse Test",
      isActive: true,
    },
  });

  for (const code of codes) {
    await prisma.location.create({
      data: {
        code,
        name: `Location ${code}`,
        zone: "A",
        usageType: "STORAGE",
        isActive: true,
        warehouseId: warehouse.id,
      },
    });
  }

  return warehouse;
}

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await resetDb();
  await prisma.$disconnect();
});

describeDb("KAN-95 import-products-from-csv", () => {
  it("succeeds in dry-run with the sample CSV", async () => {
    await seedWarehouseWithLocations(["A-12-04", "B-01-01", "C-03-02"]);

    const result = await importProductsFromCsv({
      filePath: path.join(process.cwd(), "data", "products.sample.csv"),
      dryRun: true,
      prismaClient: prisma,
    });

    expect(result).toMatchObject({
      rows: 3,
      skus: 3,
      dryRun: true,
    });
  });

  it("accepts unitLabel", async () => {
    const result = await runImport(
      csv(csvRow(["SKU-U1", "Producto Unit", "HOSE", "Desc", "Marca", "metro", "10", "20", "", "", "", "", "{}", "REF-U1", ""])),
    );

    expect(result).toMatchObject({ rows: 1, skus: 1, dryRun: false });

    const product = await prisma.product.findUnique({
      where: { sku: "SKU-U1" },
      select: { unitLabel: true },
    });

    expect(product?.unitLabel).toBe("metro");
  });

  it('fails on invalid quantity "10 pzas"', async () => {
    await expect(
      runImport(csv(csvRow(["SKU-Q1", "Producto Qty", "HOSE", "Desc", "Marca", "pieza", "10", "20", "", "", "10 pzas", "", "{}", "REF-Q1", ""]))),
    ).rejects.toThrow(/invalid quantity/i);
  });

  it("fails on negative quantity -1", async () => {
    await expect(
      runImport(csv(csvRow(["SKU-Q2", "Producto Qty", "HOSE", "Desc", "Marca", "pieza", "10", "20", "", "", "-1", "", "{}", "REF-Q2", ""]))),
    ).rejects.toThrow(/invalid quantity/i);
  });

  it('fails on invalid base_cost "$85"', async () => {
    await expect(
      runImport(csv(csvRow(["SKU-C1", "Producto Cost", "HOSE", "Desc", "Marca", "pieza", "$85", "20", "", "", "", "", "{}", "REF-C1", ""]))),
    ).rejects.toThrow(/invalid base_cost/i);
  });

  it('fails on invalid price "85 MXN"', async () => {
    await expect(
      runImport(csv(csvRow(["SKU-P1", "Producto Price", "HOSE", "Desc", "Marca", "pieza", "10", "85 MXN", "", "", "", "", "{}", "REF-P1", ""]))),
    ).rejects.toThrow(/invalid price/i);
  });

  it('fails on numeric value "1,200.50"', async () => {
    await expect(
      runImport(csv(csvRow(["SKU-N1", "Producto Num", "HOSE", "Desc", "Marca", "pieza", "1,200.50", "20", "", "", "", "", "{}", "REF-N1", ""]))),
    ).rejects.toThrow(/invalid base_cost/i);
  });

  it("fails on invalid attributes JSON", async () => {
    await expect(
      runImport(csv(csvRow(["SKU-A1", "Producto Attr", "HOSE", "Desc", "Marca", "pieza", "10", "20", "", "", "", "", "not-json", "REF-A1", ""]))),
    ).rejects.toThrow(/invalid attributes JSON/i);
  });

  it("fails on top-level array attributes", async () => {
    await expect(
      runImport(csv(csvRow(["SKU-A2", "Producto Attr", "HOSE", "Desc", "Marca", "pieza", "10", "20", "", "", "", "", "[]", "REF-A2", ""]))),
    ).rejects.toThrow(/attributes must be a JSON object/i);
  });

  it("fails on top-level string attributes", async () => {
    await expect(
      runImport(csv(csvRow(["SKU-A3", "Producto Attr", "HOSE", "Desc", "Marca", "pieza", "10", "20", "", "", "", "", '"hello"', "REF-A3", ""]))),
    ).rejects.toThrow(/attributes must be a JSON object/i);
  });

  it("fails on top-level null attributes", async () => {
    await expect(
      runImport(csv(csvRow(["SKU-A4", "Producto Attr", "HOSE", "Desc", "Marca", "pieza", "10", "20", "", "", "", "", "null", "REF-A4", ""]))),
    ).rejects.toThrow(/attributes must be a JSON object/i);
  });

  it("fails on duplicate referenceCode across different SKUs in the same CSV", async () => {
    await expect(
      runImport(
        csv(
          csvRow(["SKU-R1", "Producto 1", "HOSE", "Desc", "Marca", "pieza", "10", "20", "", "", "", "", "{}", "REF-DUP", ""]),
          csvRow(["SKU-R2", "Producto 2", "HOSE", "Desc", "Marca", "pieza", "10", "20", "", "", "", "", "{}", "REF-DUP", ""]),
        ),
      ),
    ).rejects.toThrow(/referenceCode .* already appears/i);
  });

  it("fails when the DB already owns the referenceCode", async () => {
    await prisma.product.create({
      data: {
        sku: "SKU-EXIST-REF",
        name: "Producto Existente",
        type: "HOSE",
        referenceCode: "REF-DB-1",
      },
    });

    await expect(
      runImport(csv(csvRow(["SKU-NEW-REF", "Producto Nuevo", "HOSE", "Desc", "Marca", "pieza", "10", "20", "", "", "", "", "{}", "REF-DB-1", ""]))),
    ).rejects.toThrow(/already belongs to sku SKU-EXIST-REF/i);
  });

  it("fails on unknown location when quantity > 0", async () => {
    await expect(
      runImport(csv(csvRow(["SKU-L1", "Producto Loc", "HOSE", "Desc", "Marca", "pieza", "10", "20", "", "", "5", "LOC-UNKNOWN", "{}", "REF-L1", ""]))),
    ).rejects.toThrow(/unknown location/i);
  });

  it("fails on missing location when quantity > 0", async () => {
    await expect(
      runImport(csv(csvRow(["SKU-L2", "Producto Loc", "HOSE", "Desc", "Marca", "pieza", "10", "20", "", "", "5", "", "{}", "REF-L2", ""]))),
    ).rejects.toThrow(/missing location/i);
  });

  it("defaults empty quantity to 0", async () => {
    const result = await runImport(
      csv(csvRow(["SKU-Q0", "Producto Qty 0", "HOSE", "Desc", "Marca", "pieza", "10", "20", "", "", "", "", "{}", "REF-Q0", ""])),
    );

    expect(result).toMatchObject({ rows: 1, skus: 1, dryRun: false });

    const product = await prisma.product.findUnique({
      where: { sku: "SKU-Q0" },
      select: { id: true, sku: true },
    });
    const inventoryCount = await prisma.inventory.count({
      where: { productId: product?.id ?? "" },
    });

    expect(product?.sku).toBe("SKU-Q0");
    expect(inventoryCount).toBe(0);
  });

  it("keeps base_cost null when empty", async () => {
    const result = await runImport(
      csv(csvRow(["SKU-B0", "Producto Base", "HOSE", "Desc", "Marca", "pieza", "", "20", "", "", "", "", "{}", "REF-B0", ""])),
    );

    expect(result).toMatchObject({ rows: 1, skus: 1 });

    const product = await prisma.product.findUnique({
      where: { sku: "SKU-B0" },
      select: { base_cost: true },
    });

    expect(product?.base_cost).toBeNull();
  });

  it("keeps price null when empty", async () => {
    const result = await runImport(
      csv(csvRow(["SKU-P0", "Producto Price", "HOSE", "Desc", "Marca", "pieza", "10", "", "", "", "", "", "{}", "REF-P0", ""])),
    );

    expect(result).toMatchObject({ rows: 1, skus: 1 });

    const product = await prisma.product.findUnique({
      where: { sku: "SKU-P0" },
      select: { price: true },
    });

    expect(product?.price).toBeNull();
  });

  it("succeeds with repeated SKU across multiple valid locations", async () => {
    await seedWarehouseWithLocations(["LOC-A", "LOC-B"]);

    const result = await runImport(
      csv(
        csvRow(["SKU-MULTI", "Producto Multi", "HOSE", "Desc", "Marca", "pieza", "10", "20", "", "", "3", "LOC-A", "{}", "REF-MULTI", ""]),
        csvRow(["SKU-MULTI", "Producto Multi", "HOSE", "Desc", "Marca", "pieza", "10", "20", "", "", "4", "LOC-B", "{}", "REF-MULTI", ""]),
      ),
    );

    expect(result).toMatchObject({ rows: 2, skus: 1 });

    const product = await prisma.product.findUnique({
      where: { sku: "SKU-MULTI" },
      select: { id: true },
    });

    const inventories = await prisma.inventory.findMany({
      where: { productId: product?.id },
      orderBy: { quantity: "asc" },
      select: { quantity: true },
    });

    expect(inventories.map((row) => row.quantity)).toEqual([3, 4]);
  });

  it("fails on repeated SKU with conflicting product-level fields", async () => {
    await seedWarehouseWithLocations(["LOC-A"]);

    await expect(
      runImport(
        csv(
          csvRow(["SKU-CONFLICT", "Producto Base", "HOSE", "Desc", "Marca", "pieza", "10", "20", "", "", "1", "LOC-A", "{}", "REF-CONFLICT", ""]),
          csvRow(["SKU-CONFLICT", "Producto Cambiado", "HOSE", "Desc", "Marca", "pieza", "10", "20", "", "", "1", "LOC-A", "{}", "REF-CONFLICT", ""]),
        ),
      ),
    ).rejects.toThrow(/conflicting name/i);
  });

  it("syncs valid attributes into productTechnicalAttribute", async () => {
    const result = await runImport(
      csv(csvRow(["SKU-ATTR", "Producto Attr", "HOSE", "Desc", "Marca", "pieza", "10", "20", "", "", "", "", '{"pressure_psi":3263,"inner_diameter":"1/4 in"}', "REF-ATTR", ""])),
    );

    expect(result).toMatchObject({ rows: 1, skus: 1 });

    const product = await prisma.product.findUnique({
      where: { sku: "SKU-ATTR" },
      select: { id: true },
    });

    const rows = await prisma.productTechnicalAttribute.findMany({
      where: { productId: product?.id },
      orderBy: [{ keyNormalized: "asc" }, { valueNormalized: "asc" }],
      select: { keyNormalized: true, valueNormalized: true },
    });

    expect(rows).toEqual([
      { keyNormalized: "inner_diameter", valueNormalized: "1/4 in" },
      { keyNormalized: "pressure_psi", valueNormalized: "3263" },
    ]);
  });

  it("keeps the web UI on the strict importer path without legacy bypass flags", async () => {
    const pageSource = fs.readFileSync(path.join(process.cwd(), "app", "(shell)", "catalog", "import", "page.tsx"), "utf8");
    const legacyWrapperSource = fs.readFileSync(path.join(process.cwd(), "scripts", "import-products-from-csv.cjs"), "utf8");

    expect(pageSource).toContain("../../../../scripts/data/import-products-from-csv.cjs");
    expect(pageSource).not.toContain("allow-raw-attributes");
    expect(pageSource).not.toContain("allow-create-locations");
    expect(pageSource).not.toContain("scripts/import-products-from-csv.cjs");
    expect(legacyWrapperSource).toContain("path.join(__dirname, 'data', 'import-products-from-csv.cjs')");
  });
});


