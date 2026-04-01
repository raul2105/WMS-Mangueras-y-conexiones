import prisma from "@/lib/prisma";
import { getProductSearchSelection, searchProducts } from "@/lib/product-search";

export const dynamic = "force-dynamic";

function parsePositiveNumber(value: string | null) {
  if (!value) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = String(searchParams.get("q") ?? "").trim();
  const selectedId = String(searchParams.get("selectedId") ?? "").trim();
  const warehouseId = String(searchParams.get("warehouseId") ?? "").trim() || undefined;
  const productType = String(searchParams.get("type") ?? "").trim() || undefined;
  const requiredQty = parsePositiveNumber(searchParams.get("requiredQty"));
  const take = Math.min(Math.max(Math.trunc(parsePositiveNumber(searchParams.get("take")) ?? 8), 1), 20);

  const [results, selected] = await Promise.all([
    query
      ? searchProducts(prisma, {
          query,
          type: productType,
          warehouseId,
          requiredQty,
          take,
        })
      : Promise.resolve([]),
    selectedId
      ? getProductSearchSelection(prisma, selectedId, {
          type: productType,
          warehouseId,
        })
      : Promise.resolve(null),
  ]);

  return Response.json({
    results,
    selected,
  });
}
