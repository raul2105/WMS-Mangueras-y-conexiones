import prisma from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";
import ProductImage from "@/components/ProductImage";
import { getEquivalentProducts } from "@/lib/product-equivalences";

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function ProductDetailPage({ params }: PageProps) {
    const { id } = await params;
    const product = await prisma.product.findUnique({
        where: { id },
        select: {
            id: true,
            sku: true,
            referenceCode: true,
            imageUrl: true,
            name: true,
            description: true,
            type: true,
            brand: true,
            subcategory: true,
            price: true,
            attributes: true,
            category: { select: { id: true, name: true } },
            inventory: {
                select: {
                    quantity: true,
                    location: { select: { code: true } },
                },
            },
        },
    });

    if (!product) {
        notFound();
    }

    const stock = product.inventory.reduce((acc, row) => acc + (typeof row.quantity === "number" ? row.quantity : 0), 0);
    const locationCodes = product.inventory
        .filter((row) => row.location)
        .map((row) => row.location?.code)
        .filter(Boolean)
        .join(", ") || "--";
    let attributes: Record<string, unknown> | undefined;
    if (product.attributes) {
        try {
            attributes = JSON.parse(product.attributes);
        } catch {
            attributes = { raw: product.attributes };
        }
    }
    const equivalents = await getEquivalentProducts(product.id, { limit: 6, inStockOnly: false });

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-sm text-slate-400">
                <Link href="/catalog" className="hover:text-white">Catálogo</Link>
                <span>/</span>
                <span className="text-white">{product.name}</span>
            </div>

            {/* Header Card */}
            <div className="glass-card p-8 flex flex-col md:flex-row gap-8 items-start">
                <div className="w-full md:w-1/3">
                    <ProductImage
                        sku={product.sku}
                        imageUrl={product.imageUrl}
                        name={product.name}
                        size={400}
                        className="w-full aspect-square"
                    />
                </div>

                <div className="flex-1 space-y-4">
                    <div className="flex justify-between items-start">
                        <div>
                            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-cyan-300">
                                {product.name}
                            </h1>
                            <div className="flex items-center gap-3 mt-2">
                                <span className="bg-slate-700 px-2 py-1 rounded text-sm text-slate-300 font-mono">{product.sku}</span>
                                <span className="text-slate-400">|</span>
                                <span className="text-slate-300">{product.brand}</span>
                                <span className="text-slate-400">|</span>
                                <span className="px-2 py-1 rounded text-xs bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                                    {product.category?.name ?? "Sin categoría"}
                                </span>
                                {product.subcategory && (
                                    <>
                                        <span className="text-slate-400">|</span>
                                        <span className="px-2 py-1 rounded text-xs bg-white/10 text-slate-200 border border-white/10">
                                            {product.subcategory}
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>
                        <div className="text-right space-y-2">
                            <p className="text-3xl font-bold text-white">${product.price?.toFixed(2)}</p>
                            <p className="text-xs text-slate-500">Precio de Lista</p>
                            <Link href={`/catalog/${product.id}/edit`} className="inline-block px-3 py-1 glass rounded text-xs text-cyan-400 hover:text-white border border-cyan-500/30">
                                ✏️ Editar
                            </Link>
                        </div>
                    </div>

                    <p className="text-slate-300 leading-relaxed max-w-2xl">
                        {product.description}
                    </p>

                    <div className="grid grid-cols-2 gap-4 mt-6">
                        <div className="glass p-4 rounded-lg bg-green-500/5 border-green-500/20">
                            <p className="text-xs text-green-400 uppercase font-bold">Stock Disponible</p>
                            <p className="text-2xl font-bold text-white">{stock} <span className="text-sm font-normal text-slate-400">unidades</span></p>
                        </div>
                        <div className="glass p-4 rounded-lg">
                            <p className="text-xs text-slate-400 uppercase font-bold">Ubicaciones</p>
                            <p className="text-lg text-white">{locationCodes}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Technical Specs & Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* Attributes Panel */}
                <div className="glass-card">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <span className="text-cyan-400">⚡</span> Especificaciones Técnicas
                    </h2>
                    <div className="space-y-0 text-sm">
                        {attributes && Object.entries(attributes).map(([key, val], idx) => (
                            <div key={key} className={`flex justify-between py-3 px-2 border-b border-white/5 first:border-t ${idx % 2 === 0 ? 'bg-white/5' : ''}`}>
                                <span className="text-slate-400 font-medium capitalize">{key.replaceAll('_', ' ')}</span>
                                <span className="text-white font-mono text-right">{Array.isArray(val) ? val.join(', ') : String(val)}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Related/Assembly Info (Placeholder) */}
                <div className="glass-card">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <span className="text-purple-400">🔗</span> Compatibilidad
                    </h2>
                    {equivalents.length > 0 ? (
                        <div className="space-y-3">
                            {equivalents.map((equivalent) => (
                                <div key={equivalent.equivalenceId} className="p-4 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-sm space-y-2">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="text-indigo-100 font-semibold">{equivalent.name}</p>
                                            <p className="text-indigo-200/80 font-mono text-xs">{equivalent.sku}</p>
                                        </div>
                                        <span className="text-xs text-indigo-200">{equivalent.totalAvailable} disp.</span>
                                    </div>
                                    <div className="flex flex-wrap gap-2 text-xs">
                                        {equivalent.brand && <span className="px-2 py-1 rounded bg-black/20 text-indigo-100">{equivalent.brand}</span>}
                                        {equivalent.categoryName && <span className="px-2 py-1 rounded bg-black/20 text-indigo-100">{equivalent.categoryName}</span>}
                                        {equivalent.basisNorm && <span className="px-2 py-1 rounded bg-black/20 text-indigo-100">{equivalent.basisNorm}</span>}
                                        {typeof equivalent.basisDash === "number" && <span className="px-2 py-1 rounded bg-black/20 text-indigo-100">Dash {equivalent.basisDash}</span>}
                                    </div>
                                    {equivalent.locations.length > 0 && (
                                        <p className="text-indigo-100/80 text-xs">
                                            Disponible en {equivalent.locations[0].code} ({equivalent.locations[0].warehouseCode}) con {equivalent.locations[0].available} unidades.
                                        </p>
                                    )}
                                    {equivalent.locations.length === 0 && (
                                        <p className="text-indigo-100/60 text-xs">
                                            Equivalencia registrada sin stock disponible.
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="p-4 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-200 text-sm">
                            No hay equivalencias activas registradas para este producto.
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}
