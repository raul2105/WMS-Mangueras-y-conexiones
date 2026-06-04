const fs = require("node:fs");
const path = require("node:path");
const { parse } = require("csv-parse/sync");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function parseArgs(argv) {
  const args = { file: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--file" || a === "-f") args.file = argv[++i];
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--help" || a === "-h") args.help = true;
  }
  return args;
}

function usage() {
  return [
    "Import products from a CSV file into Prisma (strict validation).",
    "",
    "Usage:",
    "  node scripts/data/import-products-from-csv.cjs --file data/products.csv",
    "  node scripts/data/import-products-from-csv.cjs -f data/products.csv --dry-run",
    "",
    "Expected columns (header row required):",
    "  sku,name,type,description,brand,unitLabel,base_cost,price,category,subcategory,quantity,location,attributes,referenceCode,imageUrl",
    "",
    "Notes:",
    "  - type must be: HOSE | FITTING | ASSEMBLY | ACCESSORY",
    "  - attr_* columns are mapped into the internal attributes object (e.g. attr_pressure_psi, attr_inner_diameter)",
    "  - attributes must be a JSON object when provided, and cannot be mixed with attr_* columns",
    "  - referenceCode can be used for scanning/labeling (optional)",
    "  - imageUrl stores a reference image URL (optional)",
    "  - Import is idempotent: products upsert by sku; inventory is replaced per sku.",
  ].join("\n");
}

function normalizeHeaderKey(key) {
  const k = String(key ?? "").trim();
  if (/^reference[_\s-]?code$/i.test(k)) return "referencecode";
  if (/^image[_\s-]?url$/i.test(k)) return "imageurl";
  return k.toLowerCase();
}

function parseNonNegativeNumber(value, line, field, { required = false } = {}) {
  if (value === undefined || value === null) {
    if (required) throw new Error(`Line ${line}: missing ${field}`);
    return null;
  }

  const s = String(value).trim();
  if (!s) {
    if (required) throw new Error(`Line ${line}: missing ${field}`);
    return null;
  }

  if (!/^[0-9]+(\.[0-9]+)?$/.test(s)) {
    throw new Error(`Line ${line}: invalid ${field} "${value}" (must be a finite non-negative number)`);
  }

  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Line ${line}: invalid ${field} "${value}" (must be a finite non-negative number)`);
  }

  return n;
}

function parseNullableNonNegativeNumber(value, line, field) {
  return parseNonNegativeNumber(value, line, field, { required: false });
}

function parseRequiredNonNegativeNumber(value, line, field) {
  return parseNonNegativeNumber(value, line, field, { required: true });
}

function parseQuantityNumber(value, line) {
  if (value === undefined || value === null) return 0;
  const s = String(value).trim();
  if (!s) return 0;
  return parseRequiredNonNegativeNumber(value, line, "quantity");
}

function toStringOrNull(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function parseAttributes(attributesValue, line) {
  const s = toStringOrNull(attributesValue);
  if (!s) return null;

  let parsed;
  try {
    parsed = JSON.parse(s);
  } catch {
    throw new Error(`Line ${line}: invalid attributes JSON`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Line ${line}: attributes must be a JSON object`);
  }

  return JSON.stringify(parsed);
}

