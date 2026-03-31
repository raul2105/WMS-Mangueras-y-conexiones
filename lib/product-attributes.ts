type ProductAttributeDbClient = {
  productTechnicalAttribute: {
    deleteMany: (args: { where: { productId: string } }) => Promise<unknown>;
    createMany: (args: {
      data: Array<{
        productId: string;
        key: string;
        keyNormalized: string;
        value: string;
        valueNormalized: string;
      }>;
    }) => Promise<unknown>;
  };
};

type AttributeRow = {
  key: string;
  keyNormalized: string;
  value: string;
  valueNormalized: string;
};

export function normalizeTechnicalText(input: string) {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function toAttributeValues(input: unknown): string[] {
  if (input === null || input === undefined) return [];
  if (Array.isArray(input)) {
    return input
      .map((item) => (item === null || item === undefined ? "" : String(item).trim()))
      .filter(Boolean);
  }
  if (typeof input === "object") {
    return [];
  }

  const normalized = String(input).trim();
  return normalized ? [normalized] : [];
}

export function extractProductTechnicalAttributes(attributesRaw: string | null): AttributeRow[] {
  if (!attributesRaw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(attributesRaw);
  } catch {
    return [];
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];

  const uniqueRows = new Map<string, AttributeRow>();

  for (const [rawKey, rawValue] of Object.entries(parsed as Record<string, unknown>)) {
    const key = rawKey.trim();
    const keyNormalized = normalizeTechnicalText(key);
    if (!key || !keyNormalized) continue;

    const values = toAttributeValues(rawValue);
    values.forEach((value) => {
      const valueNormalized = normalizeTechnicalText(value);
      if (!valueNormalized) return;

      const dedupeKey = `${keyNormalized}::${valueNormalized}`;
      if (!uniqueRows.has(dedupeKey)) {
        uniqueRows.set(dedupeKey, {
          key,
          keyNormalized,
          value,
          valueNormalized,
        });
      }
    });
  }

  return Array.from(uniqueRows.values());
}

export async function syncProductTechnicalAttributes(
  db: ProductAttributeDbClient,
  productId: string,
  attributesRaw: string | null
) {
  const rows = extractProductTechnicalAttributes(attributesRaw);

  try {
    await db.productTechnicalAttribute.deleteMany({ where: { productId } });

    if (rows.length > 0) {
      await db.productTechnicalAttribute.createMany({
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
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2021"
    ) {
      return;
    }
    throw error;
  }
}
