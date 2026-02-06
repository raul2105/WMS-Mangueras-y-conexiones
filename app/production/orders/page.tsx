import prisma from "@/lib/prisma";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ProductionOrdersPage() {
  const orders = await prisma.productionOrder.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      warehouse: { select: { id: true, name: true, code: true } },
    },
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Ordenes de Ensamble</h1>
          <p className="text-slate-400 mt-1">Crea y da seguimiento a ordenes de produccion.</p>
        </div>
        <div className="flex gap-3">
          <Link href="/production" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">
            ← Ensamble
          </Link>
          <Link href="/production/orders/new" className="btn-primary">
            + Nueva Orden
          </Link>
        </div>
      </div>

      <div className="glass-card">
        <h2 className="text-lg font-bold mb-4">Ordenes recientes</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-white/10">
                <th className="text-left py-3">Codigo</th>
                <th className="text-left py-3">Estado</th>
                <th className="text-left py-3">Almacen</th>
                <th className="text-left py-3">Cliente</th>
                <th className="text-left py-3">Prioridad</th>
                <th className="text-left py-3">Entrega</th>
                <th className="text-right py-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-3 font-mono text-slate-200">{order.code}</td>
                  <td className="py-3 text-slate-300">{order.status.replace("_", " ")}</td>
                  <td className="py-3 text-slate-300">
                    {order.warehouse.name} ({order.warehouse.code})
                  </td>
                  <td className="py-3 text-slate-400">{order.customerName ?? "--"}</td>
                  <td className="py-3 text-slate-300">{order.priority}</td>
                  <td className="py-3 text-slate-400">
                    {order.dueDate ? new Date(order.dueDate).toLocaleDateString("es-MX") : "--"}
                  </td>
                  <td className="py-3 text-right">
                    <Link href={`/production/orders/${order.id}`} className="text-cyan-400 hover:text-cyan-300">
                      Ver detalle
                    </Link>
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">
                    No hay ordenes de ensamble registradas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
