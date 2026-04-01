import Link from "next/link";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { buildProductSearchWhere, scoreProductSearch, sumInventoryAvailable, sumInventoryQuantity } from "@/lib/product-search";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type PageProps = {
  searchParams: Promise<{
    q?: string;
    type?: string;
    stock?: string;
    warehouse?: string;
    location?: string;
    page?: string;
  }>;
};

function parsePage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function buildInventoryRelationFilter(selectedWarehouse: string, selectedLocation: string): Prisma.InventoryWhereInput {
  return {
    ...(selectedWarehouse ? { location: { warehouse: { code: selectedWarehouse } } } : {}),
    ...(selectedLocation ? { location: { code: selectedLocation } } : {}),
  };
}

function buildProductWhere({
  query,
  selectedType,
  stockFilter,
  inventoryFilter,
}: {
  query: string;
  selectedType: string;
  stockFilter: string;
  inventoryFilter: Prisma.InventoryWhereInput;
}): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {
    ...(query ? buildProductSearchWhere(query) : {}),
    ...(selectedType ? { type: selectedType } : {}),
  };

  const hasInventoryFilter = Object.keys(inventoryFilter).length > 0;
  if (stockFilter === "in") {
    where.inventory = { some: { ...inventoryFilter, available: { gt: 0 } } };
  } else if (stockFilter === "out") {
    where.inventory = { none: { ...inventoryFilter, available: { gt: 0 } } };
  } else if (hasInventoryFilter) {
    where.inventory = { some: inventoryFilter };
  }

  return where;
}

