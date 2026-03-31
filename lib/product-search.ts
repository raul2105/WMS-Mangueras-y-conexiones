import { Prisma } from "@prisma/client";

export type ProductSearchCandidate = {
  id: string;
  sku: string;
  referenceCode: string | null;
  name: string;
  brand: string | null;
  description: string | null;
  type: string;
  subcategory: string | null;
  category?: { name: string } | null;
  inventory?: Array<{ quantity?: number | null; available?: number | null }>;
  technicalAttributes?: Array<{ keyNormalized: string; valueNormalized: string }>;
};

export function normalizeSearchText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function compactSearchText(value: string) {
  return normalizeSearchText(value).replace(/[^a-z0-9]/g, "");
}

export function sumInventoryQuantity(rows: Array<{ quantity?: number | null }>) {
  return rows.reduce((acc, row) => acc + (typeof row.quantity === "number" ? row.quantity : 0), 0);
}

export function sumInventoryAvailable(rows: Array<{ available?: number | null }>) {
  return rows.reduce((acc, row) => acc + (typeof row.available === "number" ? row.available : 0), 0);
}

export function buildProductSearchWhere(query: string): Prisma.ProductWhereInput {
  const normalized = normalizeSearchText(query);
  if (!normalized) return {};

  return {
    OR: [
      { sku: { contains: query } },
      { referenceCode: { contains: query } },
      { name: { contains: query } },
      { brand: { contains: query } },
      { description: { contains: query } },
      { subcategory: { contains: query } },
      { category: { name: { contains: query } } },
      {
        technicalAttributes: {
          some: {
            OR: [
              { keyNormalized: { contains: normalized } },
              { valueNormalized: { contains: normalized } },
            ],
          },
        },
      },
    ],
  };
}

export function scoreProductSearch(candidate: ProductSearchCandidate, query: string) {
  const normalized = normalizeSearchText(query);
  const compact = compactSearchText(query);
  if (!normalized) return 0;

  const sku = normalizeSearchText(candidate.sku);
  const referenceCode = normalizeSearchText(candidate.referenceCode ?? "");
  const name = normalizeSearchText(candidate.name);
  const brand = normalizeSearchText(candidate.brand ?? "");
  const description = normalizeSearchText(candidate.description ?? "");
  const type = normalizeSearchText(candidate.type);
  const subcategory = normalizeSearchText(candidate.subcategory ?? "");
  const category = normalizeSearchText(candidate.category?.name ?? "");
  const skuCompact = compactSearchText(candidate.sku);
  const referenceCompact = compactSearchText(candidate.referenceCode ?? "");
  const totalAvailable = sumInventoryAvailable(candidate.inventory ?? []);

  let score = 0;

  if (candidate.sku === query || candidate.referenceCode === query) score += 2000;
  if (skuCompact === compact || referenceCompact === compact) score += 1500;
  if (skuCompact.startsWith(compact) || referenceCompact.startsWith(compact)) score += 1000;
  if (sku.includes(normalized)) score += 700;
  if (referenceCode.includes(normalized)) score += 650;
  if (name.includes(normalized)) score += 300;
  if (brand.includes(normalized)) score += 180;
  if (subcategory.includes(normalized)) score += 140;
  if (category.includes(normalized)) score += 120;
  if (type.includes(normalized)) score += 80;
  if (description.includes(normalized)) score += 60;

  for (const attr of candidate.technicalAttributes ?? []) {
    if (attr.valueNormalized.includes(normalized)) score += 90;
    if (attr.keyNormalized.includes(normalized)) score += 40;
  }

  if (totalAvailable > 0) score += 25;

  return score;
}

export async function resolveProductInput(
  prisma: {
    product: {
      findMany: (args: Prisma.ProductFindManyArgs) => Promise<Array<any>>;
    };
  },
  query: string,
  options?: {
    minScore?: number;
    select?: Prisma.ProductSelect;
  }
) {
  const normalized = query.trim();
  if (!normalized) return { product: null, suggestions: [] as ProductSearchCandidate[] };

  const candidates = await prisma.product.findMany({
    where: buildProductSearchWhere(normalized),
    take: 20,
    ...(options?.select ? { select: options.select } : {
      select: {
        id: true,
        sku: true,
        referenceCode: true,
        name: true,
        brand: true,
        description: true,
        type: true,
        subcategory: true,
        category: { select: { name: true } },
        inventory: { select: { quantity: true, available: true } },
        technicalAttributes: { take: 16, select: { keyNormalized: true, valueNormalized: true } },
      },
    }),
  });

  const ranked = candidates
    .map((candidate) => ({
      ...candidate,
      score: scoreProductSearch(candidate, normalized),
      totalAvailable: sumInventoryAvailable(candidate.inventory ?? []),
    }))
    .filter((candidate) => candidate.score >= (options?.minScore ?? 120))
    .sort((a, b) => b.score - a.score || b.totalAvailable - a.totalAvailable || a.name.localeCompare(b.name, "es"));

  const exact = ranked.find((candidate) => candidate.sku === normalized || candidate.referenceCode === normalized) ?? null;
  if (exact) {
    return { product: exact, suggestions: ranked.slice(0, 8) };
  }

  const top = ranked[0];
  const second = ranked[1];
  const isConfident = top && (!second || top.score - second.score >= 300 || top.score >= 1600);

  return {
    product: isConfident ? top : null,
    suggestions: ranked.slice(0, 8),
  };
}
