import Link from "next/link";

export default function Home() {
  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <section className="text-center py-12">
        <h1 className="text-5xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600">
          WMS RIGENTEC
        </h1>
        <p className="text-xl text-slate-400 max-w-2xl mx-auto">
          Sistema avanzado de gestión de inventario y ensamble para mangueras y conexiones industriales.
        </p>
      </section>

      {/* Main Modules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

        {/* Module 1: Catalog */}
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

        {/* Module 2: Inventory */}
        <Link href="/inventory" className="glass-card group hover:bg-emerald-900/10 block">
          <div className="flex justify-between items-start mb-4">
            <span className="text-4xl p-3 bg-emerald-500/10 rounded-xl group-hover:bg-emerald-500/20 transition-colors">🏭</span>
            <span className="text-xs font-bold bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded">STOCK</span>
          </div>
          <h2 className="text-2xl font-bold mb-2 group-hover:text-emerald-400 transition-colors">Inventario</h2>
          <p className="text-slate-400 text-sm">
            Control de existencias por ubicación, movimientos y auditorías de cíclicos.
          </p>
        </Link>

        {/* Module 3: Assembly */}
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

      {/* Recent Activity (Placeholder) */}
      <div className="glass-card mt-12 bg-white/5">
        <h3 className="text-lg font-bold mb-4 border-b border-white/5 pb-2">Actividad Reciente</h3>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 text-sm">
              <span className="w-2 h-2 rounded-full bg-cyan-500"></span>
              <span className="text-slate-400">10:4{i} AM</span>
              <span className="text-white">Movimiento de entrada: <span className="font-mono text-cyan-400">CON-R1AT-04</span></span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
