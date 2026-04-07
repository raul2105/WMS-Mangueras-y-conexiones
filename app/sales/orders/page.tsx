import Link from "next/link";
import type { Prisma, SalesInternalOrderStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import { pageGuard } from "@/components/rbac/PageGuard";
import { PageHeader } from "@/components/ui/page-header";
import { SALES_INTERNAL_ORDER_STATUS_LABELS, SALES_INTERNAL_ORDER_STATUS_STYLES } from "@/lib/sales/internal-orders";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;

type SearchParams = { status?: string; page?: string };

function parsePage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export default async function SalesOrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await pageGuard("sales.view");
  const sp = await searchParams;
  const currentPage = parsePage(sp.page);
  const statusFilter: SalesInternalOrderStatus | undefined =
    sp.status === "BORRADOR" || sp.status === "CONFIRMADA" || sp.status === "CANCELADA" ? sp.status : undefined;
  const where: Prisma.SalesInternalOrderWhereInput | undefined = statusFilter ? { status: statusFilter } : undefined;

  const [orders, totalCount, filteredCount, groupedStatuses] = await Promise.all([
    prisma.salesInternalOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        code: true,
        status: true,
        customerName: true,
        dueDate: true,
        warehouse: { select: { code: true, name: true } },
        requestedByUser: { select: { name: true, email: true } },
        _count: { select: { lines: true } },
      },
    }),
    prisma.salesInternalOrder.count(),
    prisma.salesInternalOrder.count({ where }),
    prisma.salesInternalOrder.groupBy({ by: ["status"], _count: { status: true } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const statusCountMap = Object.fromEntries(groupedStatuses.map((row) => [row.status, row._count.status]));

  const buildHref = (page: number) => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (page > 1) params.set("page", String(page));
    const qs = params.toString();
    return qs ? `/sales/orders?${qs}` : "/sales/orders";
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pedidos internos"
        description="Captura y seguimiento comercial con enlace a demanda de ensamble cuando aplique."
        meta={`${filteredCount.toLocaleString("es-MX")} de ${totalCount.toLocaleString("es-MX")} pedidos`}
        actions={<Link href="/sales/orders/new" className="btn-primary">+ Nuevo pedido</Link>}
      />

      <div className="flex flex-wrap gap-2">
        <Link href="/sales/orders" className={`rounded-lg px-3 py-1.5 text-sm glass ${!statusFilter ? "bg-white/10 text-white font-semibold" : "text-slate-400 hover:text-white"}`}>
          Todos ({totalCount})
        </Link>
        {Object.entries(SALES_INTERNAL_ORDER_STATUS_LABELS).map(([status, label]) => (
          <Link key={status} href={`/sales/orders?status=${status}`} className={`rounded-lg px-3 py-1.5 text-sm glass ${statusFilter === status ? "bg-white/10 text-white font-semibold" : "text-slate-400 hover:text-white"}`}>
            {label} ({statusCountMap[status] ?? 0})
          </Link>
        ))}
      </div>

      <div className="glass-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-slate-400">
              <th className="py-3 text-left">Codigo</th>
              <th className="py-3 text-left">Cliente</th>
              <th className="py-3 text-left">Estado</th>
              <th className="py-3 text-left">Almacen</th>
              <th className="py-3 text-left">Solicitado por</th>
              <th className="py-3 text-left">Entrega</th>
              <th className="py-3 text-right">Lineas</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-10 text-center text-slate-500">No hay pedidos para el filtro seleccionado.</td>
              </tr>
            ) : orders.map((order) => (
              <tr key={order.id} className="border-b border-white/5 hover:bg-white/5">
                <td className="py-3">
                  <Link href={`/sales/orders/${order.id}`} className="font-mono text-cyan-300 hover:text-white">{order.code}</Link>
                </td>
                <td className="py-3 text-slate-300">{order.customerName ?? "--"}</td>
                <td className="py-3">
                  <span className={`rounded px-2 py-1 text-xs font-semibold ${SALES_INTERNAL_ORDER_STATUS_STYLES[order.status]}`}>
                    {SALES_INTERNAL_ORDER_STATUS_LABELS[order.status]}
                  </span>
                </td>
                <td className="py-3 text-slate-400">{order.warehouse ? `${order.warehouse.code} - ${order.warehouse.name}` : "--"}</td>
                <td className="py-3 text-slate-400">{order.requestedByUser?.name ?? order.requestedByUser?.email ?? "--"}</td>
                <td className="py-3 text-slate-400">{order.dueDate ? new Date(order.dueDate).toLocaleDateString("es-MX") : "--"}</td>
                <td className="py-3 text-right text-slate-300">{order._count.lines}</td>
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
