import prisma from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session-context";
import ProductImage from "@/components/ProductImage";
import { getEquivalentProducts } from "@/lib/product-equivalences";
import { buttonStyles } from "@/components/ui/button";
import { buildTechnicalSpecRows, getTechnicalCompleteness, getTechnicalFieldLabel } from "@/lib/catalog/technical-specs";
import {
    buildCommercialRequestHref,
    buildCommercialSearchHref,
} from "@/lib/commercial-toolkit";

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function ProductDetailPage({ params }: PageProps) {
    const { id } = await params;
    const sessionCtx = await getSessionContext();
    const canEditCatalog =
        sessionCtx.isSystemAdmin || sessionCtx.permissions.includes("catalog.edit");
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
            technicalSpecs: {
                orderBy: { key: "asc" },
                select: { family: true, key: true, value: true, unit: true, isSafetyCritical: true },
            },
            assets: {
                where: { kind: "PRIMARY_IMAGE", validationStatus: "APPROVED" },
                orderBy: { updatedAt: "desc" },
                take: 1,
                select: { url: true, brandSnapshot: true, validationStatus: true },
            },
            compatibilityRulesFrom: {
                where: { active: true },
                select: { ruleType: true, description: true, severity: true, compatibleProduct: { select: { sku: true, name: true } } },
            },
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
    const storedTechnicalRows = product.technicalSpecs.map((row) => ({
        family: row.family as "HOSE" | "FITTING" | "ASSEMBLY" | "ACCESSORY",
        key: row.key,
        value: row.value,
        normalizedValue: row.value.toLowerCase(),
        unit: row.unit,
        isSafetyCritical: row.isSafetyCritical,
    }));
    const technicalRows = storedTechnicalRows.length > 0
        ? storedTechnicalRows
        : buildTechnicalSpecRows(product.type, product.attributes);
    const technicalCompleteness = getTechnicalCompleteness(product.type, technicalRows);
    const primaryAsset = product.assets[0] ?? null;
    const assetBrandMismatch = Boolean(primaryAsset?.brandSnapshot && product.brand && primaryAsset.brandSnapshot.toLowerCase() !== product.brand.toLowerCase());

    return (
        <div className="mx-auto max-w-6xl space-y-6 overflow-x-hidden">
            <div className="flex items-center gap-2 text-sm text-slate-400">
                <Link href="/catalog" className="hover:text-white">Catálogo comercial</Link>
                <span>/</span>
                <span className="text-white">{product.name}</span>
            </div>

            <section className="glass-card grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
                <div className="space-y-5">
                    <div className="space-y-2">
                        <p className="font-mono text-sm text-cyan-300">{product.sku}</p>
                        <h1 className="text-3xl font-semibold text-white">{product.name}</h1>
                        <p className="text-sm text-slate-300">
                            {product.brand ?? "Sin marca"} · {product.category?.name ?? "Sin categoría"}
                            {product.subcategory ? ` · ${product.subcategory}` : ""}
                            {product.referenceCode ? ` · Ref. ${product.referenceCode}` : ""}
                        </p>
                        {assetBrandMismatch ? (
                            <p className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-200" role="alert">
                                La imagen publicada indica “{primaryAsset?.brandSnapshot}”, pero el producto está registrado como “{product.brand}”. Validar asset antes de prometer.
                            </p>
                        ) : null}
                    </div>

                    <p className="max-w-2xl text-sm leading-relaxed text-slate-300">
                        {product.description}
                    </p>

                    <div className="flex flex-wrap gap-2">
                        <Link
                            href={buildCommercialRequestHref({ productId: product.id, sku: product.sku, source: "catalog" })}
                            className={buttonStyles({ size: "sm" })}
                            aria-label={`Crear pedido con ${product.name} (${product.sku})`}
                        >
                            Crear pedido
                        </Link>
                        <Link
                            href={buildCommercialSearchHref("/production/availability", product.sku, { productId: product.id, sku: product.sku, source: "catalog" })}
                            className={buttonStyles({ variant: "secondary", size: "sm" })}
                            aria-label={`Ver disponibilidad de ${product.name} (${product.sku})`}
                        >
                            Ver disponibilidad
                        </Link>
                        <Link
                            href={buildCommercialSearchHref("/production/equivalences", product.sku, { productId: product.id, sku: product.sku, source: "catalog" })}
                            className={buttonStyles({ variant: "secondary", size: "sm" })}
                            aria-label={`Revisar equivalencias de ${product.name} (${product.sku})`}
                        >
                            Revisar equivalencias
                        </Link>
                        {canEditCatalog ? (
                            <Link href={`/catalog/${product.id}/edit`} className="text-sm text-cyan-300 underline-offset-4 hover:text-white hover:underline">
                                Editar
                            </Link>
                        ) : null}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">
                                Existencia disponible
                            </p>
                            <p className="mt-2 text-2xl font-semibold text-white">
                                {stock.toLocaleString("es-MX")}{" "}
                                <span className="text-sm font-normal text-slate-400">
                                    unidades
                                </span>
                            </p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                                Ubicaciones
                            </p>
                            <p className="mt-2 text-lg text-white">{locationCodes}</p>
                        </div>
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <ProductImage
                            sku={product.sku}
                            imageUrl={primaryAsset?.url ?? product.imageUrl}
                            name={product.name}
                            size={320}
                            className="aspect-square w-full rounded-xl"
                        />
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                            Decisión comercial
                        </p>
                        <p className="mt-2">
                            Usa disponibilidad y equivalencias para decidir si
                            avanzas al pedido o cambias el producto.
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-400">
                            <span>Tipo: {product.type}</span>
                            <span>Marca: {product.brand ?? "--"}</span>
                            {product.subcategory ? <span>Subcategoría: {product.subcategory}</span> : null}
                        </div>
                    </div>
                </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
                <section className="glass-card space-y-4">
                    <div className="space-y-1">
                        <h2 className="text-lg font-semibold text-white">
                            Especificaciones técnicas
                        </h2>
                        <p className="text-sm text-slate-400">
                            Detalles de apoyo para validar el producto. La
                            decisión comercial ya está arriba.
                        </p>
                    </div>
                    <div className={`rounded-xl border px-4 py-3 text-sm ${technicalCompleteness.complete ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-amber-500/30 bg-amber-500/10 text-amber-200"}`} data-testid="technical-completeness">
                        <p className="font-semibold">Ficha técnica {technicalCompleteness.complete ? "completa" : "incompleta"}</p>
                        <p className="mt-1 text-xs opacity-90">
                            {technicalCompleteness.complete
                                ? `${technicalCompleteness.availableCount} de ${technicalCompleteness.requiredCount} campos críticos disponibles.`
                                : `Faltan: ${technicalCompleteness.missing.join(", ")}.`}
                        </p>
                    </div>
                    {technicalRows.length > 0 || (attributes && Object.keys(attributes).length > 0) ? (
                        <div className="overflow-hidden rounded-xl border border-white/10">
                            <div className="divide-y divide-white/5 text-sm">
                                {technicalRows.map((row, idx) => (
                                    <div
                                        key={row.key}
                                        className={`flex items-center justify-between gap-4 px-4 py-3 ${idx % 2 === 0 ? "bg-white/5" : ""}`}
                                    >
                                        <span className="text-slate-400 font-medium capitalize">
                                            {getTechnicalFieldLabel(product.type, row.key)}
                                        </span>
                                        <span className="text-right font-mono text-white">
                                            {row.value}{row.unit ? ` ${row.unit}` : ""}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <p className="text-sm text-slate-400">
                            No hay especificaciones técnicas adicionales para
                            este producto.
                        </p>
                    )}
                    {product.compatibilityRulesFrom.length > 0 ? (
                        <div className="space-y-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4" data-testid="technical-compatibility-rules">
                            <p className="text-sm font-semibold text-red-200">Reglas de compatibilidad</p>
                            {product.compatibilityRulesFrom.map((rule) => (
                                <p key={`${rule.ruleType}-${rule.compatibleProduct.sku}`} className="text-xs text-red-100">
                                    <span className="font-mono">{rule.compatibleProduct.sku}</span> · {rule.description} ({rule.severity})
                                </p>
                            ))}
                        </div>
                    ) : null}
                </section>

                <section className="glass-card space-y-4">
                    <div className="space-y-1">
                        <h2 className="text-lg font-semibold text-white">
                            Alternativas y equivalencias
                        </h2>
                        <p className="text-sm text-slate-400">
                            Sustitutos registrados para decidir si conviene
                            validar disponibilidad o crear el pedido comercial.
                        </p>
                    </div>
                    {equivalents.length > 0 ? (
                        <div className="space-y-3">
                            {equivalents.map((equivalent) => (
                                <div
                                    key={equivalent.equivalenceId}
                                    className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm space-y-3"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="font-semibold text-white">
                                                {equivalent.name}
                                            </p>
                                            <p className="font-mono text-xs text-cyan-200">
                                                {equivalent.sku}
                                            </p>
                                        </div>
                                        <span className="text-xs text-emerald-200">
                                            {equivalent.totalAvailable} disp.
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-300">
                                        {equivalent.locations.length > 0
                                            ? `Disponible en ${equivalent.locations[0].code} (${equivalent.locations[0].warehouseCode}) con ${equivalent.locations[0].available} unidades.`
                                            : "Equivalencia registrada sin stock disponible."}
                                    </p>
                                    <div className="flex flex-wrap gap-2 text-[11px] text-slate-200">
                                        {equivalent.brand ? <span className="rounded bg-black/20 px-2 py-1">{equivalent.brand}</span> : null}
                                        {equivalent.categoryName ? <span className="rounded bg-black/20 px-2 py-1">{equivalent.categoryName}</span> : null}
                                        {equivalent.basisNorm ? <span className="rounded bg-black/20 px-2 py-1">{equivalent.basisNorm}</span> : null}
                                        {typeof equivalent.basisDash === "number" ? <span className="rounded bg-black/20 px-2 py-1">Dash {equivalent.basisDash}</span> : null}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <Link
                                            href={buildCommercialSearchHref("/production/availability", equivalent.sku, { productId: equivalent.productId, sku: equivalent.sku, source: "equivalences", equivalentProductId: product.id })}
                                            className={buttonStyles({ variant: "secondary", size: "sm" })}
                                        >
                                            Ver disponibilidad
                                        </Link>
                                        <Link
                                            href={buildCommercialRequestHref({ productId: equivalent.productId, sku: equivalent.sku, q: product.sku, source: "equivalences", equivalentProductId: product.id })}
                                            className={buttonStyles({ size: "sm" })}
                                        >
                                            Crear pedido
                                        </Link>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                            No hay equivalencias activas registradas para este
                            producto. Puedes seguir con disponibilidad o crear
                            un pedido comercial.
                        </div>
                    )}
                </section>
            </section>
        </div>
    );
}
