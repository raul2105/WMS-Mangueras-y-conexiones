import Link from "next/link";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  IN: "Entrada",
  OUT: "Salida",
  TRANSFER: "Traslado",
  ADJUSTMENT: "Ajuste",
};

const MOVEMENT_TYPE_COLORS: Record<string, string> = {
  IN: "text-emerald-400",
  OUT: "text-red-400",
  TRANSFER: "text-blue-400",
  ADJUSTMENT: "text-amber-400",
};

type SearchParams = {
  code?: string;
  location?: string;
  type?: "IN" | "OUT" | "TRANSFER" | "ADJUSTMENT";
  reference?: string;
  from?: string;
  to?: string;
  page?: string;
};

export default async function KardexPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const code = String(sp.code ?? "").trim();
  const location = String(sp.location ?? "").trim();
  const reference = String(sp.reference ?? "").trim();
  const type = sp.type;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const fromDate = sp.from ? new Date(`${sp.from}T00:00:00`) : null;
  const toDate = sp.to ? new Date(`${sp.to}T23:59:59`) : null;

  const where = {
    ...(type ? { type } : {}),
    ...(reference ? { reference: { contains: reference } } : {}),
    ...(fromDate || toDate
      ? {
          createdAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
    ...(code
      ? {
          product: {
            OR: [{ sku: { contains: code } }, { referenceCode: { contains: code } }],
          },
        }
      : {}),
    ...(location
      ? {
          OR: [
            { location: { code: { contains: location } } },
            { fromLocationCode: { contains: location } },
            { toLocationCode: { contains: location } },
          ],
        }
      : {}),
  };

  const [total, movements] = await Promise.all([
    prisma.inventoryMovement.count({ where }),
    prisma.inventoryMovement.findMany({
      where,
      include: {
        product: { select: { sku: true, name: true } },
        location: { select: { code: true } },
      },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  function buildPageUrl(p: number) {
    const params = new URLSearchParams();
    if (code) params.set("code", code);
    if (location) params.set("location", location);
    if (reference) params.set("reference", reference);
    if (type) params.set("type", type);
    if (sp.from) params.set("from", sp.from);
    if (sp.to) params.set("to", sp.to);
    params.set("page", String(p));
    return `/inventory/kardex?${params.toString()}`;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Kardex</h1>
          <p className="text-slate-400 mt-1">Movimientos por SKU, ubicación, tipo, referencia y rango de fechas.</p>
        </div>
        <Link href="/inventory" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">← Inventario</Link>
      </div>

      <form className="glass-card grid grid-cols-1 md:grid-cols-6 gap-4" method="get">
        <label className="space-y-1 md:col-span-2">
          <span className="text-sm text-slate-400">SKU/Referencia</span>
          <input name="code" defaultValue={code} className="w-full px-4 py-3 glass rounded-lg" placeholder="CON-R1AT-04" />
        </label>

        <label className="space-y-1">
          <span className="text-sm text-slate-400">Ubicación</span>
          <input name="location" defaultValue={location} className="w-full px-4 py-3 glass rounded-lg" placeholder="A-12-04" />
        </label>

        <label className="space-y-1">
          <span className="text-sm text-slate-400">Tipo</span>
          <select name="type" defaultValue={type ?? ""} className="w-full px-4 py-3 glass rounded-lg">
            <option value="">Todos</option>
            <option value="IN">Entrada</option>
            <option value="OUT">Salida</option>
            <option value="TRANSFER">Traslado</option>
            <option value="ADJUSTMENT">Ajuste</option>
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-sm text-slate-400">Desde</span>
          <input name="from" type="date" defaultValue={sp.from ?? ""} className="w-full px-4 py-3 glass rounded-lg" />
        </label>

        <label className="space-y-1">
          <span className="text-sm text-slate-400">Hasta</span>
          <input name="to" type="date" defaultValue={sp.to ?? ""} className="w-full px-4 py-3 glass rounded-lg" />
        </label>

        <label className="space-y-1 md:col-span-4">
          <span className="text-sm text-slate-400">Referencia</span>
          <input name="reference" defaultValue={reference} className="w-full px-4 py-3 glass rounded-lg" placeholder="Pedido/OT/OC" />
        </label>

        <div className="md:col-span-2 flex items-end justify-end gap-3">
          <Link href="/inventory/kardex" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">Limpiar</Link>
          <button type="submit" className="btn-primary">Filtrar</button>
        </div>
      </form>

      {/* Export button — shares same filters via URL */}
      <div className="flex justify-end">
        {(() => {
          const exportParams = new URLSearchParams();
          if (code) exportParams.set("code", code);
          if (location) exportParams.set("location", location);
          if (reference) exportParams.set("reference", reference);
          if (type) exportParams.set("type", type);
          if (sp.from) exportParams.set("from", sp.from);
          if (sp.to) exportParams.set("to", sp.to);
          return (
            <a
              href={`/api/export/kardex?${exportParams.toString()}`}
              className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white text-sm"
              download
            >
              ↓ Exportar CSV
            </a>
          );
        })()}
      </div>

      <div className="glass-card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Movimientos</h2>
          <span className="text-sm text-slate-400">
            {total.toLocaleString("es-MX")} registros · página {page} de {totalPages || 1}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-white/10">
                <th className="text-left py-3">Fecha</th>
                <th className="text-left py-3">Tipo</th>
                <th className="text-left py-3">SKU</th>
                <th className="text-left py-3">Producto</th>
                <th className="text-left py-3">Ubicación</th>
                <th className="text-right py-3">Cantidad</th>
                <th className="text-left py-3">Referencia</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((movement) => (
                <tr key={movement.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-3 text-slate-300 whitespace-nowrap">
                    {new Date(movement.createdAt).toLocaleString("es-MX")}
                  </td>
                  <td className="py-3">
                    <span className={`text-xs font-bold ${MOVEMENT_TYPE_COLORS[movement.type] ?? "text-slate-400"}`}>
                      {MOVEMENT_TYPE_LABELS[movement.type] ?? movement.type}
                    </span>
                  </td>
                  <td className="py-3 font-mono text-slate-200">{movement.product.sku}</td>
                  <td className="py-3 text-slate-300">{movement.product.name}</td>
                  <td className="py-3 text-slate-400">
                    {movement.type === "TRANSFER"
                      ? `${movement.fromLocationCode ?? "--"} → ${movement.toLocationCode ?? "--"}`
                      : movement.location?.code ?? "--"}
                  </td>
                  <td className="py-3 text-right text-white font-semibold">{movement.quantity}</td>
                  <td className="py-3 text-slate-400">{movement.reference ?? "--"}</td>
                </tr>
              ))}
              {movements.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    No hay movimientos para los filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6 pt-4 border-t border-white/10">
            {page > 1 && (
              <Link href={buildPageUrl(page - 1)} className="px-3 py-1 glass rounded text-sm text-slate-300 hover:text-white">
                ← Anterior
              </Link>
            )}
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const p = totalPages <= 7 ? i + 1 : page <= 4 ? i + 1 : page >= totalPages - 3 ? totalPages - 6 + i : page - 3 + i;
              return (
                <Link
                  key={p}
                  href={buildPageUrl(p)}
                  className={`px-3 py-1 rounded text-sm ${p === page ? "bg-cyan-500/30 text-cyan-300 font-bold" : "glass text-slate-400 hover:text-white"}`}
                >
                  {p}
                </Link>
              );
            })}
            {page < totalPages && (
              <Link href={buildPageUrl(page + 1)} className="px-3 py-1 glass rounded text-sm text-slate-300 hover:text-white">
                Siguiente →
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
