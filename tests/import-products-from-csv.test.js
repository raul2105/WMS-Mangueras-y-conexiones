import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { importProductsFromCsv } from "../scripts/data/import-products-from-csv.cjs";

const shouldRunPostgresSuite = process.env.RUN_POSTGRES_TESTS === "1";
const describeDb = shouldRunPostgresSuite ? describe : describe.skip;

const prisma = new PrismaClient();

const CSV_HEADER = "sku,name,type,description,brand,unitLabel,base_cost,price,category,subcategory,quantity,location,attributes,referenceCode,imageUrl";
const FLAT_ATTRIBUTES_HEADER = "sku,name,type,description,brand,unitLabel,base_cost,price,category,subcategory,quantity,location,attributes,attr_norm,attr_pressure_psi,attr_working_pressure_bar,attr_inner_diameter,attr_outer_diameter,attr_thread,attr_angle,attr_material,attr_length_mm,attr_components,referenceCode,imageUrl";

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

function csvWithHeader(header, ...rows) {
  return [header, ...rows].join("\n");
}

function csvFromObject(columns, record) {
  return csvRow(columns.map((column) => record[column] ?? ""));
}

function createMockPrisma(locationCodes = []) {
  const locationMap = new Map(locationCodes.map((code, index) => [code, `loc-${index + 1}`]));
  const state = {
    productUpserts: [],
    technicalAttributes: [],
  };

  const mock = {
    location: {
      findUnique: async ({ where }) => {
        const id = locationMap.get(where.code);
        return id ? { id } : null;
      },
    },
    product: {
      findUnique: async () => null,
      upsert: async (args) => {
        state.productUpserts.push(args);
        return { id: `product-${state.productUpserts.length}` };
      },
    },
    category: {
      upsert: async () => ({ id: "category-1" }),
    },
    inventory: {
      findMany: async () => [],
      findUnique: async () => null,
      update: async () => null,
      create: async () => null,
    },
    inventoryMovement: {
      create: async () => null,
    },
    productTechnicalAttribute: {
      deleteMany: async () => {},
      createMany: async ({ data }) => {
        state.technicalAttributes.push(...data);
      },
    },
    importLog: {
      create: async ({ data }) => ({ id: "import-log-1", ...data }),
    },
    auditLog: {
      create: async () => {},
    },
    $transaction: async (callback) => callback(mock),
  };

  return { mock, state };
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
      prismaClient: options.prismaClient ?? prisma,
      actor: options.actor,
      actorUserId: options.actorUserId,
      importLog: options.importLog,
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

if (shouldRunPostgresSuite) {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });
}

