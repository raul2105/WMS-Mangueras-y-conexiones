import Link from "next/link";

export default function ProductionPage() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Ensamble</h1>
          <p className="text-slate-400 mt-1">
            Ordenes de produccion y control de ensambles.
          </p>
        </div>
      </div>

      <div className="glass-card p-6">
        <div className="flex items-start gap-4">
          <div className="text-3xl">🛠️</div>
          <div>
            <h2 className="text-xl font-bold text-white">Modulo en preparacion</h2>
            <p className="text-slate-400 mt-2">
              Aqui se gestionaran las ordenes de ensamble, listas de materiales y
              consumos de inventario.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass p-4 rounded-xl">
          <p className="text-xs text-slate-400 uppercase font-bold">Ordenes</p>
          <p className="text-slate-500 mt-2">Gestione ordenes de ensamble.</p>
          <Link href="/production/orders" className="text-cyan-400 text-sm mt-3 inline-block">
            Abrir ordenes →
          </Link>
        </div>
        <div className="glass p-4 rounded-xl">
          <p className="text-xs text-slate-400 uppercase font-bold">Listas de materiales</p>
          <p className="text-slate-500 mt-2">Proximamente</p>
        </div>
        <div className="glass p-4 rounded-xl">
          <p className="text-xs text-slate-400 uppercase font-bold">Consumos</p>
          <p className="text-slate-500 mt-2">Proximamente</p>
        </div>
      </div>

      <div className="glass-card p-6">
        <p className="text-slate-400">
          Si quieres, puedo empezar el flujo de ensamble con una orden basica y
          reserva de materiales.
        </p>
        <Link href="/inventory" className="btn-primary mt-4 inline-block">
          Ir a Inventario
        </Link>
      </div>
    </div>
  );
}
