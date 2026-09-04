import prisma from "@/lib/prisma";
import {
  compatibilityRuleSelect,
  evaluateCompatibilityRules,
  type CompatibilityRuleDecision,
  type CompatibilityRuleRecord,
} from "@/lib/catalog/compatibility";

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
  technicalStatus: CompatibilityRuleDecision;
  technicalReasonCode: string;
  technicalExplanation: string;
  technicalSources: string[];
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
  options: { warehouseId?: string; limit?: number; inStockOnly?: boolean; includeReviewRequired?: boolean } = {}
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

  const candidateIds = Array.from(new Set(rows.map((row) => row.equivProduct.id)));
  const rules = candidateIds.length > 0
    ? await prisma.productCompatibilityRule.findMany({
        where: {
          active: true,
          source: { status: "APPROVED" },
          OR: [
            { productId, compatibleProductId: { in: candidateIds } },
            { productId: { in: candidateIds }, compatibleProductId: productId },
          ],
        },
        select: compatibilityRuleSelect,
      })
    : [];

  return rows
    .map((row) => {
      const inventoryRows = row.equivProduct.inventory as EquivalentInventoryRow[];
      const totalAvailable = sumAvailable(inventoryRows, options.warehouseId);
      const candidateRules = (rules as CompatibilityRuleRecord[]).filter((rule) =>
        (rule.productId === productId && rule.compatibleProductId === row.equivProduct.id)
        || (rule.productId === row.equivProduct.id && rule.compatibleProductId === productId)
      );
      const technicalDecision = evaluateCompatibilityRules([productId, row.equivProduct.id], candidateRules);
      const technicalSources = Array.from(new Set(technicalDecision.matchedRules
        .map((rule) => rule.source?.documentRef)
        .filter((value): value is string => Boolean(value))));

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
        technicalStatus: technicalDecision.status,
        technicalReasonCode: technicalDecision.reasonCode,
        technicalExplanation: technicalDecision.explanation,
        technicalSources,
        totalAvailable,
        locations: toSortedLocations(inventoryRows, options.warehouseId),
      };
    })
    .filter((row) => !inStockOnly || row.totalAvailable > 0)
    .filter((row) => options.includeReviewRequired || row.technicalStatus === "APPROVED")
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
