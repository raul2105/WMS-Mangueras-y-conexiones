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

export type ProductSearchMatch = ProductSearchCandidate & {
  score: number;
  totalAvailable: number;
};

type ProductTypeFilter = string | string[] | undefined;

type ProductSearchDb = {
  product: {
    findMany: (args: Prisma.ProductFindManyArgs) => Promise<ProductSearchCandidate[]>;
  };
};

type ProductSearchWhereOptions = {
  type?: ProductTypeFilter;
  warehouseId?: string;
  requireAvailable?: boolean;
};

type RankProductSearchOptions = {
  minScore?: number;
  take?: number;
  requiredQty?: number | null;
  filterAvailable?: boolean;
};

type SearchProductsOptions = {
  query: string;
  type?: ProductTypeFilter;
  warehouseId?: string;
  requiredQty?: number | null;
  take?: number;
  minScore?: number;
  offset?: number;
};

type ProductSelectionOptions = {
  type?: ProductTypeFilter;
  warehouseId?: string;
};

function normalizePositiveNumber(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

function normalizeProductTypes(value: ProductTypeFilter) {
  if (!value) return [] as string[];
  return (Array.isArray(value) ? value : [value]).map((item) => item.trim()).filter(Boolean);
}

function buildInventoryAvailabilityWhere(warehouseId: string): Prisma.InventoryWhereInput {
  return {
    available: { gt: 0 },
    location: {
      warehouseId,
      isActive: true,
      usageType: "STORAGE",
    },
  };
}

function buildInsensitiveContains(value: string): Prisma.StringFilter {
  return ({
    contains: value,
    mode: "insensitive",
  } as unknown) as Prisma.StringFilter;
}

function buildInventorySelect(warehouseId?: string) {
  if (!warehouseId) {
    return {
      select: {
        quantity: true,
        available: true,
      },
    };
  }

  return {
    where: buildInventoryAvailabilityWhere(warehouseId),
    select: {
      quantity: true,
      available: true,
    },
  };
}

function buildDefaultProductSearchSelect(warehouseId?: string) {
  return {
    id: true,
    sku: true,
    referenceCode: true,
    name: true,
    brand: true,
    description: true,
    type: true,
    subcategory: true,
    category: { select: { name: true } },
    inventory: buildInventorySelect(warehouseId),
    technicalAttributes: { take: 16, select: { keyNormalized: true, valueNormalized: true } },
  };
}

function buildTypeWhere(type: ProductTypeFilter): Prisma.ProductWhereInput | null {
  const types = normalizeProductTypes(type);
  if (types.length === 0) return null;
  if (types.length === 1) return { type: types[0] };
  return { type: { in: types } };
}

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

export function buildProductSearchWhere(query: string, options: ProductSearchWhereOptions = {}): Prisma.ProductWhereInput {
  const normalized = normalizeSearchText(query);
  const clauses: Prisma.ProductWhereInput[] = [];

  if (normalized) {
    clauses.push({
      OR: [
        { sku: buildInsensitiveContains(query) },
        { referenceCode: buildInsensitiveContains(query) },
        { name: buildInsensitiveContains(query) },
        { brand: buildInsensitiveContains(query) },
        { description: buildInsensitiveContains(query) },
        { subcategory: buildInsensitiveContains(query) },
        { category: { name: buildInsensitiveContains(query) } },
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
    });
  }

  const typeWhere = buildTypeWhere(options.type);
  if (typeWhere) {
    clauses.push(typeWhere);
  }

  if (options.warehouseId && options.requireAvailable) {
    clauses.push({
      inventory: {
        some: buildInventoryAvailabilityWhere(options.warehouseId),
      },
    });
  }

  if (clauses.length === 0) return {};
  if (clauses.length === 1) return clauses[0];
  return { AND: clauses };
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

export function rankProductSearchCandidates(
  candidates: ProductSearchCandidate[],
  query: string,
  options: RankProductSearchOptions = {}
) {
  const requiredQty = normalizePositiveNumber(options.requiredQty);
  const ranked = candidates
    .map((candidate) => ({
      ...candidate,
      score: scoreProductSearch(candidate, query),
      totalAvailable: sumInventoryAvailable(candidate.inventory ?? []),
    }))
    .filter((candidate) => candidate.score >= (options.minScore ?? 120))
    .filter((candidate) => {
      if (!options.filterAvailable) return true;
      if (requiredQty !== null) return candidate.totalAvailable >= requiredQty;
      return candidate.totalAvailable > 0;
    })
    .sort((a, b) => b.score - a.score || b.totalAvailable - a.totalAvailable || a.name.localeCompare(b.name, "es"));

  return ranked.slice(0, options.take ?? 8) as ProductSearchMatch[];
}

function getSearchCandidateWindow(query: string, take: number) {
  const queryLength = query.trim().length;
  if (queryLength <= 4) {
    return Math.max(take * 15, 120);
  }

  return Math.max(take * 8, 60);
}

function isPostgresqlRuntime() {
  const dbUrl = process.env.DATABASE_URL ?? "";
  return dbUrl.startsWith("postgres://") || dbUrl.startsWith("postgresql://");
}

function normalizeLikePattern(value: string) {
  return value
    .replace(/[%_\\]/g, "\\$&")
    .replace(/\s+/g, " ")
    .trim();
}

async function findPostgresCandidateIds(
  prisma: ProductSearchDb,
  query: string,
  options: {
    type?: ProductTypeFilter;
    warehouseId?: string;
    requireAvailable?: boolean;
    take: number;
  }
) {
  const db = prisma as unknown as { $queryRaw?: (...args: unknown[]) => Promise<unknown> };
  if (!db.$queryRaw) {
    return null;
  }

  const normalized = normalizeSearchText(query);
  const likeRaw = `%${normalizeLikePattern(query)}%`;
  const likeNormalized = `%${normalizeLikePattern(normalized)}%`;
  const types = normalizeProductTypes(options.type);
  const requireAvailable = Boolean(options.requireAvailable && options.warehouseId);
  const typeClause =
    types.length > 0 ? Prisma.sql`AND p.type IN (${Prisma.join(types)})` : Prisma.empty;
  const availabilityClause = requireAvailable
    ? Prisma.sql`
      AND EXISTS (
        SELECT 1
        FROM "Inventory" i
        JOIN "Location" l ON l.id = i."locationId"
        WHERE i."productId" = p.id
          AND i.available > 0
          AND l."warehouseId" = ${options.warehouseId ?? ""}
          AND l."isActive" = true
          AND l."usageType" = 'STORAGE'
      )
    `
    : Prisma.empty;

  try {
    const rows = (await db.$queryRaw(Prisma.sql`
      SELECT p.id
      FROM "Product" p
      LEFT JOIN "Category" c ON c.id = p."categoryId"
      WHERE (
        unaccent(lower(COALESCE(p.sku, ''))) LIKE unaccent(lower(${likeRaw})) ESCAPE '\\'
        OR unaccent(lower(COALESCE(p."referenceCode", ''))) LIKE unaccent(lower(${likeRaw})) ESCAPE '\\'
        OR unaccent(lower(COALESCE(p.name, ''))) LIKE unaccent(lower(${likeRaw})) ESCAPE '\\'
        OR unaccent(lower(COALESCE(p.brand, ''))) LIKE unaccent(lower(${likeRaw})) ESCAPE '\\'
        OR unaccent(lower(COALESCE(p.description, ''))) LIKE unaccent(lower(${likeRaw})) ESCAPE '\\'
        OR unaccent(lower(COALESCE(p.subcategory, ''))) LIKE unaccent(lower(${likeRaw})) ESCAPE '\\'
        OR unaccent(lower(COALESCE(c.name, ''))) LIKE unaccent(lower(${likeRaw})) ESCAPE '\\'
        OR EXISTS (
          SELECT 1
          FROM "ProductTechnicalAttribute" pta
          WHERE pta."productId" = p.id
            AND (
              pta."keyNormalized" LIKE ${likeNormalized} ESCAPE '\\'
              OR pta."valueNormalized" LIKE ${likeNormalized} ESCAPE '\\'
            )
        )
      )
      ${typeClause}
      ${availabilityClause}
      ORDER BY p.sku ASC
      LIMIT ${options.take}
    `)) as Array<{ id: string }>;

    return rows.map((row) => row.id);
  } catch {
    // If extensions (unaccent) are not available yet, fallback to Prisma filters.
    return null;
  }
}

export async function searchProducts(prisma: ProductSearchDb, options: SearchProductsOptions) {
  const query = options.query.trim();
  if (!query) return [] as ProductSearchMatch[];

  const take = Math.min(Math.max(options.take ?? 8, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);
  const rankedTake = Math.min(Math.max(take + offset, 1), 100);
  const candidateWindow = getSearchCandidateWindow(query, rankedTake);
  const where = buildProductSearchWhere(query, {
    type: options.type,
    warehouseId: options.warehouseId,
    requireAvailable: Boolean(options.warehouseId),
  });
  const select = buildDefaultProductSearchSelect(options.warehouseId);

  let candidates: ProductSearchCandidate[];
  if (isPostgresqlRuntime()) {
    const ids = await findPostgresCandidateIds(prisma, query, {
      type: options.type,
      warehouseId: options.warehouseId,
      requireAvailable: Boolean(options.warehouseId),
      take: candidateWindow,
    });

    if (ids && ids.length > 0) {
      candidates = await prisma.product.findMany({
        where: { id: { in: ids } },
        take: candidateWindow,
        orderBy: [{ sku: "asc" }],
        select,
      });
    } else if (ids) {
      candidates = [];
    } else {
      candidates = await prisma.product.findMany({
        where,
        orderBy: [{ sku: "asc" }],
        take: candidateWindow,
        select,
      });
    }
  } else {
    candidates = await prisma.product.findMany({
      where,
      orderBy: [{ sku: "asc" }],
      take: candidateWindow,
      select,
    });
  }

  const ranked = rankProductSearchCandidates(candidates, query, {
    minScore: options.minScore ?? 120,
    take: rankedTake,
    requiredQty: options.requiredQty,
    filterAvailable: Boolean(options.warehouseId),
  });

  return ranked.slice(offset, offset + take);
}

export async function getProductSearchSelection(
  prisma: ProductSearchDb,
  productId: string,
  options: ProductSelectionOptions = {}
) {
  const normalizedId = productId.trim();
  if (!normalizedId) return null;

  const where = buildTypeWhere(options.type);
  const [product] = await prisma.product.findMany({
    where: where ? { AND: [{ id: normalizedId }, where] } : { id: normalizedId },
    take: 1,
    select: buildDefaultProductSearchSelect(options.warehouseId),
  });

  if (!product) return null;

  return {
    ...product,
    score: 0,
    totalAvailable: sumInventoryAvailable(product.inventory ?? []),
  } as ProductSearchMatch;
}

export async function resolveProductInput(
  prisma: ProductSearchDb,
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
    ...(options?.select
      ? { select: options.select }
      : {
          select: buildDefaultProductSearchSelect(),
        }),
  });

  const ranked = rankProductSearchCandidates(candidates, normalized, {
    minScore: options?.minScore ?? 120,
    take: 8,
    filterAvailable: false,
  });

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
