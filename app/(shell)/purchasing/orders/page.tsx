import Link from "next/link";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;

const STATUS_LABELS: Record<string, string> = {
  BORRADOR: "Borrador",
  CONFIRMADA: "Confirmada",
  EN_TRANSITO: "En Tránsito",
  RECIBIDA: "Recibida",
  PARCIAL: "Parcial",
  CANCELADA: "Cancelada",
};

const STATUS_COLORS: Record<string, string> = {
  BORRADOR: "text-slate-400 bg-slate-500/20",
  CONFIRMADA: "text-blue-400 bg-blue-500/20",
  EN_TRANSITO: "text-amber-400 bg-amber-500/20",
  RECIBIDA: "text-emerald-400 bg-emerald-500/20",
  PARCIAL: "text-orange-400 bg-orange-500/20",
  CANCELADA: "text-red-400 bg-red-500/20",
};

type SearchParams = { status?: string };

function parsePage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams & { page?: string }>;
}) {
  const sp = await searchParams;
  const statusFilter = sp.status as "BORRADOR" | "CONFIRMADA" | "EN_TRANSITO" | "RECIBIDA" | "PARCIAL" | "CANCELADA" | undefined;
  const currentPage = parsePage(sp.page);

  const where = statusFilter ? { status: statusFilter } : {};

  const [orders, totalCount, filteredCount] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        folio: true,
        status: true,
        expectedDate: true,
        supplier: { select: { name: true, code: true } },
        _count: { select: { lines: true, receipts: true } },
        lines: { select: { qtyOrdered: true, qtyReceived: true } },
      },
    }),
    prisma.purchaseOrder.count(),
    prisma.purchaseOrder.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  const buildHref = (page: number) => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (page > 1) params.set("page", String(page));
    const query = params.toString();
    return query ? `/purchasing/orders?${query}` : "/purchasing/orders";
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
            Órdenes de Compra
          </h1>
          <p className="text-slate-400 mt-1">{filteredCount} órdenes registradas.</p>
        </div>
        <div className="flex gap-3">
          <Link href="/purchasing" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">← Compras</Link>
          <Link href="/purchasing/orders/new" className="btn-primary">+ Nueva OC</Link>
        </div>
      </div>

      {/* Filtros por estado */}
      <div className="flex flex-wrap gap-2">
        <Link
          href="/purchasing/orders"
          className={`px-3 py-1.5 rounded-lg text-sm glass ${!statusFilter ? "bg-white/10 text-white font-bold" : "text-slate-400 hover:text-white"}`}
        >
          Todas ({totalCount})
        </Link>
        {Object.entries(STATUS_LABELS).map(([key, label]) => (
          <Link
            key={key}
            href={`/purchasing/orders?status=${key}`}
            className={`px-3 py-1.5 rounded-lg text-sm glass ${statusFilter === key ? "bg-white/10 text-white font-bold" : "text-slate-400 hover:text-white"}`}
          >
            {label}
          </Link>
        ))}
      </div>

      {orders.length === 0 ? (
        <div className="glass-card text-center py-12">
          <p className="text-slate-500 mb-4">
            {statusFilter ? `No hay órdenes con estado "${STATUS_LABELS[statusFilter]}".` : "No hay órdenes de compra."}
          </p>
          <Link href="/purchasing/orders/new" className="btn-primary">+ Crear primera OC</Link>
        </div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-white/10">
                <th className="text-left py-3">Folio</th>
                <th className="text-left py-3">Proveedor</th>
                <th className="text-left py-3">Estado</th>
                <th className="text-left py-3">Fecha Esperada</th>
                <th className="text-right py-3">Líneas</th>
                <th className="text-right py-3">% Recibido</th>
                <th className="py-3"></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const totalOrdered = order.lines.reduce((s, l) => s + l.qtyOrdered, 0);
                const totalReceived = order.lines.reduce((s, l) => s + l.qtyReceived, 0);
                const pct = totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0;

                return (
                  <tr key={order.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-3">
                      <Link href={`/purchasing/orders/${order.id}`} className="text-orange-400 hover:underline font-mono text-xs font-bold">
                        {order.folio}
                      </Link>
                    </td>
                    <td className="py-3 text-slate-300">
                      <span className="text-xs text-slate-500 font-mono mr-1">{order.supplier.code}</span>
                      {order.supplier.name}
                    </td>
                    <td className="py-3">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${STATUS_COLORS[order.status] ?? "text-slate-400 bg-slate-500/20"}`}>
                        {STATUS_LABELS[order.status] ?? order.status}
                      </span>
                    </td>
                    <td className="py-3 text-slate-400 text-xs">
                      {order.expectedDate ? new Date(order.expectedDate).toLocaleDateString("es-MX") : "—"}
                    </td>
                    <td className="py-3 text-right text-slate-300">{order._count.lines}</td>
                    <td className="py-3 text-right">
                      <span className={`text-xs font-bold ${pct === 100 ? "text-emerald-400" : pct > 0 ? "text-orange-400" : "text-slate-400"}`}>
                        {pct}%
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <Link href={`/purchasing/orders/${order.id}`} className="text-xs text-cyan-400 hover:underline">Ver →</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between gap-3 text-sm">
          <Link
            href={buildHref(Math.max(1, safePage - 1))}
            className={`px-4 py-2 glass rounded-lg ${safePage <= 1 ? "pointer-events-none opacity-40" : "text-slate-300 hover:text-white"}`}
          >
            ← Anterior
          </Link>
          <span className="text-slate-500">
            Página {safePage} de {totalPages}
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
  );
}
