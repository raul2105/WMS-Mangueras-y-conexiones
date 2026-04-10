const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function normalizeTechnicalText(input) {
  return String(input ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function toAttributeValues(input) {
  if (input === null || input === undefined) return [];
  if (Array.isArray(input)) {
    return input.map((item) => String(item ?? '').trim()).filter(Boolean);
  }
  if (typeof input === 'object') return [];
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

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];

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

async function main() {
  const products = await prisma.product.findMany({
    select: { id: true, attributes: true },
  });

  let indexed = 0;
  let rowsInserted = 0;

  for (const product of products) {
    const rows = extractProductTechnicalAttributes(product.attributes);

    await prisma.productTechnicalAttribute.deleteMany({ where: { productId: product.id } });

    if (rows.length > 0) {
      await prisma.productTechnicalAttribute.createMany({
        data: rows.map((row) => ({
          productId: product.id,
          key: row.key,
          keyNormalized: row.keyNormalized,
          value: row.value,
          valueNormalized: row.valueNormalized,
        })),
      });
      rowsInserted += rows.length;
    }

    indexed += 1;
  }

  console.log(`[reindex] Products processed: ${indexed}`);
  console.log(`[reindex] Attribute rows inserted: ${rowsInserted}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