function parseFlatAttributeValue(attrKey, value) {
  const s = toStringOrNull(value);
  if (!s) return null;

  if (attrKey === "components") {
    const parts = s
      .split(/[|;]/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (parts.length > 1) return parts;
    return parts.length === 1 ? [parts[0]] : null;
  }

  if (/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(s)) {
    return Number(s);
  }

  return s;
}

function buildAttributesPayload(row, line) {
  const legacyRaw = toStringOrNull(row.attributes);
  const flatAttributes = {};
  let hasFlatAttributes = false;

  for (const [key, value] of Object.entries(row)) {
    if (!key.startsWith("attr_")) continue;
    const attrKey = key.slice(5).trim();
    if (!attrKey) continue;

    const parsedValue = parseFlatAttributeValue(attrKey, value);
    if (parsedValue === null || parsedValue === undefined) continue;

    flatAttributes[attrKey] = parsedValue;
    hasFlatAttributes = true;
  }

  if (legacyRaw && hasFlatAttributes) {
    throw new Error(`Line ${line}: use either attributes JSON or attr_* columns, not both`);
  }

  if (hasFlatAttributes) {
    return JSON.stringify(flatAttributes);
  }

  return parseAttributes(row.attributes, line);
}

function normalizeTechnicalText(input) {
  return String(input ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function toAttributeValues(input) {
  if (input === null || input === undefined) return [];
  if (Array.isArray(input)) {
    return input.map((item) => String(item ?? "").trim()).filter(Boolean);
  }
  if (typeof input === "object") return [];
  const normalized = String(input).trim();
  return normalized ? [normalized] : [];
}

function extractProductTechnicalAttributes(attributesRaw) {
  if (!attributesRaw) return [];

  let parsed;
  try {
    parsed = JSON.parse(attributesRaw);
  } catch {
    return [];
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];

  const rows = [];
  const dedupe = new Set();

  for (const [rawKey, rawValue] of Object.entries(parsed)) {
    const key = String(rawKey).trim();
    const keyNormalized = normalizeTechnicalText(key);
    if (!key || !keyNormalized) continue;

    const values = toAttributeValues(rawValue);
    values.forEach((value) => {
      const valueNormalized = normalizeTechnicalText(value);
      if (!valueNormalized) return;

      const id = `${keyNormalized}::${valueNormalized}`;
      if (dedupe.has(id)) return;
      dedupe.add(id);

      rows.push({ key, keyNormalized, value, valueNormalized });
    });
  }

  return rows;
}

async function syncProductTechnicalAttributes(prismaToUse, productId, attributesRaw) {
  const rows = extractProductTechnicalAttributes(attributesRaw);

  try {
    await prismaToUse.productTechnicalAttribute.deleteMany({ where: { productId } });

    if (rows.length > 0) {
      await prismaToUse.productTechnicalAttribute.createMany({
        data: rows.map((row) => ({
          productId,
          key: row.key,
          keyNormalized: row.keyNormalized,
          value: row.value,
          valueNormalized: row.valueNormalized,
        })),
      });
    }
  } catch (error) {
    if (error && typeof error === "object" && error.code === "P2021") {
      return;
    }
    throw error;
  }
}

function asProductType(typeValue) {
  const t = String(typeValue ?? "").trim().toUpperCase();
  if (!t) return null;
  const allowed = new Set(["HOSE", "FITTING", "ASSEMBLY", "ACCESSORY"]);
  return allowed.has(t) ? t : null;
}

async function adjustInventoryWithMovement(prismaToUse, { productId, locationId, delta, reason }) {
  if (!Number.isFinite(delta) || delta === 0) return;

  await prismaToUse.$transaction(async (tx) => {
    const existing = await tx.inventory.findUnique({
      where: { productId_locationId: { productId, locationId } },
      select: { id: true, quantity: true, reserved: true, available: true },
    });

    if (!existing && delta < 0) {
      throw new Error(`Cannot reduce non-existing inventory for product ${productId} at ${locationId}`);
    }

    const currentQty = existing?.quantity ?? 0;
    const reserved = existing?.reserved ?? 0;
    const nextQty = currentQty + delta;
    if (nextQty < 0) {
      throw new Error(`Negative stock detected for product ${productId} at ${locationId}`);
    }
    if (nextQty < reserved) {
      throw new Error(`Reserved exceeds resulting stock for product ${productId} at ${locationId}`);
    }

    const nextAvailable = nextQty - reserved;
    if (existing) {
      await tx.inventory.update({
        where: { id: existing.id },
        data: { quantity: nextQty, available: nextAvailable },
      });
    } else {
      await tx.inventory.create({
        data: {
          productId,
          locationId,
          quantity: nextQty,
          reserved: 0,
          available: nextAvailable,
        },
      });
    }

    await tx.inventoryMovement.create({
      data: {
        productId,
        locationId,
        type: "ADJUSTMENT",
        operatorName: "csv-import",
        quantity: delta,
        reference: "CSV_IMPORT",
        notes: reason,
        documentType: "CSV_IMPORT",
      },
    });

    try {
      await tx.auditLog.create({
        data: {
          entityType: "INVENTORY",
          entityId: `${productId}:${locationId}`,
          action: "IMPORT_CSV_ADJUST",
          before: JSON.stringify({
            quantity: currentQty,
            reserved,
            available: existing?.available ?? currentQty - reserved,
          }),
          after: JSON.stringify({
            quantity: nextQty,
            reserved,
            available: nextAvailable,
          }),
          actor: "csv-import",
          source: "scripts/data/import-products-from-csv.cjs",
        },
      });
    } catch {
      // Keep import flow resilient if audit table is unavailable.
    }
  });
}

async function importProductsFromCsv({ filePath, dryRun, prismaClient }) {
  const prismaToUse = prismaClient ?? prisma;
  const csvPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found: ${csvPath}`);
  }

  const raw = fs.readFileSync(csvPath);
  const text = raw.toString("utf8").replace(/^\uFEFF/, "");
  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
    relax_column_count: true,
  });

  if (!Array.isArray(records) || records.length === 0) {
    console.log("No records found in CSV.");
    return;
  }

  const normalizedRows = records.map((row) => {
    const out = {};
    for (const [k, v] of Object.entries(row)) out[normalizeHeaderKey(k)] = v;
    return out;
  });

  const errors = [];
  const bySku = new Map();
  const referenceCodeToSku = new Map();
  const locationIdCache = new Map();

  async function resolveLocationId(locationCode, line) {
    if (!locationCode) return null;

    if (locationIdCache.has(locationCode)) {
      return locationIdCache.get(locationCode);
    }

    const existing = await prismaToUse.location.findUnique({
      where: { code: locationCode },
      select: { id: true },
    });

    if (!existing) {
      errors.push(`Line ${line}: unknown location "${locationCode}"`);
      return null;
    }

    locationIdCache.set(locationCode, existing.id);
    return existing.id;
  }

  for (let idx = 0; idx < normalizedRows.length; idx++) {
    const row = normalizedRows[idx];
    const line = idx + 2;

    const sku = toStringOrNull(row.sku);
    const name = toStringOrNull(row.name);
    const type = asProductType(row.type);

    if (!sku) errors.push(`Line ${line}: missing sku`);
    if (!name) errors.push(`Line ${line}: missing name`);
    if (!type) errors.push(`Line ${line}: invalid type (must be HOSE|FITTING|ASSEMBLY|ACCESSORY)`);
    if (!sku || !name || !type) continue;

    let base_cost;
    let price;
    let quantity;
    let attributes;
    try {
      base_cost = parseNullableNonNegativeNumber(row.base_cost, line, "base_cost");
      price = parseNullableNonNegativeNumber(row.price, line, "price");
      quantity = parseQuantityNumber(row.quantity, line);
      attributes = buildAttributesPayload(row, line);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `Line ${line}: invalid row`);
      continue;
    }

    const productData = {
      sku,
      name,
      description: toStringOrNull(row.description),
      type,
      brand: toStringOrNull(row.brand),
      unitLabel: toStringOrNull(row.unitlabel) ?? "unidad",
      referenceCode: toStringOrNull(row.referencecode),
      imageUrl: toStringOrNull(row.imageurl),
      base_cost,
      price,
      category: toStringOrNull(row.category),
      subcategory: toStringOrNull(row.subcategory),
      attributes,
    };

    if (productData.referenceCode) {
      const previousSku = referenceCodeToSku.get(productData.referenceCode);
      if (previousSku && previousSku !== sku) {
        errors.push(`Line ${line}: referenceCode ${productData.referenceCode} already appears on sku ${previousSku}`);
      } else {
        referenceCodeToSku.set(productData.referenceCode, sku);
      }
    }

    const location = toStringOrNull(row.location);
    let locationId = null;
    if (location) {
      locationId = await resolveLocationId(location, line);
    } else if (quantity > 0) {
      errors.push(`Line ${line}: missing location (required when quantity > 0)`);
    }

    const existing = bySku.get(sku);
    if (!existing) {
      bySku.set(sku, {
        productData,
        inventoryByLocation: new Map(),
      });
    } else {
      const prev = existing.productData;
      const fieldsToCheck = [
        "name",
        "type",
        "description",
        "brand",
        "unitLabel",
        "base_cost",
        "price",
        "category",
        "subcategory",
        "referenceCode",
        "imageUrl",
      ];
      for (const f of fieldsToCheck) {
        if (productData[f] !== null && productData[f] !== undefined && prev[f] !== null && prev[f] !== undefined && productData[f] !== prev[f]) {
          errors.push(`Line ${line}: sku ${sku} has conflicting ${f} (${prev[f]} vs ${productData[f]})`);
        }
      }
    }

    if (locationId !== null) {
      const bucket = bySku.get(sku);
      bucket.inventoryByLocation.set(locationId, (bucket.inventoryByLocation.get(locationId) ?? 0) + quantity);
    }
  }

  if (errors.length) {
    console.error("CSV validation failed:");
    for (const e of errors.slice(0, 50)) console.error(`- ${e}`);
    if (errors.length > 50) console.error(`- ...and ${errors.length - 50} more`);
    const preview = errors.slice(0, 5).join("; ");
    const more = errors.length > 5 ? ` (+${errors.length - 5} más)` : "";
    throw new Error(`CSV validation failed: ${preview}${more}`);
  }

  for (const [referenceCode, sku] of referenceCodeToSku.entries()) {
    const existingProduct = await prismaToUse.product.findUnique({
      where: { referenceCode },
      select: { sku: true },
    });
    if (existingProduct && existingProduct.sku !== sku) {
      throw new Error(`referenceCode ${referenceCode} already belongs to sku ${existingProduct.sku}`);
    }
  }

  const skus = Array.from(bySku.keys());
  console.log(`Parsed ${normalizedRows.length} CSV rows -> ${skus.length} unique SKUs.`);

  if (dryRun) {
    console.log("Dry run enabled; no DB writes performed.");
    return {
      rows: normalizedRows.length,
      skus: skus.length,
      upsertedProducts: 0,
      inventoryRowsUpdated: 0,
      dryRun: true,
    };
  }

  let upsertedProducts = 0;
  let inventoryRowsUpdated = 0;
  let referenceCodeConflicts = 0;

  for (const sku of skus) {
    const { productData, inventoryByLocation } = bySku.get(sku);

    const categoryName = productData.category;
    const category = categoryName
      ? await prismaToUse.category.upsert({
          where: { name: categoryName },
          create: { name: categoryName },
          update: {},
        })
      : null;

    const safeReferenceCode = productData.referenceCode;

    const product = await prismaToUse.product.upsert({
      where: { sku: productData.sku },
      create: {
        sku: productData.sku,
        referenceCode: safeReferenceCode,
        imageUrl: productData.imageUrl,
        name: productData.name,
        description: productData.description,
        type: productData.type,
        brand: productData.brand,
        unitLabel: productData.unitLabel,
        base_cost: productData.base_cost,
        price: productData.price,
        attributes: productData.attributes,
        subcategory: productData.subcategory,
        ...(category ? { category: { connect: { id: category.id } } } : {}),
      },
      update: {
        name: productData.name,
        description: productData.description,
        type: productData.type,
        brand: productData.brand,
        unitLabel: productData.unitLabel,
        referenceCode: safeReferenceCode,
        imageUrl: productData.imageUrl,
        base_cost: productData.base_cost,
        price: productData.price,
        attributes: productData.attributes,
        subcategory: productData.subcategory,
        ...(category ? { category: { connect: { id: category.id } } } : { categoryId: null }),
      },
      select: { id: true },
    });

    await syncProductTechnicalAttributes(prismaToUse, product.id, productData.attributes);

    const existingInventory = await prismaToUse.inventory.findMany({
      where: { productId: product.id },
      select: { id: true, locationId: true, quantity: true, reserved: true },
    });
    const existingByLocation = new Map(existingInventory.map((row) => [row.locationId, row]));

    const desiredByLocation = new Map();
    for (const [locationId, qty] of inventoryByLocation.entries()) {
      desiredByLocation.set(locationId, (desiredByLocation.get(locationId) ?? 0) + qty);
    }

    for (const [locationId, desiredQty] of desiredByLocation.entries()) {
      const existing = existingByLocation.get(locationId);
      const currentQty = existing?.quantity ?? 0;
      const delta = desiredQty - currentQty;
      if (delta !== 0) {
        await adjustInventoryWithMovement(prismaToUse, {
          productId: product.id,
          locationId,
          delta,
          reason: "Import CSV",
        });
        inventoryRowsUpdated++;
      }
      existingByLocation.delete(locationId);
    }

    for (const leftover of existingByLocation.values()) {
      if (leftover.quantity !== 0) {
        await adjustInventoryWithMovement(prismaToUse, {
          productId: product.id,
          locationId: leftover.locationId,
          delta: -leftover.quantity,
          reason: "Import CSV cleanup",
        });
        inventoryRowsUpdated++;
      }
    }

    upsertedProducts++;
  }

  console.log(
    `Imported: ${upsertedProducts} products; ${inventoryRowsUpdated} inventory adjustments; ${referenceCodeConflicts} referenceCode conflicts handled.`,
  );
  return {
    rows: normalizedRows.length,
    skus: skus.length,
    upsertedProducts,
    inventoryRowsUpdated,
    referenceCodeConflicts,
    dryRun: false,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.file) {
    console.log(usage());
    process.exit(args.help ? 0 : 1);
  }

  await importProductsFromCsv({ filePath: args.file, dryRun: args.dryRun });
}

if (require.main === module) {
  main()
    .then(async () => {
      await prisma.$disconnect();
    })
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}

module.exports = { importProductsFromCsv };