describe("KAN-97 flat attr_* columns", () => {
  const flatColumns = FLAT_ATTRIBUTES_HEADER.split(",");

  function technicalRows(state) {
    return state.technicalAttributes
      .map((row) => [row.keyNormalized, row.valueNormalized])
      .sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  }

  it("maps flat attr_* columns into attributes for a HOSE row", async () => {
    const { mock, state } = createMockPrisma();
    const result = await importProductsFromCsv({
      filePath: writeTempCsv(
        csvWithHeader(
          FLAT_ATTRIBUTES_HEADER,
          csvFromObject(flatColumns, {
            sku: "SKU-HOSE-FLAT",
            name: "Manguera Flat",
            type: "HOSE",
            description: "Desc",
            brand: "Marca",
            unitLabel: "metro",
            base_cost: "10",
            price: "20",
            quantity: "0",
            attributes: "",
            attr_norm: "R2AT",
            attr_pressure_psi: "5800",
            attr_inner_diameter: '1/4 in',
            attr_material: "Acero reforzado",
            referenceCode: "REF-HOSE-FLAT",
          }),
        ),
      ),
      dryRun: false,
      prismaClient: mock,
    });

    expect(result).toMatchObject({ rows: 1, skus: 1, dryRun: false });
    expect(JSON.parse(state.productUpserts[0]?.create.attributes ?? "null")).toEqual({
      norm: "R2AT",
      pressure_psi: 5800,
      inner_diameter: "1/4 in",
      material: "Acero reforzado",
    });
    expect(technicalRows(state)).toEqual([
      ["inner_diameter", "1/4 in"],
      ["material", "acero reforzado"],
      ["norm", "r2at"],
      ["pressure_psi", "5800"],
    ]);
  });

  it("maps flat attr_* columns into attributes for a FITTING row", async () => {
    const { mock, state } = createMockPrisma();
    const result = await importProductsFromCsv({
      filePath: writeTempCsv(
        csvWithHeader(
          FLAT_ATTRIBUTES_HEADER,
          csvFromObject(flatColumns, {
            sku: "SKU-FIT-FLAT",
            name: "Conexión Flat",
            type: "FITTING",
            description: "Desc",
            brand: "Marca",
            unitLabel: "pieza",
            base_cost: "11",
            price: "22",
            quantity: "0",
            attr_norm: "JIC-90",
            attr_thread: "JIC 37°",
            attr_angle: "90°",
            attr_material: "Acero al carbón",
            referenceCode: "REF-FIT-FLAT",
          }),
        ),
      ),
      dryRun: false,
      prismaClient: mock,
    });

    expect(result).toMatchObject({ rows: 1, skus: 1, dryRun: false });
    expect(JSON.parse(state.productUpserts[0]?.create.attributes ?? "null")).toEqual({
      norm: "JIC-90",
      thread: "JIC 37°",
      angle: "90°",
      material: "Acero al carbón",
    });
    expect(technicalRows(state)).toEqual([
      ["angle", "90°"],
      ["material", "acero al carbon"],
      ["norm", "jic-90"],
      ["thread", "jic 37°"],
    ]);
  });

  it("maps flat attr_* columns into attributes for an ASSEMBLY row", async () => {
    const { mock, state } = createMockPrisma();
    const result = await importProductsFromCsv({
      filePath: writeTempCsv(
        csvWithHeader(
          FLAT_ATTRIBUTES_HEADER,
          csvFromObject(flatColumns, {
            sku: "SKU-ASM-FLAT",
            name: "Ensamble Flat",
            type: "ASSEMBLY",
            description: "Desc",
            brand: "Marca",
            unitLabel: "kit",
            base_cost: "12",
            price: "24",
            quantity: "0",
            attr_norm: "ENS-3P",
            attr_length_mm: "1200",
            attr_components: "CON-R2AT-04|FIT-JIC-12-90|FIT-JIC-12-12",
            referenceCode: "REF-ASM-FLAT",
          }),
        ),
      ),
      dryRun: false,
      prismaClient: mock,
    });

    expect(result).toMatchObject({ rows: 1, skus: 1, dryRun: false });
    expect(JSON.parse(state.productUpserts[0]?.create.attributes ?? "null")).toEqual({
      norm: "ENS-3P",
      length_mm: 1200,
      components: ["CON-R2AT-04", "FIT-JIC-12-90", "FIT-JIC-12-12"],
    });
    expect(technicalRows(state)).toEqual([
      ["components", "con-r2at-04"],
      ["components", "fit-jic-12-12"],
      ["components", "fit-jic-12-90"],
      ["length_mm", "1200"],
      ["norm", "ens-3p"],
    ]);
  });

  it("ignores empty attr_* values", async () => {
    const { mock, state } = createMockPrisma();
    const result = await importProductsFromCsv({
      filePath: writeTempCsv(
        csvWithHeader(
          FLAT_ATTRIBUTES_HEADER,
          csvFromObject(flatColumns, {
            sku: "SKU-EMPTY-FLAT",
            name: "Producto Flat Vacío",
            type: "HOSE",
            description: "Desc",
            brand: "Marca",
            unitLabel: "metro",
            base_cost: "10",
            price: "20",
            quantity: "0",
            attr_norm: "",
            attr_pressure_psi: "5800",
            attr_inner_diameter: "",
            attr_material: "",
            referenceCode: "REF-EMPTY-FLAT",
          }),
        ),
      ),
      dryRun: false,
      prismaClient: mock,
    });

    expect(result).toMatchObject({ rows: 1, skus: 1, dryRun: false });
    expect(JSON.parse(state.productUpserts[0]?.create.attributes ?? "null")).toEqual({ pressure_psi: 5800 });
    expect(technicalRows(state)).toEqual([
      ["pressure_psi", "5800"],
    ]);
  });

  it("fails when legacy attributes JSON and attr_* columns are both populated", async () => {
    const { mock } = createMockPrisma();
    await expect(
      importProductsFromCsv({
        filePath: writeTempCsv(
          csvWithHeader(
            FLAT_ATTRIBUTES_HEADER,
            csvFromObject(flatColumns, {
              sku: "SKU-MIXED",
              name: "Producto Mixto",
              type: "HOSE",
              description: "Desc",
              brand: "Marca",
              unitLabel: "metro",
              base_cost: "10",
              price: "20",
              quantity: "0",
              attributes: '{"pressure_psi":3263}',
              attr_norm: "R2AT",
              referenceCode: "REF-MIXED",
            }),
          ),
        ),
        dryRun: false,
        prismaClient: mock,
      }),
    ).rejects.toThrow(/use either attributes JSON or attr_\* columns, not both/i);
  });

  it("validates the official sample CSV in dry-run with mocked locations", async () => {
    const { mock } = createMockPrisma(["A-12-04", "B-01-01"]);
    const result = await importProductsFromCsv({
      filePath: path.join(process.cwd(), "data", "products.sample.csv"),
      dryRun: true,
      prismaClient: mock,
    });

    expect(result).toMatchObject({
      rows: 3,
      skus: 3,
      dryRun: true,
    });
  });
});

