import Link from "next/link";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { pageGuard } from "@/components/rbac/PageGuard";
import { PageHeader } from "@/components/ui/page-header";
import { buildProductSearchWhere } from "@/lib/product-search";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type SearchParams = {
  q?: string;
  warehouse?: string;
  page?: string;
};

function parsePage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export default async function SalesAvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await pageGuard("sales.view");
  const sp = await searchParams;
  const query = sp.q?.trim() ?? "";
  const selectedWarehouse = sp.warehouse?.trim() ?? "";
  const currentPage = parsePage(sp.page);

  const inventoryWhere: Prisma.InventoryWhereInput = selectedWarehouse
    ? { location: { warehouse: { code: selectedWarehouse } } }
    : {};
  const where: Prisma.ProductWhereInput = {
    ...(query ? buildProductSearchWhere(query) : {}),
    inventory: { some: inventoryWhere },
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
            quantity: true,
            reserved: true,
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
    const total = product.inventory.reduce((acc, row) => acc + row.quantity, 0);
    const reserved = product.inventory.reduce((acc, row) => acc + row.reserved, 0);
    const available = product.inventory.reduce((acc, row) => acc + row.available, 0);
    const byWarehouse = Object.values(
      product.inventory.reduce<Record<string, { warehouseCode: string; quantity: number; reserved: number; available: number }>>((acc, row) => {
        const warehouseCode = row.location.warehouse.code;
        const current = acc[warehouseCode] ?? {
          warehouseCode,
          quantity: 0,
          reserved: 0,
          available: 0,
        };
        current.quantity += row.quantity;
        current.reserved += row.reserved;
        current.available += row.available;
        acc[warehouseCode] = current;
        return acc;
      }, {})
    );

    return {
      ...product,
      total,
      reserved,
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
    if (page > 1) params.set("page", String(page));
    const qs = params.toString();
    return qs ? `/sales/availability?${qs}` : "/sales/availability";
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Disponibilidad comercial"
        description="Stock total, reservado y disponible en tiempo real para promesa comercial."
        meta={`${totalRows.toLocaleString("es-MX")} productos con inventario`}
        actions={<Link href="/sales/orders/new" className="btn-primary">+ Nuevo pedido</Link>}
      />

      <form className="glass-card grid gap-4 md:grid-cols-[1.5fr_1fr_auto]">
        <label className="space-y-1">
          <span className="text-sm text-slate-400">Buscar producto</span>
          <input
            name="q"
            defaultValue={query}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white"
            placeholder="SKU, referencia, nombre, marca..."
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm text-slate-400">Almacen</span>
          <select name="warehouse" defaultValue={selectedWarehouse} className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white">
            <option value="">Todos</option>
            {warehouses.map((warehouse) => (
              <option key={warehouse.code} value={warehouse.code}>{warehouse.code} - {warehouse.name}</option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="btn-primary">Filtrar</button>
          <Link href="/sales/availability" className="rounded-lg border border-white/10 px-4 py-3 text-sm text-slate-300 hover:text-white">Limpiar</Link>
        </div>
      </form>

      <div className="glass-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-slate-400">
              <th className="py-3 text-left">SKU</th>
              <th className="py-3 text-left">Producto</th>
              <th className="py-3 text-right">Total</th>
              <th className="py-3 text-right">Reservado</th>
              <th className="py-3 text-right">Disponible</th>
              <th className="py-3 text-left">Por almacen</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-slate-500">No hay productos para el filtro seleccionado.</td>
              </tr>
            ) : rows.map((row) => (
              <tr key={row.id} className="border-b border-white/5 align-top hover:bg-white/5">
                <td className="py-3 font-mono text-cyan-300">
                  <Link href={`/catalog/${row.id}`}>{row.sku}</Link>
                  {row.referenceCode ? <p className="text-[11px] text-slate-500">{row.referenceCode}</p> : null}
                </td>
                <td className="py-3 text-slate-300">
                  <p>{row.name}</p>
                  <p className="text-xs text-slate-500">{row.brand ?? row.type}</p>
                </td>
                <td className="py-3 text-right text-slate-200">{row.total.toLocaleString("es-MX")}</td>
                <td className="py-3 text-right text-amber-300">{row.reserved.toLocaleString("es-MX")}</td>
                <td className="py-3 text-right text-emerald-300">{row.available.toLocaleString("es-MX")}</td>
                <td className="py-3 text-xs text-slate-400">
                  <div className="space-y-1">
                    {row.byWarehouse.map((warehouse) => (
                      <p key={warehouse.warehouseCode}>
                        {warehouse.warehouseCode}: T {warehouse.quantity.toLocaleString("es-MX")} / R {warehouse.reserved.toLocaleString("es-MX")} / D {warehouse.available.toLocaleString("es-MX")}
                      </p>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
