import Link from "next/link";

export default function ProductionPage() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Producción de Ensambles</h1>
          <p className="text-slate-400 mt-1">Configuración exacta, reserva, surtido, WIP y consumo final.</p>
        </div>
        <div className="flex gap-3">
          <Link href="/production/orders/new" className="btn-primary">+ Nueva orden exacta</Link>
          <Link href="/production/orders" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">Ver órdenes</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass p-4 rounded-xl">
          <p className="text-xs text-slate-400 uppercase font-bold">1. Configurar</p>
          <p className="text-slate-300 mt-2">Selecciona conexión entrada, manguera y conexión salida.</p>
        </div>
        <div className="glass p-4 rounded-xl">
          <p className="text-xs text-slate-400 uppercase font-bold">2. Surtir</p>
          <p className="text-slate-300 mt-2">La orden se crea solo con inventario exacto y pick por ubicación.</p>
        </div>
        <div className="glass p-4 rounded-xl">
          <p className="text-xs text-slate-400 uppercase font-bold">3. Consumir</p>
          <p className="text-slate-300 mt-2">Material pasa a WIP y luego a consumo final para cierre operativo.</p>
        </div>
      </div>
    </div>
  );
}
