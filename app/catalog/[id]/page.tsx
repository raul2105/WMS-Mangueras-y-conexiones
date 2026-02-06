import prisma from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function ProductDetailPage({ params }: PageProps) {
    const { id } = await params;
    const product = await prisma.product.findUnique({
        where: { id },
        include: { category: true, inventory: true },
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
                <div className="w-full md:w-1/3 aspect-square bg-slate-800 rounded-lg flex items-center justify-center border border-white/5">
                    <span className="text-4xl">📸</span>
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
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-3xl font-bold text-white">${product.price?.toFixed(2)}</p>
                            <p className="text-xs text-slate-500">Precio de Lista</p>
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
                    <div className="p-4 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-200 text-sm">
                        Este artículo es compatible con las series de conexiones <strong>PC - Parker</strong> y <strong>KC - King Crimp</strong>.
                    </div>
                </div>

            </div>
        </div>
    );
}
