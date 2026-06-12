import Link from "next/link";
import prisma from "@/lib/prisma";
import { pageGuard } from "@/components/rbac/PageGuard";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { buttonStyles } from "@/components/ui/button";
import { getEquivalentProducts } from "@/lib/product-equivalences";
import { searchProducts } from "@/lib/product-search";
import {
  buildCommercialRequestHref,
  buildCommercialSearchHref,
} from "@/lib/commercial-toolkit";

export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string;
  warehouseId?: string;
  productId?: string;
  sku?: string;
  source?: string;
  equivalentProductId?: string;
};

export default async function ProductionEquivalencesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await pageGuard("sales.view");
  const sp = await searchParams;
  const query = sp.q?.trim() ?? "";
  const warehouseId = sp.warehouseId?.trim() ?? "";
  const productId = sp.productId?.trim() ?? "";
  const sku = sp.sku?.trim() ?? "";
  const source = sp.source?.trim() ?? "";
  const equivalentProductId = sp.equivalentProductId?.trim() ?? "";

  const [warehouses, matches] = await Promise.all([
    prisma.warehouse.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
    query ? searchProducts(prisma, { query, warehouseId: warehouseId || undefined, take: 6, minScore: 80 }) : Promise.resolve([]),
  ]);

  const groups = await Promise.all(
    matches.map(async (product) => ({
      product,
      equivalents: await getEquivalentProducts(product.id, { warehouseId: warehouseId || undefined, limit: 6, inStockOnly: false }),
    })),
  );

  const requestHref = query || sku
    ? buildCommercialRequestHref({
        productId: productId || undefined,
        sku: sku || undefined,
        q: query || sku || undefined,
        source: "equivalences",
        equivalentProductId: equivalentProductId || undefined,
      })
    : "/production/requests/new";
  const availabilityHref = query || sku
    ? buildCommercialSearchHref("/production/availability", query || sku, {
        productId: productId || undefined,
        sku: sku || undefined,
        source: "equivalences",
        equivalentProductId: equivalentProductId || undefined,
      })
    : "/production/availability";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alternativas y equivalencias"
        description="Revisa sustitutos registrados para decidir si conviene validar disponibilidad o crear un pedido comercial."
        meta={query ? `${groups.length} productos analizados` : "Busca un SKU o referencia para explorar equivalencias"}
        actions={<Link href={requestHref} className="btn-primary">+ Nuevo pedido</Link>}
      />

      <SectionCard
        title="Siguiente acción"
        description="Usa equivalencias para encontrar un sustituto y continuar con disponibilidad o captura de pedido."
      >
        <div className="flex flex-wrap gap-2">
          <Link href="/catalog" className={buttonStyles({ variant: "secondary", size: "sm" })}>
            Buscar en catálogo
          </Link>
          <Link href={availabilityHref} className={buttonStyles({ variant: "secondary", size: "sm" })}>
            Ver disponibilidad
          </Link>
          <Link href={requestHref} className={buttonStyles({ size: "sm" })}>
            Crear pedido
          </Link>
        </div>
      </SectionCard>

      <form className="glass-card grid gap-4 md:grid-cols-[1.5fr_1fr_auto]">
        <label className="space-y-1">
          <span className="text-sm text-slate-400">Producto requerido</span>
          <input
            name="q"
            defaultValue={query}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white"
            placeholder="SKU, referencia, nombre..."
          />
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="sku" value={sku} />
          <input type="hidden" name="source" value={source} />
          <input type="hidden" name="equivalentProductId" value={equivalentProductId} />
        </label>
        <label className="space-y-1">
          <span className="text-sm text-slate-400">Almacén</span>
          <select name="warehouseId" defaultValue={warehouseId} className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white">
            <option value="">Todos</option>
            {warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.code} - {warehouse.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="btn-primary">Revisar equivalencias</button>
          <Link href="/production/equivalences" className="rounded-lg border border-white/10 px-4 py-3 text-sm text-slate-300 hover:text-white">
            Limpiar filtros
          </Link>
        </div>
      </form>

      {!query ? (
        <EmptyState
          title="Busca un producto requerido"
          description="Ingresa un SKU, referencia o nombre para ver alternativas disponibles y decidir si validas existencia o creas el pedido comercial."
          actions={
              <>
                <Link href="/catalog" className={buttonStyles({ variant: "secondary", size: "sm" })}>
                  Ir al catálogo
                </Link>
                <Link href={availabilityHref} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                  Ver disponibilidad
                </Link>
                <Link href={requestHref} className={buttonStyles({ size: "sm" })}>
                  Crear pedido
                </Link>
              </>
            }
          />
      ) : groups.length === 0 ? (
        <EmptyState
          title="Sin resultados"
          description="No se encontraron productos base para esa búsqueda. Prueba con otro SKU, referencia o vuelve al catálogo para buscar el producto requerido."
          actions={
            <>
              <Link href="/catalog" className={buttonStyles({ variant: "secondary", size: "sm" })}>
                Buscar en catálogo
              </Link>
              <Link href={availabilityHref} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                Ver disponibilidad
              </Link>
              <Link href={requestHref} className={buttonStyles({ size: "sm" })}>
                Crear pedido
              </Link>
            </>
          }
        />
      ) : (
        <div className="space-y-4">
          {groups.map(({ product, equivalents }) => (
            <section key={product.id} className="glass-card space-y-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-mono text-sm text-cyan-300">{product.sku}</p>
                  <h2 className="text-lg font-semibold text-white">{product.name}</h2>
                  <p className="text-sm text-slate-400">Existencia disponible: {product.totalAvailable.toLocaleString("es-MX")}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/catalog/${product.id}`} className="text-sm text-cyan-300 hover:text-white">Ver producto</Link>
                  <Link href={buildCommercialSearchHref("/production/availability", product.sku, { productId: product.id, sku: product.sku, source: "equivalences", equivalentProductId: productId || undefined })} className="text-sm text-cyan-300 hover:text-white">
                    Ver disponibilidad
                  </Link>
                  <Link href={buildCommercialRequestHref({ productId: product.id, sku: product.sku, q: query || sku || product.sku, source: "equivalences", equivalentProductId: productId || undefined })} className="text-sm text-cyan-300 hover:text-white">
                    Crear pedido
                  </Link>
                </div>
              </div>

              {equivalents.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-sm text-slate-400">
                  No hay equivalencias registradas para este producto. Puedes seguir con disponibilidad o crear el pedido comercial.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {equivalents.map((equivalent) => (
                    <div key={equivalent.equivalenceId} className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-4 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-white">{equivalent.name}</p>
                          <p className="font-mono text-xs text-cyan-200">{equivalent.sku}</p>
                        </div>
                        <span className="text-xs text-emerald-200">{equivalent.totalAvailable} disp.</span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-200">
                        {equivalent.brand ? <span className="rounded bg-black/20 px-2 py-1">{equivalent.brand}</span> : null}
                        {equivalent.categoryName ? <span className="rounded bg-black/20 px-2 py-1">{equivalent.categoryName}</span> : null}
                        {equivalent.basisNorm ? <span className="rounded bg-black/20 px-2 py-1">{equivalent.basisNorm}</span> : null}
                        {typeof equivalent.basisDash === "number" ? <span className="rounded bg-black/20 px-2 py-1">Dash {equivalent.basisDash}</span> : null}
                      </div>
                      <div className="mt-3 space-y-1 text-xs text-cyan-100/90">
                        {equivalent.locations.length === 0 ? (
                          <p>Equivalencia registrada sin stock disponible.</p>
                        ) : equivalent.locations.slice(0, 3).map((location) => (
                          <p key={`${equivalent.equivalenceId}-${location.code}`}>
                            {location.code} ({location.warehouseCode}) - {location.available} disp.
                          </p>
                        ))}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Link href={buildCommercialSearchHref("/production/availability", equivalent.sku, { productId: equivalent.productId, sku: equivalent.sku, source: "equivalences", equivalentProductId: product.id })} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                          Ver disponibilidad
                        </Link>
                        <Link href={buildCommercialRequestHref({ productId: equivalent.productId, sku: equivalent.sku, q: query || sku || product.sku, source: "equivalences", equivalentProductId: product.id })} className={buttonStyles({ size: "sm" })} aria-label={`Crear pedido con ${equivalent.name} (${equivalent.sku})`}>
                          Crear pedido
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
