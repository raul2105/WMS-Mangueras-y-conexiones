import Link from "next/link";
import prisma from "@/lib/prisma";
import { pageGuard } from "@/components/rbac/PageGuard";
import { buttonStyles } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { SALES_INTERNAL_ORDER_STATUS_LABELS } from "@/lib/sales/internal-orders";

export const dynamic = "force-dynamic";

export default async function SalesPage() {
  await pageGuard("sales.view");

  const [orderCount, groupedStatuses, linkedProductionCount, recentOrders] = await Promise.all([
    prisma.salesInternalOrder.count(),
    prisma.salesInternalOrder.groupBy({ by: ["status"], _count: { status: true } }),
    prisma.productionOrder.count({ where: { sourceDocumentType: "SalesInternalOrder" } }),
    prisma.salesInternalOrder.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        code: true,
        status: true,
        customerName: true,
        dueDate: true,
        warehouse: { select: { code: true, name: true } },
        _count: { select: { lines: true } },
      },
    }),
  ]);

  const counts = Object.fromEntries(groupedStatuses.map((row) => [row.status, row._count.status]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Comercial"
        description="Consulta comercial de disponibilidad, equivalencias y pedidos internos sin invadir la operacion fisica."
        meta={`${orderCount.toLocaleString("es-MX")} pedidos internos registrados`}
        actions={
          <>
            <Link href="/sales/availability" className={buttonStyles({ variant: "secondary" })}>
              Disponibilidad
            </Link>
            <Link href="/sales/equivalences" className={buttonStyles({ variant: "secondary" })}>
              Equivalencias
            </Link>
            <Link href="/sales/orders/new" className={buttonStyles()}>
              + Nuevo pedido
            </Link>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <div className="glass-card">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Pedidos internos</p>
          <p className="mt-3 text-3xl font-semibold text-white">{orderCount}</p>
        </div>
        <div className="glass-card">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Borrador</p>
          <p className="mt-3 text-3xl font-semibold text-white">{counts.BORRADOR ?? 0}</p>
        </div>
        <div className="glass-card">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Confirmados</p>
          <p className="mt-3 text-3xl font-semibold text-white">{counts.CONFIRMADA ?? 0}</p>
        </div>
        <div className="glass-card">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Ordenes de ensamble ligadas</p>
          <p className="mt-3 text-3xl font-semibold text-white">{linkedProductionCount}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <section className="glass-card space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">Pedidos recientes</h2>
              <p className="text-sm text-slate-400">Seguimiento comercial y enlace a produccion cuando aplique.</p>
            </div>
            <Link href="/sales/orders" className="text-sm text-cyan-300 hover:text-white">
              Ver todos
            </Link>
          </div>

          {recentOrders.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-8 text-center text-sm text-slate-400">
              Todavia no hay pedidos internos.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400">
                    <th className="py-3 text-left">Codigo</th>
                    <th className="py-3 text-left">Cliente</th>
                    <th className="py-3 text-left">Estado</th>
                    <th className="py-3 text-left">Almacen</th>
                    <th className="py-3 text-left">Entrega</th>
                    <th className="py-3 text-right">Lineas</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((order) => (
                    <tr key={order.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-3">
                        <Link href={`/sales/orders/${order.id}`} className="font-mono text-cyan-300 hover:text-white">
                          {order.code}
                        </Link>
                      </td>
                      <td className="py-3 text-slate-300">{order.customerName ?? "--"}</td>
                      <td className="py-3 text-slate-300">{SALES_INTERNAL_ORDER_STATUS_LABELS[order.status]}</td>
                      <td className="py-3 text-slate-400">{order.warehouse ? `${order.warehouse.code} - ${order.warehouse.name}` : "--"}</td>
                      <td className="py-3 text-slate-400">{order.dueDate ? new Date(order.dueDate).toLocaleDateString("es-MX") : "--"}</td>
                      <td className="py-3 text-right text-slate-300">{order._count.lines}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="glass-card space-y-4">
          <h2 className="text-lg font-semibold text-white">Acciones recomendadas</h2>
          <div className="space-y-3 text-sm text-slate-300">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              Consulta stock total, reservado y disponible por producto y por almacen antes de comprometer una venta.
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              Revisa equivalencias para ofrecer sustitutos cuando el SKU principal no tenga disponibilidad suficiente.
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              Genera demanda de ensamble solo para lineas tipo ASSEMBLY. La ejecucion fisica sigue en Produccion.
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
