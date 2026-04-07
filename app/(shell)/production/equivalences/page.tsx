import Link from "next/link";
import prisma from "@/lib/prisma";
import { pageGuard } from "@/components/rbac/PageGuard";
import { PageHeader } from "@/components/ui/page-header";
import { getEquivalentProducts } from "@/lib/product-equivalences";
import { searchProducts } from "@/lib/product-search";

export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string;
  warehouseId?: string;
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Equivalencias para pedidos"
        description="Consulta sustitutos registrados por producto con stock disponible por almacen cuando aplique."
        meta={query ? `${groups.length} productos analizados` : "Busca un SKU o referencia para explorar equivalencias"}
        actions={<Link href="/production/requests/new" className="btn-primary">+ Nuevo pedido</Link>}
      />

      <form className="glass-card grid gap-4 md:grid-cols-[1.5fr_1fr_auto]">
        <label className="space-y-1">
          <span className="text-sm text-slate-400">Producto base</span>
          <input
            name="q"
            defaultValue={query}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white"
            placeholder="SKU, referencia, nombre..."
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm text-slate-400">Almacen</span>
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
          <button type="submit" className="btn-primary">Buscar</button>
          <Link href="/production/equivalences" className="rounded-lg border border-white/10 px-4 py-3 text-sm text-slate-300 hover:text-white">
            Limpiar
          </Link>
        </div>
      </form>

      {!query ? (
        <div className="glass-card px-4 py-10 text-center text-slate-400">
          Ingresa un SKU, referencia o nombre para mostrar equivalencias del pedido.
        </div>
      ) : groups.length === 0 ? (
        <div className="glass-card px-4 py-10 text-center text-slate-400">
          No se encontraron productos base para esa busqueda.
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(({ product, equivalents }) => (
            <section key={product.id} className="glass-card space-y-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-mono text-sm text-cyan-300">{product.sku}</p>
                  <h2 className="text-lg font-semibold text-white">{product.name}</h2>
                  <p className="text-sm text-slate-400">Disponible actual: {product.totalAvailable.toLocaleString("es-MX")}</p>
                </div>
                <Link href={`/catalog/${product.id}`} className="text-sm text-cyan-300 hover:text-white">Ver producto base</Link>
              </div>

              {equivalents.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-sm text-slate-400">
                  No hay equivalencias registradas para este producto.
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
