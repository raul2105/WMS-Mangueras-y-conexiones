import Link from "next/link";
import type { Prisma, ProductionOrderStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import { summarizePickListStatus } from "@/lib/sales/internal-orders";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

const STATUS_LABELS: Record<string, string> = {
  BORRADOR: "Borrador",
  ABIERTA: "Abierta",
  EN_PROCESO: "En proceso",
  COMPLETADA: "Completada",
  CANCELADA: "Cancelada",
};

const ACTIVE_DIRECT_PICK_STATUSES = ["DRAFT", "RELEASED", "IN_PROGRESS", "PARTIAL"] as const;

function parsePage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "--";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString("es-MX");
}

type SearchParams = {
  status?: string;
  page?: string;
};

export default async function ProductionPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const currentPage = parsePage(sp.page);
  const statusCandidate = sp.status?.trim();
  const statusFilter: ProductionOrderStatus | undefined =
    statusCandidate && statusCandidate in STATUS_LABELS ? (statusCandidate as ProductionOrderStatus) : undefined;
  const where: Prisma.ProductionOrderWhereInput | undefined = statusFilter ? { status: statusFilter } : undefined;

  const [orders, totalCount, filteredCount, statusCounts, activeDirectPickOrders] = await Promise.all([
    prisma.productionOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        code: true,
        kind: true,
        status: true,
        customerName: true,
        priority: true,
        dueDate: true,
        assemblyWorkOrder: { select: { id: true } },
        warehouse: { select: { id: true, name: true, code: true } },
      },
    }),
    prisma.productionOrder.count(),
    prisma.productionOrder.count({ where }),
    prisma.productionOrder.groupBy({ by: ["status"], _count: { status: true } }),
    prisma.salesInternalOrder.findMany({
      where: {
        status: { not: "CANCELADA" },
        pickLists: {
          some: { status: { in: [...ACTIVE_DIRECT_PICK_STATUSES] } },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: {
        id: true,
        code: true,
        customerName: true,
        updatedAt: true,
        warehouse: { select: { code: true, name: true } },
        pickLists: {
          where: { status: { in: [...ACTIVE_DIRECT_PICK_STATUSES] } },
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: {
            code: true,
            status: true,
            updatedAt: true,
            targetLocation: { select: { code: true, name: true } },
          },
        },
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const statusCountMap = Object.fromEntries(statusCounts.map((row) => [row.status, row._count.status]));

  const buildHref = (page: number) => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (page > 1) params.set("page", String(page));
    const query = params.toString();
    return query ? `/production?${query}` : "/production";
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Producción de Ensambles</h1>
          <p className="text-slate-400 mt-1">Configuración exacta, reserva, surtido, WIP y consumo final.</p>
        </div>
        <div className="flex gap-3">
          <Link href="/production/orders/new" className="btn-primary">+ Nueva orden de ensamble</Link>
          <Link href="/production/orders/new/generic" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">+ Nueva Genérica</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass p-4 rounded-xl">
          <p className="text-xs text-slate-400 uppercase font-bold">1. Encabezado</p>
          <p className="text-slate-300 mt-2">Registra almacen, cliente, fecha compromiso y prioridad de la orden.</p>
        </div>
        <div className="glass p-4 rounded-xl">
          <p className="text-xs text-slate-400 uppercase font-bold">2. Configurar</p>
          <p className="text-slate-300 mt-2">Selecciona conexión entrada, manguera y conexión salida con stock exacto.</p>
        </div>
        <div className="glass p-4 rounded-xl">
          <p className="text-xs text-slate-400 uppercase font-bold">3. Ejecutar</p>
          <p className="text-slate-300 mt-2">Libera surtido, mueve a WIP y realiza el consumo final para cerrar.</p>
        </div>
      </div>

      <div className="glass-card space-y-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Surtidos directos activos</h2>
            <p className="text-sm text-slate-400 mt-1">
              Top 10 pedidos con picking independiente en curso.
            </p>
          </div>
          <Link href="/production/requests" className="text-sm text-cyan-300 hover:text-white">
            Ver pedidos de surtido
          </Link>
        </div>

        {activeDirectPickOrders.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-8 text-center text-sm text-slate-400">
            No hay surtidos directos activos.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 border-b border-white/10">
                  <th className="text-left py-3">Pedido</th>
                  <th className="text-left py-3">Cliente</th>
                  <th className="text-left py-3">Almacen</th>
                  <th className="text-left py-3">Pick list</th>
                  <th className="text-left py-3">Estado</th>
                  <th className="text-left py-3">Destino</th>
                  <th className="text-left py-3">Actualizado</th>
                  <th className="text-right py-3">Accion</th>
                </tr>
              </thead>
              <tbody>
                {activeDirectPickOrders.map((order) => {
                  const activePickList = order.pickLists[0] ?? null;
                  return (
                    <tr key={order.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-3 font-mono text-slate-200">{order.code}</td>
                      <td className="py-3 text-slate-300">{order.customerName ?? "--"}</td>
                      <td className="py-3 text-slate-300">
                        {order.warehouse ? `${order.warehouse.code} (${order.warehouse.name})` : "--"}
                      </td>
                      <td className="py-3 text-slate-300">{activePickList?.code ?? "--"}</td>
                      <td className="py-3 text-slate-300">{summarizePickListStatus(activePickList?.status)}</td>
                      <td className="py-3 text-slate-300">
                        {activePickList?.targetLocation ? `${activePickList.targetLocation.code} - ${activePickList.targetLocation.name}` : "--"}
                      </td>
                      <td className="py-3 text-slate-400">{formatDateTime(activePickList?.updatedAt ?? order.updatedAt)}</td>
                      <td className="py-3 text-right">
                        <Link href={`/production/fulfillment/${order.id}`} className="text-cyan-400 hover:text-cyan-300">
                          Operar surtido
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="glass-card space-y-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Ordenes recientes</h2>
            <p className="text-sm text-slate-400 mt-1">
              {filteredCount.toLocaleString("es-MX")} de {totalCount.toLocaleString("es-MX")} ordenes
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/production"
              className={`px-3 py-1.5 rounded-lg text-sm glass ${!statusFilter ? "bg-white/10 text-white font-semibold" : "text-slate-400 hover:text-white"}`}
            >
              Todas ({totalCount})
            </Link>
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <Link
                key={key}
                href={`/production?status=${key}`}
                className={`px-3 py-1.5 rounded-lg text-sm glass ${statusFilter === key ? "bg-white/10 text-white font-semibold" : "text-slate-400 hover:text-white"}`}
              >
                {label} ({statusCountMap[key] ?? 0})
              </Link>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-white/10">
                <th className="text-left py-3">Codigo</th>
                <th className="text-left py-3">Tipo</th>
                <th className="text-left py-3">Estado</th>
                <th className="text-left py-3">Almacen</th>
                <th className="text-left py-3">Cliente</th>
                <th className="text-left py-3">Prioridad</th>
                <th className="text-left py-3">Entrega</th>
                <th className="text-right py-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const isPendingAssemblyConfig =
                  order.kind === "ASSEMBLY_3PIECE" &&
                  order.status === "BORRADOR" &&
                  !order.assemblyWorkOrder;
                const displayStatus = isPendingAssemblyConfig
                  ? "PENDIENTE CONFIG"
                  : (STATUS_LABELS[order.status] ?? order.status.replace("_", " "));
                const actionHref = isPendingAssemblyConfig
                  ? `/production/orders/new?orderId=${order.id}`
                  : `/production/orders/${order.id}`;
                const actionLabel = isPendingAssemblyConfig ? "Continuar configuracion" : "Ver detalle";

                return (
                  <tr key={order.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-3 font-mono text-slate-200">{order.code}</td>
                    <td className="py-3 text-slate-400">{order.kind === "ASSEMBLY_3PIECE" ? "ENSAMBLE 3P" : "GENERICA"}</td>
                    <td className="py-3 text-slate-300">{displayStatus}</td>
                    <td className="py-3 text-slate-300">
                      {order.warehouse.name} ({order.warehouse.code})
                    </td>
                    <td className="py-3 text-slate-400">{order.customerName ?? "--"}</td>
                    <td className="py-3 text-slate-300">{order.priority}</td>
                    <td className="py-3 text-slate-400">
                      {order.dueDate ? new Date(order.dueDate).toLocaleDateString("es-MX") : "--"}
                    </td>
                    <td className="py-3 text-right">
                      <Link href={actionHref} className="text-cyan-400 hover:text-cyan-300">
                        {actionLabel}
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-500">
                    No hay ordenes para el filtro seleccionado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="mt-2 flex items-center justify-between gap-3 text-sm">
            <Link
              href={buildHref(Math.max(1, safePage - 1))}
              className={`px-4 py-2 glass rounded-lg ${safePage <= 1 ? "pointer-events-none opacity-40" : "text-slate-300 hover:text-white"}`}
            >
              ← Anterior
            </Link>
            <span className="text-slate-500">
              Pagina {safePage} de {totalPages}
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
