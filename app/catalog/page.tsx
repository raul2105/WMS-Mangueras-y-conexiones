import Link from "next/link";
import prisma from "@/lib/prisma";
import CatalogFilters from "@/components/CatalogFilters";

export const dynamic = "force-dynamic";

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

interface PageProps {
    searchParams: Promise<{ type?: string }>;
}

export default async function CatalogPage({ searchParams }: PageProps) {
    const params = await searchParams;
    const typeFilter = params.type;

    // Run queries in parallel for better performance
    const [products, productCounts] = await Promise.all([
        prisma.product.findMany({
            where: typeFilter ? { type: typeFilter } : undefined,
            orderBy: { updatedAt: "desc" },
            include: {
                category: true,
                inventory: true,
            },
        }),
        prisma.product.groupBy({
            by: ['type'],
            _count: { type: true },
        }),
    ]);
    
    const counts: Record<string, number> = {
        total: 0,
        HOSE: 0,
        FITTING: 0,
        ASSEMBLY: 0,
    };
    
    productCounts.forEach((group) => {
        counts[group.type] = group._count.type;
        counts.total += group._count.type;
    });

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
                    <Link href="/catalog/new" className="btn-primary">
                        + Nuevo Artículo
                    </Link>
                </div>
            </div>

            {/* Stats/Quick Filters */}
            <CatalogFilters counts={counts} />

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

                        <h3 className="text-lg font-bold text-white group-hover:text-cyan-400 transition-colors pr-12">
                            {product.name}
                        </h3>
                        <p className="text-sm text-slate-400 font-mono mt-1">{product.sku}</p>

                        <div className="mt-4 space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-500">Marca</span>
                                <span className="text-slate-300">{product.brand}</span>
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
                                    <span className="text-slate-500 capitalize">{key.replace('_', ' ')}</span>
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
        </div>
    );
}
