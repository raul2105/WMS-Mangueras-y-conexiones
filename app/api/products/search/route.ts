import prisma from "@/lib/prisma";
import { getProductSearchSelection, searchProducts } from "@/lib/product-search";
import { requirePermission } from "@/lib/rbac";
import { startPerf } from "@/lib/perf";

export const dynamic = "force-dynamic";

function parsePositiveNumber(value: string | null) {
  if (!value) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric;
}

function parseCursor(value: string | null) {
  if (!value) return 0;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.trunc(numeric);
}

export async function GET(request: Request) {
  const perf = startPerf("api.products.search");
  await requirePermission("catalog.view");

  const { searchParams } = new URL(request.url);
  const query = String(searchParams.get("q") ?? "").trim();
  const selectedId = String(searchParams.get("selectedId") ?? "").trim();
  const warehouseId = String(searchParams.get("warehouseId") ?? "").trim() || undefined;
  const productType = String(searchParams.get("type") ?? "").trim() || undefined;
  const requiredQty = parsePositiveNumber(searchParams.get("requiredQty"));
  const take = Math.min(Math.max(Math.trunc(parsePositiveNumber(searchParams.get("take")) ?? 6), 1), 10);
  const cursor = parseCursor(searchParams.get("cursor"));
  const canSearch = query.length >= 3;
  const fetchTake = Math.min(100, take + cursor + 1);

  const [results, selected] = await Promise.all([
    canSearch
      ? searchProducts(prisma, {
          query,
          type: productType,
          warehouseId,
          requiredQty,
          take: fetchTake,
          minScore: 140,
        })
      : Promise.resolve([]),
    selectedId
      ? getProductSearchSelection(prisma, selectedId, {
          type: productType,
          warehouseId,
        })
      : Promise.resolve(null),
  ]);

  const pagedResults = canSearch ? results.slice(cursor, cursor + take) : [];
  const nextCursor = canSearch && results.length > cursor + take ? String(cursor + take) : null;

  perf.end({
    queryLength: query.length,
    canSearch,
    resultCount: pagedResults.length,
    nextCursor,
    hasSelected: Boolean(selected),
  });

  return Response.json({
    results: pagedResults,
    selected,
    nextCursor,
  });
}
