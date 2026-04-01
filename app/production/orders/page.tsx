import prisma from "@/lib/prisma";
import Link from "next/link";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;

function parsePage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export default async function ProductionOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const sp = await searchParams;
  const currentPage = parsePage(sp.page);

  const [totalCount, orders] = await Promise.all([
    prisma.productionOrder.count(),
    prisma.productionOrder.findMany({
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
        warehouse: { select: { id: true, name: true, code: true } },
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const buildHref = (page: number) => (page > 1 ? `/production/orders?page=${page}` : "/production/orders");

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
            + Nueva Ensamble Exacta
          </Link>
          <Link href="/production/orders/new/generic" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">
            + Nueva Genérica
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
              {orders.map((order) => (
                <tr key={order.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-3 font-mono text-slate-200">{order.code}</td>
                  <td className="py-3 text-slate-400">{order.kind === "ASSEMBLY_3PIECE" ? "ENSAMBLE 3P" : "GENERICA"}</td>
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
                  <td colSpan={8} className="py-10 text-center text-slate-500">
                    No hay ordenes de ensamble registradas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
