import Link from "next/link";
import prisma from "@/lib/prisma";

export const revalidate = 30;

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

export default async function Home() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    totalProducts,
    totalLocations,
    openOrders,
    todayMovements,
    recentMovements,
    inventoryTotals,
    openPurchaseOrders,
  ] = await Promise.all([
    prisma.product.count(),
    prisma.location.count({ where: { isActive: true } }),
    prisma.productionOrder.count({ where: { status: { in: ["ABIERTA", "EN_PROCESO"] } } }),
    prisma.inventoryMovement.count({ where: { createdAt: { gte: today } } }),
    prisma.inventoryMovement.findMany({
      take: 7,
      orderBy: { createdAt: "desc" },
      include: { product: { select: { sku: true, name: true } } },
    }),
    prisma.inventory.aggregate({ _sum: { quantity: true, available: true } }),
    prisma.purchaseOrder.count({ where: { status: { in: ["CONFIRMADA", "EN_TRANSITO", "PARCIAL"] } } }),
  ]);

  const totalStock = inventoryTotals._sum.quantity ?? 0;
  const totalAvailable = inventoryTotals._sum.available ?? 0;

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <section className="text-center py-10">
        <h1 className="text-5xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600">
          WMS RIGENTEC
        </h1>
        <p className="text-xl text-slate-400 max-w-2xl mx-auto">
          Sistema avanzado de gestión de inventario y ensamble para mangueras y conexiones industriales.
        </p>
      </section>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="glass-card text-center">
          <p className="text-3xl font-bold text-cyan-400">{totalProducts.toLocaleString("es-MX")}</p>
          <p className="text-sm text-slate-400 mt-1">Productos en catálogo</p>
        </div>
        <div className="glass-card text-center">
          <p className="text-3xl font-bold text-emerald-400">{totalStock.toLocaleString("es-MX")}</p>
          <p className="text-sm text-slate-400 mt-1">Unidades en stock</p>
        </div>
        <div className="glass-card text-center">
          <p className="text-3xl font-bold text-purple-400">{openOrders.toLocaleString("es-MX")}</p>
          <p className="text-sm text-slate-400 mt-1">Órdenes abiertas</p>
        </div>
        <div className="glass-card text-center">
          <p className="text-3xl font-bold text-amber-400">{todayMovements.toLocaleString("es-MX")}</p>
          <p className="text-sm text-slate-400 mt-1">Movimientos hoy</p>
        </div>
        <Link href="/purchasing/orders" className="glass-card text-center hover:bg-orange-900/10 block">
          <p className="text-3xl font-bold text-orange-400">{openPurchaseOrders.toLocaleString("es-MX")}</p>
          <p className="text-sm text-slate-400 mt-1">OC en tránsito</p>
        </Link>
      </div>

      {/* Main Modules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Link href="/catalog" className="glass-card group hover:bg-cyan-900/10 block">
          <div className="flex justify-between items-start mb-4">
            <span className="text-4xl p-3 bg-cyan-500/10 rounded-xl group-hover:bg-cyan-500/20 transition-colors">📦</span>
            <span className="text-xs font-bold bg-cyan-500/20 text-cyan-400 px-2 py-1 rounded">MASTER</span>
          </div>
          <h2 className="text-2xl font-bold mb-2 group-hover:text-cyan-400 transition-colors">Catálogo</h2>
          <p className="text-slate-400 text-sm">
            Gestión de SKUs con atributos técnicos dinámicos (Presión, Material, Normas).
          </p>
        </Link>

        <Link href="/inventory" className="glass-card group hover:bg-emerald-900/10 block">
          <div className="flex justify-between items-start mb-4">
            <span className="text-4xl p-3 bg-emerald-500/10 rounded-xl group-hover:bg-emerald-500/20 transition-colors">🏭</span>
            <span className="text-xs font-bold bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded">STOCK</span>
          </div>
          <h2 className="text-2xl font-bold mb-2 group-hover:text-emerald-400 transition-colors">Inventario</h2>
          <p className="text-slate-400 text-sm">
            Control de existencias por ubicación. Disponible:{" "}
            <span className="text-emerald-300 font-semibold">{totalAvailable.toLocaleString("es-MX")} u.</span>
          </p>
        </Link>

        <Link href="/production" className="glass-card group hover:bg-purple-900/10 block">
          <div className="flex justify-between items-start mb-4">
            <span className="text-4xl p-3 bg-purple-500/10 rounded-xl group-hover:bg-purple-500/20 transition-colors">🔧</span>
            <span className="text-xs font-bold bg-purple-500/20 text-purple-400 px-2 py-1 rounded">BOMs</span>
          </div>
          <h2 className="text-2xl font-bold mb-2 group-hover:text-purple-400 transition-colors">Ensamble</h2>
          <p className="text-slate-400 text-sm">
            Fabricación de mangueras (Corte + Crimpado) y gestión de órdenes de trabajo.
          </p>
        </Link>
      </div>

      {/* Recent Activity */}
      <div className="glass-card mt-4">
        <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-2">
          <h3 className="text-lg font-bold">Actividad Reciente</h3>
          <Link href="/inventory/kardex" className="text-xs text-cyan-400 hover:underline">
            Ver todo →
          </Link>
        </div>
        {recentMovements.length === 0 ? (
          <p className="text-slate-500 text-sm">Sin movimientos registrados aún.</p>
        ) : (
          <div className="space-y-3">
            {recentMovements.map((mv) => (
              <div key={mv.id} className="flex items-center gap-4 text-sm">
                <span className={`w-16 text-xs font-bold ${MOVEMENT_TYPE_COLORS[mv.type] ?? "text-slate-400"}`}>
                  {MOVEMENT_TYPE_LABELS[mv.type] ?? mv.type}
                </span>
                <span className="font-mono text-cyan-400 text-xs">{mv.product.sku}</span>
                <span className="text-slate-300 truncate flex-1">{mv.product.name}</span>
                <span className="text-slate-500 text-xs whitespace-nowrap">
                  {mv.createdAt.toLocaleString("es-MX", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}
                </span>
                <span className="text-slate-200 font-semibold w-12 text-right">
                  {mv.type === "OUT" ? "-" : mv.type === "ADJUSTMENT" && mv.quantity < 0 ? "" : "+"}{mv.quantity}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { href: "/inventory/receive", label: "Recibir stock", icon: "⬇️", color: "text-emerald-400" },
          { href: "/inventory/pick", label: "Despachar", icon: "⬆️", color: "text-red-400" },
          { href: "/inventory/transfer", label: "Trasladar", icon: "↔️", color: "text-blue-400" },
          { href: "/warehouse", label: "Almacenes", icon: "🏪", color: "text-amber-400" },
        ].map(({ href, label, icon, color }) => (
          <Link
            key={href}
            href={href}
            className="glass-card flex items-center gap-3 py-3 hover:bg-white/5"
          >
            <span className="text-2xl">{icon}</span>
            <span className={`text-sm font-medium ${color}`}>{label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
