import Link from "next/link";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { pageGuard } from "@/components/rbac/PageGuard";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonStyles } from "@/components/ui/button";
import { buildProductSearchWhere } from "@/lib/product-search";
import {
  buildCommercialRequestHref,
  buildCommercialSearchHref,
} from "@/lib/commercial-toolkit";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type SearchParams = {
  q?: string;
  warehouse?: string;
  page?: string;
  productId?: string;
  sku?: string;
  source?: string;
  equivalentProductId?: string;
};

function parsePage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export default async function ProductionAvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await pageGuard("sales.view");
  const sp = await searchParams;
  const query = sp.q?.trim() ?? "";
  const selectedWarehouse = sp.warehouse?.trim() ?? "";
  const currentPage = parsePage(sp.page);
  const productId = sp.productId?.trim() ?? "";
  const sku = sp.sku?.trim() ?? "";
  const source = sp.source?.trim() ?? "";
  const equivalentProductId = sp.equivalentProductId?.trim() ?? "";

  // For sales view: only show available stock (no operational noise)
  // We still need to query quantity/reserved for filtering but only expose available
  const inventoryWhere: Prisma.InventoryWhereInput = selectedWarehouse
    ? { location: { warehouse: { code: selectedWarehouse } } }
    : {};
  const where: Prisma.ProductWhereInput = {
    ...(query ? buildProductSearchWhere(query) : {}),
    inventory: { some: { ...inventoryWhere, available: { gt: 0 } } },
  };

  const [totalRows, products, warehouses] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        sku: true,
        referenceCode: true,
        name: true,
        type: true,
        brand: true,
        inventory: {
          where: inventoryWhere,
          select: {
            available: true,
            location: {
              select: {
                code: true,
                warehouse: { select: { code: true, name: true } },
              },
            },
          },
        },
      },
    }),
    prisma.warehouse.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { code: true, name: true },
    }),
  ]);

  const rows = products.map((product) => {
    const available = product.inventory.reduce((acc, row) => acc + row.available, 0);
    const byWarehouse = Object.values(
      product.inventory.reduce<Record<string, { warehouseCode: string; warehouseName: string; available: number }>>((acc, row) => {
        const warehouseCode = row.location.warehouse.code;
        const warehouseName = row.location.warehouse.name;
        const current = acc[warehouseCode] ?? {
          warehouseCode,
          warehouseName,
          available: 0,
        };
        current.available += row.available;
        acc[warehouseCode] = current;
        return acc;
      }, {}),
    );

    return {
      ...product,
      available,
      byWarehouse,
    };
  });

  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  const buildHref = (page: number) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (selectedWarehouse) params.set("warehouse", selectedWarehouse);
    if (productId) params.set("productId", productId);
    if (sku) params.set("sku", sku);
    if (source) params.set("source", source);
    if (equivalentProductId) params.set("equivalentProductId", equivalentProductId);
    if (page > 1) params.set("page", String(page));
    const qs = params.toString();
    return qs ? `/production/availability?${qs}` : "/production/availability";
  };

  const requestHref = query || sku
    ? buildCommercialRequestHref({
        productId,
        sku: sku || undefined,
        q: query || sku || undefined,
        source: "availability",
        equivalentProductId: equivalentProductId || undefined,
      })
    : "/production/requests/new";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Disponibilidad comercial"
        description="Consulta existencia disponible por producto y almacén."
        meta={`${totalRows.toLocaleString("es-MX")} productos con disponibilidad`}
      />

      <form className="glass-card grid gap-4 md:grid-cols-[1.5fr_1fr_auto]">
        <label className="space-y-1">
          <span className="text-sm text-slate-400">Producto requerido</span>
          <input
            name="q"
            defaultValue={query}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white"
            placeholder="SKU, referencia, nombre o marca..."
          />
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="sku" value={sku} />
          <input type="hidden" name="source" value={source} />
          <input type="hidden" name="equivalentProductId" value={equivalentProductId} />
        </label>
        <label className="space-y-1">
          <span className="text-sm text-slate-400">Almacén</span>
          <select name="warehouse" defaultValue={selectedWarehouse} className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white">
            <option value="">Todos</option>
            {warehouses.map((warehouse) => (
              <option key={warehouse.code} value={warehouse.code}>
                {warehouse.code} - {warehouse.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="btn-primary">Ver disponibilidad</button>
          <Link href="/production/availability" className="rounded-lg border border-white/10 px-4 py-3 text-sm text-slate-300 hover:text-white">
            Limpiar filtros
          </Link>
        </div>
      </form>

      {rows.length === 0 ? (
          <EmptyState
            title="Busca un producto requerido"
            description="Usa SKU, referencia, nombre o marca para revisar la existencia disponible. Si no encuentras el producto, pasa al catálogo, equivalencias o nuevo pedido."
            actions={
              <>
                <Link href="/catalog" className={buttonStyles({ variant: "secondary", size: "sm" })}>
                  Ir al catálogo
                </Link>
                <Link href={buildCommercialSearchHref("/production/equivalences", query || sku, { productId: productId || undefined, sku: sku || undefined, source: "availability", equivalentProductId: equivalentProductId || undefined })} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                  Revisar equivalencias
                </Link>
                <Link href={requestHref} className={buttonStyles({ size: "sm" })}>
                  Crear pedido
                </Link>
              </>
            }
          />
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-slate-400">
                <th className="py-3 text-left">SKU</th>
                <th className="py-3 text-left">Producto</th>
                <th className="py-3 text-right">Disponible</th>
                <th className="py-3 text-left">Por almacén</th>
                <th className="py-3 text-left">Siguiente acción</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-white/5 align-top hover:bg-white/5">
                  <td className="py-3 font-mono text-cyan-300">
                    <Link href={`/catalog/${row.id}`}>{row.sku}</Link>
                    {row.referenceCode ? <p className="text-[11px] text-slate-500">{row.referenceCode}</p> : null}
                  </td>
                  <td className="py-3 text-slate-300">
                    <p>{row.name}</p>
                    <p className="text-xs text-slate-500">{row.brand ?? row.type}</p>
                  </td>
                  <td className="py-3 text-right text-emerald-300">{row.available.toLocaleString("es-MX")}</td>
                  <td className="py-3 text-xs text-slate-400">
                    <div className="space-y-1">
                      {row.byWarehouse.map((warehouse) => (
                        <p key={warehouse.warehouseCode}>
                          {warehouse.warehouseCode}: D {warehouse.available.toLocaleString("es-MX")}
                        </p>
                      ))}
                    </div>
                  </td>
                <td className="py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link href={buildCommercialSearchHref("/production/equivalences", row.sku, { productId: row.id, sku: row.sku, source: "availability" })} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                        Ver equivalencias
                      </Link>
                      <Link href={buildCommercialRequestHref({ productId: row.id, sku: row.sku, q: query || row.sku, source: "availability" })} className={buttonStyles({ size: "sm" })}>
                        Crear pedido
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between gap-3 text-sm">
          <Link href={buildHref(Math.max(1, safePage - 1))} className={`rounded-lg border border-white/10 px-4 py-2 ${safePage <= 1 ? "pointer-events-none opacity-40" : "text-slate-300 hover:text-white"}`}>
            ← Anterior
          </Link>
          <span className="text-slate-500">Pagina {safePage} de {totalPages}</span>
          <Link href={buildHref(Math.min(totalPages, safePage + 1))} className={`rounded-lg border border-white/10 px-4 py-2 ${safePage >= totalPages ? "pointer-events-none opacity-40" : "text-slate-300 hover:text-white"}`}>
            Siguiente →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
