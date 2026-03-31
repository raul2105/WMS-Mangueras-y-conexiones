import prisma from "@/lib/prisma";

type EquivalentInventoryRow = {
  quantity: number;
  available: number;
  location: {
    code: string;
    name: string;
    warehouse: {
      id: string;
      code: string;
      name: string;
    };
  };
};

export type ProductEquivalentSuggestion = {
  equivalenceId: string;
  productId: string;
  sku: string;
  referenceCode: string | null;
  name: string;
  brand: string | null;
  categoryName: string | null;
  basisNorm: string | null;
  basisDash: number | null;
  sourceSheet: string | null;
  notes: string | null;
  totalAvailable: number;
  locations: Array<{
    code: string;
    warehouseCode: string;
    available: number;
  }>;
};

function sumAvailable(rows: EquivalentInventoryRow[], warehouseId?: string) {
  return rows.reduce((acc, row) => {
    if (warehouseId && row.location.warehouse.id !== warehouseId) return acc;
    return acc + (typeof row.available === "number" ? row.available : 0);
  }, 0);
}

function toSortedLocations(rows: EquivalentInventoryRow[], warehouseId?: string) {
  return rows
    .filter((row) => !warehouseId || row.location.warehouse.id === warehouseId)
    .filter((row) => (typeof row.available === "number" ? row.available : 0) > 0)
    .sort((a, b) => {
      const warehouseDiff = warehouseId
        ? Number(b.location.warehouse.id === warehouseId) - Number(a.location.warehouse.id === warehouseId)
        : 0;
      if (warehouseDiff !== 0) return warehouseDiff;
      return b.available - a.available;
    })
    .map((row) => ({
      code: row.location.code,
      warehouseCode: row.location.warehouse.code,
      available: row.available,
    }));
}

export async function getEquivalentProducts(
  productId: string,
  options: { warehouseId?: string; limit?: number; inStockOnly?: boolean } = {}
): Promise<ProductEquivalentSuggestion[]> {
  const limit = options.limit ?? 5;
  const inStockOnly = options.inStockOnly ?? true;

  const rows = await prisma.productEquivalence.findMany({
    where: {
      productId,
      active: true,
      ...(inStockOnly
        ? {
            equivProduct: {
              inventory: {
                some: {
                  available: { gt: 0 },
                  ...(options.warehouseId ? { location: { warehouseId: options.warehouseId } } : {}),
                },
              },
            },
          }
        : {}),
    },
    select: {
      id: true,
      basisNorm: true,
      basisDash: true,
      sourceSheet: true,
      notes: true,
      equivProduct: {
        select: {
          id: true,
          sku: true,
          referenceCode: true,
          name: true,
          brand: true,
          category: { select: { name: true } },
          inventory: {
            where: inStockOnly
              ? {
                  available: { gt: 0 },
                  ...(options.warehouseId ? { location: { warehouseId: options.warehouseId } } : {}),
                }
              : options.warehouseId
                ? { location: { warehouseId: options.warehouseId } }
                : undefined,
            select: {
              quantity: true,
              available: true,
              location: {
                select: {
                  code: true,
                  name: true,
                  warehouse: { select: { id: true, code: true, name: true } },
                },
              },
            },
          },
        },
      },
    },
    take: Math.max(limit * 3, limit),
  });

  return rows
    .map((row) => {
      const inventoryRows = row.equivProduct.inventory as EquivalentInventoryRow[];
      const totalAvailable = sumAvailable(inventoryRows, options.warehouseId);

      return {
        equivalenceId: row.id,
        productId: row.equivProduct.id,
        sku: row.equivProduct.sku,
        referenceCode: row.equivProduct.referenceCode,
        name: row.equivProduct.name,
        brand: row.equivProduct.brand,
        categoryName: row.equivProduct.category?.name ?? null,
        basisNorm: row.basisNorm ?? null,
        basisDash: row.basisDash ?? null,
        sourceSheet: row.sourceSheet ?? null,
        notes: row.notes ?? null,
        totalAvailable,
        locations: toSortedLocations(inventoryRows, options.warehouseId),
      };
    })
    .filter((row) => !inStockOnly || row.totalAvailable > 0)
    .sort((a, b) => {
      if (b.totalAvailable !== a.totalAvailable) return b.totalAvailable - a.totalAvailable;
      return a.sku.localeCompare(b.sku, "es");
    })
    .slice(0, limit);
}

export function formatEquivalentSuggestion(
  product: { sku: string; brand: string | null },
  equivalent: ProductEquivalentSuggestion
) {
  const bestLocation = equivalent.locations[0];
  const locationText = bestLocation
    ? `${bestLocation.available} unidades en ${bestLocation.code}`
    : `${equivalent.totalAvailable} unidades disponibles`;

  return `Sin stock suficiente de ${product.sku}${product.brand ? ` (${product.brand})` : ""}. Equivalente disponible: ${equivalent.sku}${equivalent.brand ? ` (${equivalent.brand})` : ""} - ${locationText}.`;
}
