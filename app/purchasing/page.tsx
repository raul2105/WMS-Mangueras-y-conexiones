import Link from "next/link";
import prisma from "@/lib/prisma";

export const revalidate = 30;

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

export default async function PurchasingPage() {
  const [
    totalSuppliers,
    statusCounts,
    recentOrders,
  ] = await Promise.all([
    prisma.supplier.count({ where: { isActive: true } }),
    prisma.purchaseOrder.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.purchaseOrder.findMany({
      take: 8,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        folio: true,
        status: true,
        supplier: { select: { name: true } },
        _count: { select: { lines: true } },
      },
    }),
  ]);

  const countsByStatus = Object.fromEntries(statusCounts.map((s) => [s.status, s._count._all]));
  const openCount = (countsByStatus["CONFIRMADA"] ?? 0) + (countsByStatus["EN_TRANSITO"] ?? 0) + (countsByStatus["PARCIAL"] ?? 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-orange-400 to-amber-400">
            Compras
          </h1>
          <p className="text-slate-400 mt-1">Gestión de proveedores y órdenes de compra.</p>
        </div>
        <div className="flex gap-3">
          <Link href="/purchasing/orders/new" className="btn-primary">+ Nueva OC</Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-card text-center">
          <p className="text-3xl font-bold text-orange-400">{openCount}</p>
          <p className="text-sm text-slate-400 mt-1">OCs activas</p>
        </div>
        <div className="glass-card text-center">
          <p className="text-3xl font-bold text-amber-400">{countsByStatus["EN_TRANSITO"] ?? 0}</p>
          <p className="text-sm text-slate-400 mt-1">En tránsito</p>
        </div>
        <div className="glass-card text-center">
          <p className="text-3xl font-bold text-slate-300">{countsByStatus["BORRADOR"] ?? 0}</p>
          <p className="text-sm text-slate-400 mt-1">Borradores</p>
        </div>
        <div className="glass-card text-center">
          <p className="text-3xl font-bold text-cyan-400">{totalSuppliers}</p>
          <p className="text-sm text-slate-400 mt-1">Proveedores activos</p>
        </div>
      </div>

      {/* Accesos rápidos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link href="/purchasing/orders" className="glass-card group hover:bg-orange-900/10 block">
          <div className="flex items-center gap-4">
            <span className="text-3xl p-3 bg-orange-500/10 rounded-xl group-hover:bg-orange-500/20 transition-colors">📋</span>
            <div>
              <h2 className="text-lg font-bold group-hover:text-orange-400 transition-colors">Órdenes de Compra</h2>
              <p className="text-sm text-slate-400">Crear, gestionar y recibir órdenes de compra.</p>
            </div>
          </div>
        </Link>
        <Link href="/purchasing/suppliers" className="glass-card group hover:bg-cyan-900/10 block">
          <div className="flex items-center gap-4">
            <span className="text-3xl p-3 bg-cyan-500/10 rounded-xl group-hover:bg-cyan-500/20 transition-colors">🏢</span>
            <div>
              <h2 className="text-lg font-bold group-hover:text-cyan-400 transition-colors">Proveedores</h2>
              <p className="text-sm text-slate-400">Catálogo de proveedores y productos vinculados.</p>
            </div>
          </div>
        </Link>
      </div>

      {/* Órdenes recientes */}
      <div className="glass-card">
        <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-2">
          <h3 className="text-lg font-bold">Órdenes Recientes</h3>
          <Link href="/purchasing/orders" className="text-xs text-orange-400 hover:underline">Ver todas →</Link>
        </div>
        {recentOrders.length === 0 ? (
          <p className="text-slate-500 text-sm">No hay órdenes de compra aún.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 border-b border-white/10">
                  <th className="text-left py-2">Folio</th>
                  <th className="text-left py-2">Proveedor</th>
                  <th className="text-left py-2">Estado</th>
                  <th className="text-right py-2">Líneas</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => (
                  <tr key={order.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-2">
                      <Link href={`/purchasing/orders/${order.id}`} className="text-orange-400 hover:underline font-mono text-xs">
                        {order.folio}
                      </Link>
                    </td>
                    <td className="py-2 text-slate-300">{order.supplier.name}</td>
                    <td className="py-2">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${STATUS_COLORS[order.status] ?? "text-slate-400 bg-slate-500/20"}`}>
                        {STATUS_LABELS[order.status] ?? order.status}
                      </span>
                    </td>
                    <td className="py-2 text-right text-slate-400">{order._count.lines}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
