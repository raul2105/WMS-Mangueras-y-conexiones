import Link from "next/link";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import CatalogFilters from "@/components/CatalogFilters";
import ProductImage from "@/components/ProductImage";
import { normalizeTechnicalText } from "@/lib/product-attributes";
import { TAXONOMY_SUBCATEGORIES } from "@/lib/catalog-taxonomy";

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
        <div className="space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                        Catálogo Maestro
                    </h1>
                    <p className="text-slate-400 mt-1">Gestión de Mangueras, Conexiones y Ensambles</p>
                </div>
                <div className="flex gap-3">
                    <Link href="/catalog/import" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">
                        Importar CSV
                    </Link>
                    <Link href="/catalog/new" className="btn-primary">
                        + Nuevo Artículo
                    </Link>
                </div>
            </div>

            {/* Stats/Quick Filters */}
            <CatalogFilters
                counts={counts}
                brands={brands}
                categories={categories}
                subcategories={subcategories.length > 0 ? subcategories : TAXONOMY_SUBCATEGORIES.map((value) => ({ value, count: 0 }))}
                attributeKeys={attributeKeys}
                attributeValues={attributeValues}
            />

            <div className="flex items-center justify-between text-sm text-slate-400">
                <span>{totalProducts.toLocaleString("es-MX")} productos encontrados</span>
                <span>Página {Math.min(currentPage, totalPages)} de {totalPages}</span>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {products.map((product) => {
                    const stock = sumStock(product.inventory);
                    const attributes = safeJsonParse(product.attributes);

                    return (
                    <div key={product.id} className="glass-card group relative">
                        <div className="absolute top-4 right-4">
                            <span className={`px-2 py-1 rounded text-xs font-bold
${product.type === 'HOSE' ? 'bg-blue-500/20 text-blue-400' :
                                product.type === 'FITTING' ? 'bg-orange-500/20 text-orange-400' :
                                    'bg-purple-500/20 text-purple-400'}`}>
                                {product.type}
                            </span>
                        </div>

                        {/* Miniatura del producto */}
                        <div className="flex items-start gap-3 pr-12">
                            <ProductImage
                                sku={product.sku}
                                imageUrl={product.imageUrl}
                                name={product.name}
                                size={72}
                                className="flex-shrink-0 rounded-md"
                            />
                            <div className="min-w-0">
                                <h3 className="text-lg font-bold text-white group-hover:text-cyan-400 transition-colors leading-tight">
                                    {product.name}
                                </h3>
                                <p className="text-sm text-slate-400 font-mono mt-1">{product.sku}</p>
                            </div>
                        </div>

                        <div className="mt-4 space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-500">Marca</span>
                                <span className="text-slate-300">{product.brand}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-500">Categoría</span>
                                <span className="text-slate-300 text-right">{product.category?.name ?? "--"}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-500">Subcategoría</span>
                                <span className="text-slate-300 text-right">{product.subcategory ?? "--"}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-500">Stock</span>
                                <span className={`${(stock || 0) > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {stock} un.
                                </span>
                            </div>
                        </div>

                        {/* Technical Specs Preview */}
                        <div className="mt-4 p-3 bg-black/20 rounded-lg space-y-1">
                            {attributes && typeof attributes === "object" && Object.entries(attributes).slice(0, 3).map(([key, val]) => (
                                <div key={key} className="flex justify-between text-xs">
                                    <span className="text-slate-500 capitalize">{toDisplayAttributeKey(key)}</span>
                                    <span className="text-slate-300 truncate max-w-[50%]">{String(val)}</span>
                                </div>
                            ))}
                        </div>

                        <div className="mt-6 flex items-center justify-between">
                            <span className="text-xl font-bold text-white">${product.price?.toFixed(2)}</span>
                            <Link href={`/catalog/${product.id}`} className="text-sm text-cyan-400 hover:text-cyan-300 hover:underline">
                                Ver Detalle →
                            </Link>
                        </div>
                    </div>
                    );
                })}
            </div>

            {products.length === 0 && (
                <div className="glass-card text-center text-slate-300 py-8">
                    No se encontraron productos con esos filtros.
                </div>
            )}

            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-2">
                    <Link
                        href={makePageHref(Math.max(1, currentPage - 1))}
                        className={`px-3 py-2 glass rounded-lg ${currentPage <= 1 ? "pointer-events-none opacity-50" : "hover:text-white"}`}
                    >
                        ← Anterior
                    </Link>
                    <span className="px-3 py-2 text-slate-400 text-sm">
                        {Math.min(currentPage, totalPages)} / {totalPages}
                    </span>
                    <Link
                        href={makePageHref(Math.min(totalPages, currentPage + 1))}
                        className={`px-3 py-2 glass rounded-lg ${currentPage >= totalPages ? "pointer-events-none opacity-50" : "hover:text-white"}`}
                    >
                        Siguiente →
                    </Link>
                </div>
            )}
        </div>
    );
}