describeDb("KAN-95 import-products-from-csv", () => {
  it("succeeds in dry-run with the sample CSV", async () => {
    await seedWarehouseWithLocations(["A-12-04", "B-01-01"]);
    const before = await Promise.all([
      prisma.product.count(),
      prisma.inventory.count(),
      prisma.inventoryMovement.count(),
      prisma.importLog.count(),
      prisma.auditLog.count(),
    ]);

    const result = await importProductsFromCsv({
      filePath: path.join(process.cwd(), "data", "products.sample.csv"),
      dryRun: true,
      prismaClient: prisma,
    });
    const after = await Promise.all([
      prisma.product.count(),
      prisma.inventory.count(),
      prisma.inventoryMovement.count(),
      prisma.importLog.count(),
      prisma.auditLog.count(),
    ]);

    expect(result).toMatchObject({
      rows: 3,
      skus: 3,
      dryRun: true,
    });
    expect(after).toEqual(before);
  });

  it("serves the official sample CSV route as text/csv", async () => {
    const routePath = path.join(process.cwd(), "app", "(shell)", "catalog", "import", "sample", "route.ts");
    const { GET } = await import(pathToFileURL(routePath).href);
    const response = await GET();
    const body = await response.text();
    const sampleFile = fs.readFileSync(path.join(process.cwd(), "data", "products.sample.csv"), "utf8");

    expect(response.headers.get("Content-Type")).toContain("text/csv");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="products.sample.csv"');
    expect(body).toBe(sampleFile);
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

  it("preserves inventory in locations omitted from a partial import", async () => {
    await seedWarehouseWithLocations(["LOC-A", "LOC-B"]);

    await runImport(csv(
      csvRow(["SKU-PARTIAL", "Producto Parcial", "HOSE", "Desc", "Marca", "pieza", "10", "20", "", "", "3", "LOC-A", "{}", "REF-PARTIAL", ""]),
      csvRow(["SKU-PARTIAL", "Producto Parcial", "HOSE", "Desc", "Marca", "pieza", "10", "20", "", "", "4", "LOC-B", "{}", "REF-PARTIAL", ""]),
    ));

    await runImport(csv(csvRow([
      "SKU-PARTIAL", "Producto Parcial", "HOSE", "Desc", "Marca", "pieza", "10", "20", "", "", "5", "LOC-A", "{}", "REF-PARTIAL", "",
    ])));

    const product = await prisma.product.findUnique({ where: { sku: "SKU-PARTIAL" }, select: { id: true } });
    const inventories = await prisma.inventory.findMany({
      where: { productId: product?.id },
      orderBy: { quantity: "asc" },
      select: { quantity: true },
    });

    expect(inventories.map((row) => row.quantity)).toEqual([4, 5]);
  });

  it("audits import writes with the authenticated actor and rolls back all writes when audit fails", async () => {
    const locationCode = `LOC-${crypto.randomUUID().slice(0, 8)}`;
    await seedWarehouseWithLocations([locationCode]);
    const actor = await prisma.user.create({
      data: {
        email: `qa-import-${crypto.randomUUID()}@example.invalid`,
        name: "Operador importación QA",
        passwordHash: "unused-test-hash",
      },
    });
    const actorName = `qa-import-actor-${crypto.randomUUID().replaceAll("-", "")}`;
    const successfulFileName = `qa-import-${crypto.randomUUID()}.csv`;

    try {
      await runImport(
        csv(csvRow(["SKU-IMPORT-AUDIT", "Producto Audit", "HOSE", "Desc", "Marca", "pieza", "10", "20", "", "", "3", locationCode, "{}", "REF-IMPORT-AUDIT", ""])),
        {
          actor: actorName,
          actorUserId: actor.id,
          importLog: { fileName: successfulFileName, fileSize: 256 },
        },
      );

      const successfulAudits = await prisma.auditLog.findMany({
        where: { actorUserId: actor.id, entityType: { in: ["PRODUCT", "INVENTORY", "IMPORT_LOG"] } },
        select: { entityType: true, actor: true, source: true },
      });
      expect(new Set(successfulAudits.map((row) => row.entityType))).toEqual(new Set(["PRODUCT", "INVENTORY", "IMPORT_LOG"]));
      expect(successfulAudits.every((row) => row.actor === actorName && row.source)).toBe(true);
      expect(await prisma.importLog.findFirst({ where: { fileName: successfulFileName, status: "IMPORTED" } })).not.toBeNull();
      const importedProduct = await prisma.product.findUniqueOrThrow({ where: { sku: "SKU-IMPORT-AUDIT" }, select: { id: true } });
      expect(await prisma.inventoryMovement.findFirst({
        where: { productId: importedProduct.id, reference: "CSV_IMPORT" },
        select: { operatorName: true, operatorUserId: true },
      })).toEqual({ operatorName: actorName, operatorUserId: actor.id });

      const [{ schema }] = await prisma.$queryRaw`SELECT current_schema() AS schema`;
      if (!/^t_[a-zA-Z0-9_]+_f[0-9a-f]{16}$/.test(schema)) {
        throw new Error("CSV import audit fault injection requires an isolated AWS test schema");
      }
      const triggerName = `qa_import_${crypto.randomUUID().replaceAll("-", "")}`;
      await prisma.$executeRawUnsafe(
        `CREATE FUNCTION "${schema}"."${triggerName}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'QA import audit unavailable'; END; $$`,
      );
      try {
        await prisma.$executeRawUnsafe(
          `CREATE TRIGGER "${triggerName}" BEFORE INSERT ON "${schema}"."AuditLog" FOR EACH ROW WHEN (NEW."actor" = '${actorName}' AND NEW."entityType" = 'INVENTORY') EXECUTE FUNCTION "${schema}"."${triggerName}"()`,
        );
        const failedFileName = `qa-import-rollback-${crypto.randomUUID()}.csv`;
        await expect(
          runImport(
            csv(csvRow(["SKU-IMPORT-ROLLBACK", "Debe revertirse", "HOSE", "Desc", "Marca", "pieza", "10", "20", "", "", "4", locationCode, "{}", "REF-IMPORT-ROLLBACK", ""])),
            {
              actor: actorName,
              actorUserId: actor.id,
              importLog: { fileName: failedFileName, fileSize: 256 },
            },
          ),
        ).rejects.toThrow(/QA import audit unavailable/);
        expect(await prisma.product.findUnique({ where: { sku: "SKU-IMPORT-ROLLBACK" } })).toBeNull();
        expect(await prisma.inventory.count({ where: { product: { sku: "SKU-IMPORT-ROLLBACK" } } })).toBe(0);
        expect(await prisma.inventoryMovement.count({ where: { reference: "CSV_IMPORT", operatorName: actorName, quantity: 4 } })).toBe(0);
        expect(await prisma.importLog.count({ where: { fileName: failedFileName } })).toBe(0);
        expect(await prisma.auditLog.count({ where: { actorUserId: actor.id } })).toBe(successfulAudits.length);
      } finally {
        await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${triggerName}" ON "${schema}"."AuditLog"`);
        await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${schema}"."${triggerName}"()`);
      }
    } finally {
      await prisma.auditLog.deleteMany({ where: { actorUserId: actor.id } });
      await prisma.user.delete({ where: { id: actor.id } });
    }
  });

  it("aborts a CSV reconciliation when stock changes after its snapshot", async () => {
    const locationCode = `LOC-${crypto.randomUUID().slice(0, 8)}`;
    await seedWarehouseWithLocations([locationCode]);
    const location = await prisma.location.findUniqueOrThrow({ where: { code: locationCode }, select: { id: true } });
    const product = await prisma.product.create({
      data: { sku: "SKU-IMPORT-CAS", name: "Nombre original", type: "HOSE" },
    });
    const inventory = await prisma.inventory.create({
      data: { productId: product.id, locationId: location.id, quantity: 5, reserved: 0, available: 5 },
    });
    const actorName = `qa-import-cas-${crypto.randomUUID().replaceAll("-", "")}`;
    const fileName = `qa-import-cas-${crypto.randomUUID()}.csv`;
    let externalChangeApplied = false;

    const racingPrisma = new Proxy(prisma, {
      get(target, property) {
        if (property === "$transaction") {
          return (callback, options) => target.$transaction((tx) => callback(new Proxy(tx, {
            get(transaction, transactionProperty) {
              if (transactionProperty === "inventory") {
                const inventoryDelegate = transaction.inventory;
                return new Proxy(inventoryDelegate, {
                  get(delegate, method) {
                    if (method === "findUnique") {
                      return async (args) => {
                        const snapshot = await delegate.findUnique(args);
                        if (!externalChangeApplied) {
                          externalChangeApplied = true;
                          await prisma.inventory.update({
                            where: { id: inventory.id },
                            data: { quantity: 6, available: 6 },
                          });
                        }
                        return snapshot;
                      };
                    }
                    const value = Reflect.get(delegate, method, delegate);
                    return typeof value === "function" ? value.bind(delegate) : value;
                  },
                });
              }
              const value = Reflect.get(transaction, transactionProperty, transaction);
              return typeof value === "function" ? value.bind(transaction) : value;
            },
          })), options);
        }
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });

    await expect(
      runImport(
        csv(csvRow(["SKU-IMPORT-CAS", "Nombre importado", "HOSE", "Desc", "Marca", "pieza", "10", "20", "", "", "8", locationCode, "{}", "REF-IMPORT-CAS", ""])),
        {
          prismaClient: racingPrisma,
          actor: actorName,
          importLog: { fileName, fileSize: 256 },
        },
      ),
    ).rejects.toThrow(/changed concurrently/i);

    expect(externalChangeApplied).toBe(true);
    expect(await prisma.product.findUniqueOrThrow({ where: { id: product.id }, select: { name: true } })).toEqual({ name: "Nombre original" });
    expect(await prisma.inventory.findUniqueOrThrow({ where: { id: inventory.id }, select: { quantity: true, available: true } })).toEqual({ quantity: 6, available: 6 });
    expect(await prisma.inventoryMovement.count({ where: { productId: product.id, reference: "CSV_IMPORT" } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { actor: actorName } })).toBe(0);
    expect(await prisma.importLog.count({ where: { fileName } })).toBe(0);
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


