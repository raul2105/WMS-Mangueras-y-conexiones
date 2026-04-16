import { describe, expect, it, vi } from "vitest";
import {
  buildProductSearchWhere,
  getProductSearchSelection,
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
    inventory: overrides.inventory ?? [{ quantity: 5, available: 5 }],
    technicalAttributes: overrides.technicalAttributes ?? [],
  };
}

describe("product-search", () => {
  it("buildProductSearchWhere incluye contains insensible a mayúsculas y filtro operativo por almacén", () => {
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
            { sku: { contains: "DN16", mode: "insensitive" } },
            { name: { contains: "DN16", mode: "insensitive" } },
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

  it("rankProductSearchCandidates encuentra coincidencias por sku, nombre y atributo técnico", () => {
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
          inventory: [{ quantity: 2.5, available: 2.5 }, { quantity: 3.5, available: 3.5 }],
        }),
        makeCandidate({
          id: "short",
          sku: "HOSE-SHORT",
          name: "Manguera corta",
          type: "HOSE",
          inventory: [{ quantity: 5, available: 5 }],
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

  it("searchProducts busca sku FIT con query minúscula usando contains insensible", async () => {
    const findMany = vi.fn().mockResolvedValue([
      makeCandidate({
        id: "fit-sku",
        sku: "FIT-JIC-04-04",
        name: "Conector JIC",
        inventory: [{ quantity: 10, available: 10 }],
      }),
    ]);

    const results = await searchProducts(
      {
        product: {
          findMany,
        },
      },
      {
        query: "fit",
        type: "FITTING",
        warehouseId: "WH-01",
        take: 5,
      }
    );

    expect(findMany).toHaveBeenCalledOnce();
    expect(findMany.mock.calls[0][0]).toMatchObject({
      where: {
        AND: expect.arrayContaining([
          { type: "FITTING" },
          {
            OR: expect.arrayContaining([
              { sku: { contains: "fit", mode: "insensitive" } },
              { referenceCode: { contains: "fit", mode: "insensitive" } },
            ]),
          },
          {
            inventory: {
              some: {
                available: { gt: 0 },
                location: {
                  warehouseId: "WH-01",
                  isActive: true,
                  usageType: "STORAGE",
                },
              },
            },
          },
        ]),
      },
      take: 120,
    });
    expect(results.map((candidate) => candidate.id)).toEqual(["fit-sku"]);
  });

  it("searchProducts amplía la ventana previa para queries largas y mantiene el filtro de tipo", async () => {
    const findMany = vi.fn().mockResolvedValue([
      makeCandidate({
        id: "hose-match",
        sku: "HOSE-DN16-001",
        name: "Manguera DN16 hidráulica",
        type: "HOSE",
        inventory: [{ quantity: 8, available: 8 }],
      }),
    ]);

    const results = await searchProducts(
      {
        product: {
          findMany,
        },
      },
      {
        query: "manguera dn16",
        type: "HOSE",
        warehouseId: "WH-01",
        requiredQty: 1,
        take: 4,
      }
    );

    expect(findMany).toHaveBeenCalledOnce();
    expect(findMany.mock.calls[0][0]).toMatchObject({
      where: {
        AND: expect.arrayContaining([
          { type: "HOSE" },
          {
            inventory: {
              some: {
                available: { gt: 0 },
                location: {
                  warehouseId: "WH-01",
                  isActive: true,
                  usageType: "STORAGE",
                },
              },
            },
          },
        ]),
      },
      take: 60,
    });
    expect(results[0]).toMatchObject({ id: "hose-match", totalAvailable: 8 });
  });

  it("getProductSearchSelection conserva la selección previa por selectedId", async () => {
    const findMany = vi.fn().mockResolvedValue([
      makeCandidate({
        id: "selected-product",
        sku: "FIT-SEL-001",
        name: "Conector seleccionado",
        type: "FITTING",
        inventory: [{ quantity: 6, available: 2 }],
      }),
    ]);

    const selected = await getProductSearchSelection(
      {
        product: {
          findMany,
        },
      },
      "selected-product",
      {
        type: "FITTING",
        warehouseId: "WH-01",
      }
    );

    expect(findMany).toHaveBeenCalledOnce();
    expect(selected).toMatchObject({
      id: "selected-product",
      totalAvailable: 2,
    });
  });
});
