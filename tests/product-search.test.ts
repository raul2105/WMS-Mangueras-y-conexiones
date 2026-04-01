import { describe, expect, it, vi } from "vitest";
import {
  buildProductSearchWhere,
  rankProductSearchCandidates,
  searchProducts,
  type ProductSearchCandidate,
} from "../lib/product-search";

function makeCandidate(overrides: Partial<ProductSearchCandidate> = {}): ProductSearchCandidate {
  return {
    id: overrides.id ?? "product-1",
    sku: overrides.sku ?? "SKU-BASE-01",
    referenceCode: overrides.referenceCode ?? null,
    name: overrides.name ?? "Producto base",
    brand: overrides.brand ?? "Marca base",
    description: overrides.description ?? "Descripcion base",
    type: overrides.type ?? "FITTING",
    subcategory: overrides.subcategory ?? "Linea base",
    category: overrides.category ?? { name: "Categoria base" },
    inventory: overrides.inventory ?? [{ available: 5 }],
    technicalAttributes: overrides.technicalAttributes ?? [],
  };
}

describe("product-search", () => {
  it("buildProductSearchWhere incluye texto, type y filtro por almacen", () => {
    const where = buildProductSearchWhere("DN16", {
      type: "FITTING",
      warehouseId: "WH-ENS",
      requireAvailable: true,
    });

    expect(where).toMatchObject({
      AND: expect.arrayContaining([
        { type: "FITTING" },
        {
          inventory: {
            some: {
              available: { gt: 0 },
              location: {
                warehouseId: "WH-ENS",
                isActive: true,
                usageType: "STORAGE",
              },
            },
          },
        },
      ]),
    });

    expect(where).toMatchObject({
      AND: expect.arrayContaining([
        {
          OR: expect.arrayContaining([
            { sku: { contains: "DN16" } },
            { name: { contains: "DN16" } },
            {
              technicalAttributes: {
                some: {
                  OR: expect.arrayContaining([
                    { keyNormalized: { contains: "dn16" } },
                    { valueNormalized: { contains: "dn16" } },
                  ]),
                },
              },
            },
          ]),
        },
      ]),
    });
  });

  it("rankProductSearchCandidates encuentra coincidencias por sku, nombre y atributo tecnico", () => {
    const ranked = rankProductSearchCandidates(
      [
        makeCandidate({
          id: "sku-match",
          sku: "FIT-DN16-001",
          name: "Conector recto",
        }),
        makeCandidate({
          id: "name-match",
          sku: "FIT-NAME-001",
          name: "Conector DN16 inoxidable",
        }),
        makeCandidate({
          id: "attr-match",
          sku: "FIT-ATTR-001",
          name: "Conector hidraulico",
          technicalAttributes: [{ keyNormalized: "dn16", valueNormalized: "dn16" }],
        }),
      ],
      "DN16",
      {
        filterAvailable: true,
        requiredQty: 1,
        take: 8,
      }
    );

    expect(ranked.map((candidate) => candidate.id)).toEqual([
      "sku-match",
      "name-match",
      "attr-match",
    ]);
  });

  it("rankProductSearchCandidates exige suficiencia exacta usando el total disponible", () => {
    const ranked = rankProductSearchCandidates(
      [
        makeCandidate({
          id: "enough",
          sku: "HOSE-ENOUGH",
          name: "Manguera reforzada",
          type: "HOSE",
          inventory: [{ available: 2.5 }, { available: 3.5 }],
        }),
        makeCandidate({
          id: "short",
          sku: "HOSE-SHORT",
          name: "Manguera corta",
          type: "HOSE",
          inventory: [{ available: 5 }],
        }),
      ],
      "Manguera",
      {
        filterAvailable: true,
        requiredQty: 6,
        take: 8,
      }
    );

    expect(ranked.map((candidate) => candidate.id)).toEqual(["enough"]);
    expect(ranked[0]?.totalAvailable).toBe(6);
  });

  it("searchProducts prioriza relevancia textual y luego disponibilidad, y aplica filtros", async () => {
    const findMany = vi.fn().mockResolvedValue([
      makeCandidate({
        id: "tie-high",
        sku: "FIT-TIE-HIGH",
        name: "Conector operativo",
        inventory: [{ available: 10 }],
      }),
      makeCandidate({
        id: "tie-low",
        sku: "FIT-TIE-LOW",
        name: "Conector operativo",
        inventory: [{ available: 4 }],
      }),
      makeCandidate({
        id: "less-relevant",
        sku: "FIT-ALT-001",
        name: "Pieza auxiliar",
        description: "Compatible con conector operativo",
        subcategory: "Conector operativo auxiliar",
        inventory: [{ available: 25 }],
      }),
    ]);

    const results = await searchProducts(
      {
        product: {
          findMany,
        },
      },
      {
        query: "Conector operativo",
        type: "FITTING",
        warehouseId: "WH-ENS",
        requiredQty: 1,
        take: 4,
      }
    );

    expect(findMany).toHaveBeenCalledOnce();
    expect(findMany.mock.calls[0][0]).toMatchObject({
      where: {
        AND: expect.arrayContaining([
          { type: "FITTING" },
          {
            inventory: {
              some: {
                available: { gt: 0 },
                location: {
                  warehouseId: "WH-ENS",
                  isActive: true,
                  usageType: "STORAGE",
                },
              },
            },
          },
        ]),
      },
    });

    expect(results.map((candidate) => candidate.id)).toEqual([
      "tie-high",
      "tie-low",
      "less-relevant",
    ]);
  });
});
