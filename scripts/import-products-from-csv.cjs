const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('csv-parse/sync');
const { PrismaClient } = require('@prisma/client');
const { InventoryService } = require('../lib/inventory-service');

const prisma = new PrismaClient();

function parseArgs(argv) {
  const args = { file: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file' || a === '-f') args.file = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function usage() {
  return [
    'Import products from a CSV file into Prisma (SQLite by default).',
    '',
    'Usage:',
    '  node scripts/import-products-from-csv.cjs --file data/products.csv',
    '  node scripts/import-products-from-csv.cjs -f data/products.csv --dry-run',
    '',
    'Expected columns (header row required):',
    '  sku,name,type,description,brand,base_cost,price,category,quantity,location,attributes,referenceCode,imageUrl',
    '',
    'Notes:',
    '  - type must be: HOSE | FITTING | ASSEMBLY | ACCESSORY',
    '  - attributes may be JSON (e.g. {"pressure_psi":3263,"inner_diameter":"1/4\""})',
    '  - referenceCode can be used for scanning/labeling (optional)',
    '  - imageUrl stores a reference image URL (optional)',
    '  - If the same sku appears multiple times, inventory is aggregated by location.',
    '  - Import is idempotent: products upsert by sku; inventory is replaced per sku.',
  ].join('\n');
}

function normalizeHeaderKey(key) {
  const k = String(key ?? '').trim();
  if (/^reference[_\s-]?code$/i.test(k)) return 'referencecode';
  if (/^image[_\s-]?url$/i.test(k)) return 'imageurl';
  return k.toLowerCase();
}

function toNumberOrNull(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  // Allow commas as decimal separators (common in ES locale) if there is no dot.
  const normalized = s.includes('.') ? s : s.replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function toStringOrNull(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function parseAttributes(attributesValue) {
  const s = toStringOrNull(attributesValue);
  if (!s) return null;
  try {
    const parsed = JSON.parse(s);
    return JSON.stringify(parsed);
  } catch {
    // If it isn't valid JSON, store as a raw string JSON.
    return JSON.stringify({ raw: s });
  }
}

function asProductType(typeValue) {
  const t = String(typeValue ?? '').trim().toUpperCase();
  if (!t) return null;
  const allowed = new Set(['HOSE', 'FITTING', 'ASSEMBLY', 'ACCESSORY']);
  return allowed.has(t) ? t : null;
}

async function importProductsFromCsv({ filePath, dryRun, prismaClient }) {
  const csvPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found: ${csvPath}`);
  }

  const raw = fs.readFileSync(csvPath);
  // Strip UTF-8 BOM if present
  const text = raw.toString('utf8').replace(/^\uFEFF/, '');

  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
    relax_column_count: true,
  });

  if (!Array.isArray(records) || records.length === 0) {
    console.log('No records found in CSV.');
    return;
  }

  // Normalize keys (support different casing)
  const normalizedRows = records.map((row) => {
    const out = {};
    for (const [k, v] of Object.entries(row)) out[normalizeHeaderKey(k)] = v;
    return out;
  });

  const errors = [];
  const bySku = new Map();

  for (let idx = 0; idx < normalizedRows.length; idx++) {
    const row = normalizedRows[idx];
    const line = idx + 2; // header is line 1

    const sku = toStringOrNull(row.sku);
    const name = toStringOrNull(row.name);
    const type = asProductType(row.type);

    if (!sku) errors.push(`Line ${line}: missing sku`);
    if (!name) errors.push(`Line ${line}: missing name`);
    if (!type) errors.push(`Line ${line}: invalid type (must be HOSE|FITTING|ASSEMBLY|ACCESSORY)`);
    if (!sku || !name || !type) continue;

    const base_cost = toNumberOrNull(row.base_cost);
    const price = toNumberOrNull(row.price);
    const quantity = toNumberOrNull(row.quantity) ?? 0;

    const productData = {
      sku,
      name,
      description: toStringOrNull(row.description),
      type,
      brand: toStringOrNull(row.brand),
      referenceCode: toStringOrNull(row.referencecode),
      imageUrl: toStringOrNull(row.imageurl),
      base_cost,
      price,
      category: toStringOrNull(row.category),
      attributes: parseAttributes(row.attributes),
    };

    const location = toStringOrNull(row.location);

    const existing = bySku.get(sku);
    if (!existing) {
      bySku.set(sku, {
        productData,
        inventoryByLocation: new Map(),
      });
    } else {
      // If repeated sku, keep the first productData but sanity-check conflicts.
      const prev = existing.productData;
      const fieldsToCheck = ['name', 'type', 'brand', 'category'];
      for (const f of fieldsToCheck) {
        if (productData[f] && prev[f] && productData[f] !== prev[f]) {
          errors.push(`Line ${line}: sku ${sku} has conflicting ${f} (${prev[f]} vs ${productData[f]})`);
        }
      }
    }

    const bucket = bySku.get(sku);
    const locKey = location ?? '__NO_LOCATION__';
    bucket.inventoryByLocation.set(locKey, (bucket.inventoryByLocation.get(locKey) ?? 0) + quantity);
  }

  if (errors.length) {
    console.error('CSV validation failed:');
    for (const e of errors.slice(0, 50)) console.error(`- ${e}`);
    if (errors.length > 50) console.error(`- ...and ${errors.length - 50} more`);
    process.exit(1);
  }

  const skus = Array.from(bySku.keys());
  console.log(`Parsed ${normalizedRows.length} CSV rows -> ${skus.length} unique SKUs.`);

  if (dryRun) {
    console.log('Dry run enabled; no DB writes performed.');
    return;
  }

  const prismaToUse = prismaClient ?? prisma;
  const service = new InventoryService(prismaToUse);

  let upsertedProducts = 0;
  let createdCategories = 0;
  let inventoryRowsUpdated = 0;

  const defaultWarehouse = await prismaToUse.warehouse.upsert({
    where: { code: 'DEFAULT' },
    create: {
      code: 'DEFAULT',
      name: 'Default Warehouse',
      description: 'Auto-created for CSV imports',
      isActive: true,
    },
    update: {},
  });

  const stagingLocation = await prismaToUse.location.upsert({
    where: { code: 'STAGING-DEFAULT' },
    create: {
      code: 'STAGING-DEFAULT',
      name: 'Staging - DEFAULT',
      zone: 'STAGING',
      isActive: true,
      warehouseId: defaultWarehouse.id,
    },
    update: {},
  });

  async function resolveLocationId(locationCode) {
    if (!locationCode) return stagingLocation.id;

    const existing = await prismaToUse.location.findUnique({
      where: { code: locationCode },
      select: { id: true },
    });

    if (existing) return existing.id;

    const created = await prismaToUse.location.create({
      data: {
        code: locationCode,
        name: `Ubicacion ${locationCode}`,
        zone: 'DEFAULT',
        isActive: true,
        warehouseId: defaultWarehouse.id,
      },
      select: { id: true },
    });

    return created.id;
  }

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

    if (category && category.createdAt.getTime() === category.updatedAt.getTime()) {
      // Not a reliable signal of creation, but harmless; keep as a best-effort counter.
      createdCategories++;
    }

    const product = await prismaToUse.product.upsert({
      where: { sku: productData.sku },
      create: {
        sku: productData.sku,
        referenceCode: productData.referenceCode,
        imageUrl: productData.imageUrl,
        name: productData.name,
        description: productData.description,
        type: productData.type,
        brand: productData.brand,
        base_cost: productData.base_cost,
        price: productData.price,
        attributes: productData.attributes,
        ...(category ? { category: { connect: { id: category.id } } } : {}),
      },
      update: {
        name: productData.name,
        description: productData.description,
        type: productData.type,
        brand: productData.brand,
        referenceCode: productData.referenceCode,
        imageUrl: productData.imageUrl,
        base_cost: productData.base_cost,
        price: productData.price,
        attributes: productData.attributes,
        ...(category ? { category: { connect: { id: category.id } } } : { categoryId: null }),
      },
      select: { id: true },
    });

    const existingInventory = await prismaToUse.inventory.findMany({
      where: { productId: product.id },
      select: { id: true, locationId: true, quantity: true, reserved: true },
    });
    const existingByLocation = new Map(existingInventory.map((row) => [row.locationId, row]));

    const desiredByLocation = new Map();
    for (const [locKey, qty] of inventoryByLocation.entries()) {
      const locationCode = locKey === '__NO_LOCATION__' ? null : locKey;
      const locationId = await resolveLocationId(locationCode);
      desiredByLocation.set(locationId, (desiredByLocation.get(locationId) ?? 0) + qty);
    }

    for (const [locationId, desiredQty] of desiredByLocation.entries()) {
      const existing = existingByLocation.get(locationId);
      const currentQty = existing?.quantity ?? 0;
      const delta = desiredQty - currentQty;
      if (delta !== 0) {
        await service.adjustStock(product.id, locationId, delta, 'Import CSV');
        inventoryRowsUpdated++;
      }
      existingByLocation.delete(locationId);
    }

    for (const leftover of existingByLocation.values()) {
      if (leftover.quantity !== 0) {
        await service.adjustStock(product.id, leftover.locationId, -leftover.quantity, 'Import CSV cleanup');
        inventoryRowsUpdated++;
      }
    }

    upsertedProducts++;
  }

  console.log(`Imported: ${upsertedProducts} products; ${inventoryRowsUpdated} inventory adjustments.`);
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
