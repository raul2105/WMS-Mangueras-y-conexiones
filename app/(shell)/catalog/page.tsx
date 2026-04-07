import Link from "next/link";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import CatalogFilters from "@/components/CatalogFilters";
import ProductImage from "@/components/ProductImage";
import { normalizeTechnicalText } from "@/lib/product-attributes";
import { TAXONOMY_SUBCATEGORIES } from "@/lib/catalog-taxonomy";
import { PageHeader } from "@/components/ui/page-header";
import { buttonStyles } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { Table, TableRow, TableWrap, Td, Th } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

type FacetOption = {
    value: string;
    count: number;
};

function safeJsonParse(value: string | null) {
    if (!value) return undefined;
    try {
        return JSON.parse(value);
    } catch {
        return { raw: value };
    }
}

function sumStock(inventory: Array<{ quantity: number }>) {
    return inventory.reduce((acc, row) => acc + (typeof row.quantity === "number" ? row.quantity : 0), 0);
}

function toDisplayAttributeKey(key: string) {
    return key.replaceAll("_", " ");
}

function parsePositiveInt(value: string | undefined, fallback: number) {
    if (!value) return fallback;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildProductWhere(filters: {
    type?: string;
    q?: string;
    brand?: string;
    category?: string;
    subcategory?: string;
    attrKeyNormalized?: string;
    attrValueNormalized?: string;
}): Prisma.ProductWhereInput {
    const where: Prisma.ProductWhereInput = {};

    if (filters.type) {
        where.type = filters.type;
    }
    if (filters.brand) {
        where.brand = filters.brand;
    }
    if (filters.category) {
        where.category = { name: filters.category };
    }
    if (filters.subcategory) {
        where.subcategory = filters.subcategory;
    }
    if (filters.q) {
        const q = filters.q;
        where.OR = [
            { sku: { contains: q } },
            { name: { contains: q } },
            { description: { contains: q } },
            { referenceCode: { contains: q } },
            { brand: { contains: q } },
        ];
    }
    if (filters.attrKeyNormalized) {
        where.technicalAttributes = {
            some: {
                keyNormalized: filters.attrKeyNormalized,
                ...(filters.attrValueNormalized ? { valueNormalized: filters.attrValueNormalized } : {}),
            },
        };
    }

    return where;
}

interface PageProps {
    searchParams: Promise<{
        type?: string;
        q?: string;
        brand?: string;
        category?: string;
        subcategory?: string;
        attrKey?: string;
        attrValue?: string;
        page?: string;
    }>;
}

export default async function CatalogPage({ searchParams }: PageProps) {
    const params = await searchParams;
    const currentPage = parsePositiveInt(params.page, 1);

    const selectedType = params.type?.trim() || undefined;
    const selectedBrand = params.brand?.trim() || undefined;
    const selectedCategory = params.category?.trim() || undefined;
    const selectedSubcategory = params.subcategory?.trim() || undefined;
    const searchQuery = params.q?.trim() || undefined;
    const selectedAttrKey = params.attrKey?.trim() || undefined;
    const selectedAttrValue = params.attrValue?.trim() || undefined;
    const selectedAttrKeyNormalized = selectedAttrKey ? normalizeTechnicalText(selectedAttrKey) : undefined;
    const selectedAttrValueNormalized = selectedAttrValue ? normalizeTechnicalText(selectedAttrValue) : undefined;

    const where = buildProductWhere({
        type: selectedType,
        q: searchQuery,
        brand: selectedBrand,
        category: selectedCategory,
        subcategory: selectedSubcategory,
        attrKeyNormalized: selectedAttrKeyNormalized,
        attrValueNormalized: selectedAttrValueNormalized,
    });

    const whereBrandFacets = buildProductWhere({
        type: selectedType,
        q: searchQuery,
        category: selectedCategory,
        subcategory: selectedSubcategory,
        attrKeyNormalized: selectedAttrKeyNormalized,
        attrValueNormalized: selectedAttrValueNormalized,
    });
    const whereCategoryFacets = buildProductWhere({
        type: selectedType,
        q: searchQuery,
        brand: selectedBrand,
        subcategory: selectedSubcategory,
        attrKeyNormalized: selectedAttrKeyNormalized,
        attrValueNormalized: selectedAttrValueNormalized,
    });
    const whereAttributeFacets = buildProductWhere({
        type: selectedType,
        q: searchQuery,
        brand: selectedBrand,
        category: selectedCategory,
        subcategory: selectedSubcategory,
    });

    const [productCounts, brandGroups, categoryGroups, subcategoryGroups, attributeKeyGroups, attributeValueGroups] = await Promise.all([
        prisma.product.groupBy({
            by: ["type"],
            _count: { _all: true },
        }),
        prisma.product.groupBy({
            by: ["brand"],
            where: { ...whereBrandFacets, brand: { not: null } },
            _count: { id: true },
            orderBy: { _count: { id: "desc" } },
        }),
        prisma.product.groupBy({
            by: ["categoryId"],
            where: { ...whereCategoryFacets, categoryId: { not: null } },
            _count: { id: true },
            orderBy: { _count: { id: "desc" } },
        }),
        prisma.product.groupBy({
            by: ["subcategory"],
            where: { ...whereCategoryFacets, subcategory: { not: null } },
            _count: { id: true },
            orderBy: { _count: { id: "desc" } },
        }),
        prisma.productTechnicalAttribute.groupBy({
            by: ["key", "keyNormalized"],
            where: { product: whereAttributeFacets },
            _count: { id: true },
            orderBy: { _count: { id: "desc" } },
            take: 24,
        }),
        selectedAttrKeyNormalized
            ? prisma.productTechnicalAttribute.groupBy({
                by: ["value", "valueNormalized"],
                where: {
                    keyNormalized: selectedAttrKeyNormalized,
                    product: whereAttributeFacets,
                },
                _count: { id: true },
                orderBy: { _count: { id: "desc" } },
                take: 32,
            })
            : Promise.resolve([]),
    ]);

    const categoryIds = categoryGroups
        .map((group) => group.categoryId)
        .filter((value): value is string => typeof value === "string" && value.length > 0);

    const categoryRows = categoryIds.length > 0
        ? await prisma.category.findMany({
            where: { id: { in: categoryIds } },
            select: { id: true, name: true },
        })
        : [];
    const categoryById = new Map(categoryRows.map((row) => [row.id, row.name]));

    const brands: FacetOption[] = brandGroups
        .filter((group): group is typeof group & { brand: string } => typeof group.brand === "string" && group.brand.trim().length > 0)
        .map((group) => ({ value: group.brand, count: group._count.id }));
    const categories: FacetOption[] = categoryGroups
        .map((group) => {
            const name = group.categoryId ? categoryById.get(group.categoryId) : undefined;
            return name ? { value: name, count: group._count.id } : null;
        })
        .filter((item): item is FacetOption => Boolean(item));
    const subcategories: FacetOption[] = subcategoryGroups
        .filter((group): group is typeof group & { subcategory: string } => typeof group.subcategory === "string" && group.subcategory.trim().length > 0)
        .map((group) => ({ value: group.subcategory, count: group._count.id }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "es"));

    const attributeKeys: FacetOption[] = attributeKeyGroups
        .map((group) => ({ value: group.key, count: group._count.id }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "es"));
    const attributeValues: FacetOption[] = attributeValueGroups
        .map((group) => ({ value: group.value, count: group._count.id }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "es"));

    const [totalProducts, products] = await Promise.all([
        prisma.product.count({ where }),
        prisma.product.findMany({
            where,
            orderBy: { updatedAt: "desc" },
            skip: (currentPage - 1) * PAGE_SIZE,
            take: PAGE_SIZE,
            select: {
                id: true,
                sku: true,
                imageUrl: true,
                name: true,
                type: true,
                brand: true,
                subcategory: true,
                attributes: true,
                price: true,
                category: { select: { name: true } },
                inventory: { select: { quantity: true } },
            },
        }),
    ]);
    
    const counts: Record<string, number> = {
        total: 0,
        HOSE: 0,
        FITTING: 0,
        ASSEMBLY: 0,
        ACCESSORY: 0,
    };

    productCounts.forEach((group) => {
        counts[group.type] = group._count._all;
        counts.total += group._count._all;
    });

    const totalPages = Math.max(1, Math.ceil(totalProducts / PAGE_SIZE));

    const makePageHref = (page: number) => {
        const nextParams = new URLSearchParams();
        if (selectedType) nextParams.set("type", selectedType);
        if (searchQuery) nextParams.set("q", searchQuery);
        if (selectedBrand) nextParams.set("brand", selectedBrand);
        if (selectedCategory) nextParams.set("category", selectedCategory);
        if (selectedSubcategory) nextParams.set("subcategory", selectedSubcategory);
        if (selectedAttrKey) nextParams.set("attrKey", selectedAttrKey);
        if (selectedAttrValue) nextParams.set("attrValue", selectedAttrValue);
        if (page > 1) nextParams.set("page", String(page));

        const qs = nextParams.toString();
        return qs ? `/catalog?${qs}` : "/catalog";
    };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Catalogo Maestro"
        description="Gestion de mangueras, conexiones y ensambles."
        actions={
          <>
            <Link href="/catalog/import" className={buttonStyles({ variant: "secondary" })}>
              Importar CSV
            </Link>
            <Link href="/catalog/new" className={buttonStyles()}>
              Nuevo articulo
            </Link>
          </>
        }
      />

      <CatalogFilters
        counts={counts}
        brands={brands}
        categories={categories}
        subcategories={subcategories.length > 0 ? subcategories : TAXONOMY_SUBCATEGORIES.map((value) => ({ value, count: 0 }))}
        attributeKeys={attributeKeys}
        attributeValues={attributeValues}
      />

      <SectionCard
        title="Productos"
        description={
          <span className="text-xs text-[var(--text-muted)]">
            {totalProducts.toLocaleString("es-MX")} resultados • Pagina {Math.min(currentPage, totalPages)} de {totalPages}
          </span>
        }
      >
        <div className="space-y-4">
          {products.length === 0 ? (
            <EmptyState compact title="Sin resultados" description="No se encontraron productos con los filtros activos." />
          ) : (
            <>
              <div className="hidden md:block">
                <TableWrap striped>
                  <Table>
                    <thead>
                      <tr>
                        <Th>Articulo</Th>
                        <Th>Tipo</Th>
                        <Th>Marca</Th>
                        <Th>Categoria</Th>
                        <Th className="text-right">Stock</Th>
                        <Th className="text-right">Precio</Th>
                        <Th className="text-right">Accion</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((product) => {
                        const stock = sumStock(product.inventory);
                        return (
                          <TableRow key={product.id}>
                            <Td>
                              <div className="flex items-center gap-3">
                                <ProductImage sku={product.sku} imageUrl={product.imageUrl} name={product.name} size={48} className="shrink-0 rounded-md" />
                                <div className="min-w-0">
                                  <p className="truncate font-medium text-[var(--text-primary)]">{product.name}</p>
                                  <p className="truncate font-mono text-xs text-[var(--text-muted)]">{product.sku}</p>
                                </div>
                              </div>
                            </Td>
                            <Td>
                              <Badge variant="accent">{product.type}</Badge>
                            </Td>
                            <Td>{product.brand ?? "--"}</Td>
                            <Td>{product.category?.name ?? product.subcategory ?? "--"}</Td>
                            <Td className={`text-right font-semibold ${stock > 0 ? "text-emerald-500" : "text-red-500"}`}>{stock}</Td>
                            <Td className="text-right font-semibold text-[var(--text-primary)]">${product.price?.toFixed(2) ?? "--"}</Td>
                            <Td className="text-right">
                              <Link href={`/catalog/${product.id}`} className={buttonStyles({ variant: "ghost", size: "sm" })}>
                                Ver detalle
                              </Link>
                            </Td>
                          </TableRow>
                        );
                      })}
                    </tbody>
                  </Table>
                </TableWrap>
              </div>

              <div className="space-y-3 md:hidden">
                {products.map((product) => {
                  const stock = sumStock(product.inventory);
                  const attributes = safeJsonParse(product.attributes);
                  return (
                    <article key={product.id} className="surface rounded-lg p-3">
                      <div className="flex items-start gap-3">
                        <ProductImage sku={product.sku} imageUrl={product.imageUrl} name={product.name} size={64} className="shrink-0 rounded-md" />
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="truncate font-medium text-[var(--text-primary)]">{product.name}</p>
                          <p className="font-mono text-xs text-[var(--text-muted)]">{product.sku}</p>
                          <Badge variant="accent">{product.type}</Badge>
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                        <p className="text-[var(--text-muted)]">Marca: <span className="text-[var(--text-secondary)]">{product.brand ?? "--"}</span></p>
                        <p className="text-[var(--text-muted)]">Stock: <span className={stock > 0 ? "text-emerald-500" : "text-red-500"}>{stock}</span></p>
                      </div>
                      <div className="mt-2 space-y-1">
                        {attributes && typeof attributes === "object" && Object.entries(attributes).slice(0, 2).map(([key, val]) => (
                          <p key={key} className="truncate text-xs text-[var(--text-muted)]">
                            {toDisplayAttributeKey(key)}: <span className="text-[var(--text-secondary)]">{String(val)}</span>
                          </p>
                        ))}
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <p className="font-semibold text-[var(--text-primary)]">${product.price?.toFixed(2) ?? "--"}</p>
                        <Link href={`/catalog/${product.id}`} className={buttonStyles({ size: "sm" })}>
                          Ver detalle
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}

          {totalPages > 1 ? (
            <div className="flex items-center justify-between gap-2 border-t border-[var(--border-default)] pt-3">
              <Link
                href={makePageHref(Math.max(1, currentPage - 1))}
                className={buttonStyles({ variant: "secondary", size: "sm", className: currentPage <= 1 ? "pointer-events-none opacity-50" : "" })}
              >
                Anterior
              </Link>
              <span className="text-xs text-[var(--text-muted)]">
                {Math.min(currentPage, totalPages)} / {totalPages}
              </span>
              <Link
                href={makePageHref(Math.min(totalPages, currentPage + 1))}
                className={buttonStyles({ variant: "secondary", size: "sm", className: currentPage >= totalPages ? "pointer-events-none opacity-50" : "" })}
              >
                Siguiente
              </Link>
            </div>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}