export default async function InventoryHomePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const query = sp.q?.trim() ?? "";
  const selectedType = sp.type?.trim() ?? "";
  const stockFilter = sp.stock?.trim() ?? "";
  const selectedWarehouse = sp.warehouse?.trim() ?? "";
  const selectedLocation = sp.location?.trim() ?? "";
  const currentPage = parsePage(sp.page);
  const inventoryFilter = buildInventoryRelationFilter(selectedWarehouse, selectedLocation);

  const where = buildProductWhere({
    query,
    selectedType,
    stockFilter,
    inventoryFilter,
  });
  const whereWithoutType = buildProductWhere({
    query,
    selectedType: "",
    stockFilter,
    inventoryFilter,
  });

  const [totalRows, products, typeGroups, warehouses, locations] = await Promise.all([
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
        description: true,
        type: true,
        brand: true,
        subcategory: true,
        category: { select: { name: true } },
        inventory: {
          where: inventoryFilter,
          select: {
            quantity: true,
            available: true,
            location: { select: { code: true, warehouse: { select: { code: true } } } },
          },
        },
        technicalAttributes: query
          ? { take: 12, select: { keyNormalized: true, valueNormalized: true } }
          : undefined,
      },
    }),
    prisma.product.groupBy({
      by: ["type"],
      where: whereWithoutType,
      _count: { id: true },
      orderBy: { type: "asc" },
    }),
    prisma.warehouse.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { code: true, name: true },
    }),
    prisma.location.findMany({
      where: {
        isActive: true,
        ...(selectedWarehouse ? { warehouse: { code: selectedWarehouse } } : {}),
      },
      orderBy: [{ warehouse: { code: "asc" } }, { code: "asc" }],
      select: { code: true, name: true, warehouse: { select: { code: true } } },
      take: 500,
    }),
  ]);

  const rows = products
    .map((product) => {
      const stock = sumInventoryQuantity(product.inventory);
      const available = sumInventoryAvailable(product.inventory);
      const score = query ? scoreProductSearch(product, query) : 0;
      const topLocations = product.inventory
        .filter((row) => (typeof row.available === "number" ? row.available : 0) > 0)
        .sort((a, b) => (b.available ?? 0) - (a.available ?? 0))
        .slice(0, 2)
        .map((row) => `${row.location.code} (${row.location.warehouse.code})`)
        .join(", ");

      return {
        id: product.id,
        sku: product.sku,
        referenceCode: product.referenceCode,
        name: product.name,
        type: product.type,
        brand: product.brand,
        categoryName: product.category?.name ?? "--",
        subcategory: product.subcategory ?? "--",
        stock,
        available,
        topLocations: topLocations || "--",
        score,
      };
    })
    .sort((a, b) => {
      if (query) {
        return b.score - a.score || b.available - a.available || a.name.localeCompare(b.name, "es");
      }
      return b.available - a.available || b.stock - a.stock || a.name.localeCompare(b.name, "es");
    });

  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const typeOptions = typeGroups.map((row) => row.type).sort((a, b) => a.localeCompare(b));

  const buildHref = (page: number) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (selectedType) params.set("type", selectedType);
    if (stockFilter) params.set("stock", stockFilter);
    if (selectedWarehouse) params.set("warehouse", selectedWarehouse);
    if (selectedLocation) params.set("location", selectedLocation);
    if (page > 1) params.set("page", String(page));
    const qs = params.toString();
    return qs ? `/inventory?${qs}` : "/inventory";
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Inventario</h1>
          <p className="text-slate-400 mt-1">Entradas, salidas y búsqueda operativa por SKU, referencia, nombre, marca y atributos.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/inventory/receive" className="btn-primary">+ Recepción</Link>
          <Link href="/inventory/pick" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">- Picking</Link>
          <Link href="/inventory/adjust" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">± Ajuste</Link>
          <Link href="/inventory/transfer" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">⇄ Transferir</Link>
          <Link href="/inventory/kardex" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">Kardex</Link>
          <Link href="/trace" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">Trace</Link>
        </div>
      </div>

      <form action="/trace" method="get" className="glass-card grid grid-cols-1 md:grid-cols-4 gap-3">
        <label className="space-y-1 md:col-span-3">
          <span className="text-sm text-slate-400">Resolver Trace ID</span>
          <input
            name="traceId"
            className="w-full px-4 py-3 glass rounded-lg font-mono"
            placeholder="TRC-REC-20260331-ABC123"
          />
        </label>
        <div className="flex items-end">
          <button type="submit" className="btn-primary w-full">Buscar trace</button>
        </div>
      </form>

      <form className="glass-card grid grid-cols-1 md:grid-cols-4 gap-4">
        <label className="space-y-1 md:col-span-2">
          <span className="text-sm text-slate-400">Buscar producto</span>
          <input
            name="q"
            defaultValue={query}
            className="w-full px-4 py-3 glass rounded-lg"
            placeholder="SKU, referencia, nombre, marca, categoría o atributo"
          />
        </label>

        <label className="space-y-1">
          <span className="text-sm text-slate-400">Tipo</span>
          <select name="type" defaultValue={selectedType} className="w-full px-4 py-3 glass rounded-lg">
            <option value="">Todos</option>
            {typeOptions.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-sm text-slate-400">Disponibilidad</span>
          <select name="stock" defaultValue={stockFilter} className="w-full px-4 py-3 glass rounded-lg">
            <option value="">Todos</option>
            <option value="in">Con disponible</option>
            <option value="out">Sin disponible</option>
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-sm text-slate-400">Almacén</span>
          <select name="warehouse" defaultValue={selectedWarehouse} className="w-full px-4 py-3 glass rounded-lg">
            <option value="">Todos</option>
            {warehouses.map((warehouse) => (
              <option key={warehouse.code} value={warehouse.code}>{warehouse.code} - {warehouse.name}</option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-sm text-slate-400">Ubicación</span>
          <select name="location" defaultValue={selectedLocation} className="w-full px-4 py-3 glass rounded-lg">
            <option value="">Todas</option>
            {locations.map((location) => (
              <option key={location.code} value={location.code}>{location.code} - {location.name} ({location.warehouse.code})</option>
            ))}
          </select>
        </label>

        <div className="md:col-span-4 flex items-center justify-between gap-3">
          <p className="text-sm text-slate-400">
            {totalRows.toLocaleString("es-MX")} resultados
            {query ? ` para "${query}"` : ""}
          </p>
          <div className="flex items-center gap-3">
            <Link href="/inventory" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">Limpiar</Link>
            <button type="submit" className="btn-primary">Buscar</button>
          </div>
        </div>
      </form>

      <div className="glass-card">
        <div className="flex items-center justify-between gap-4 mb-4">
          <h2 className="text-lg font-bold">Stock por producto</h2>
          <p className="text-sm text-slate-500">Página {safePage} de {totalPages}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-white/10">
                <th className="text-left py-3">SKU</th>
                <th className="text-left py-3">Referencia</th>
                <th className="text-left py-3">Nombre</th>
                <th className="text-left py-3">Marca</th>
                <th className="text-left py-3">Categoría</th>
                <th className="text-left py-3">Ubicaciones</th>
                <th className="text-right py-3">Stock</th>
                <th className="text-right py-3">Disponible</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-3 font-mono text-slate-200">
                    <Link href={`/inventory/${row.id}`} className="hover:text-cyan-300">
                      {row.sku}
                    </Link>
                  </td>
                  <td className="py-3 font-mono text-slate-400">{row.referenceCode ?? "--"}</td>
                  <td className="py-3 text-slate-200">
                    <Link href={`/inventory/${row.id}`} className="hover:text-cyan-300">
                      {row.name}
                    </Link>
                    <p className="text-xs text-slate-500 mt-1">{row.type} • {row.subcategory}</p>
                  </td>
                  <td className="py-3 text-slate-400">{row.brand ?? "--"}</td>
                  <td className="py-3 text-slate-400">{row.categoryName}</td>
                  <td className="py-3 text-slate-400">{row.topLocations}</td>
                  <td className="py-3 text-right font-bold text-white">{row.stock}</td>
                  <td className={`py-3 text-right font-bold ${row.available > 0 ? "text-green-400" : "text-slate-500"}`}>{row.available}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">No hay coincidencias con los filtros actuales.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between gap-3 text-sm">
            <Link
              href={buildHref(Math.max(1, safePage - 1))}
              className={`px-4 py-2 glass rounded-lg ${safePage <= 1 ? "pointer-events-none opacity-40" : "text-slate-300 hover:text-white"}`}
            >
              ← Anterior
            </Link>
            <span className="text-slate-500">
              Mostrando {(safePage - 1) * PAGE_SIZE + 1}-{Math.min(safePage * PAGE_SIZE, totalRows)} de {totalRows}
            </span>
            <Link
              href={buildHref(Math.min(totalPages, safePage + 1))}
              className={`px-4 py-2 glass rounded-lg ${safePage >= totalPages ? "pointer-events-none opacity-40" : "text-slate-300 hover:text-white"}`}
            >
              Siguiente →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
