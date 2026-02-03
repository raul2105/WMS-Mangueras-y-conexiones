import Link from "next/link";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function WarehousePage() {
  const warehouses = await prisma.warehouse.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: { locations: true },
      },
    },
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
            Almacenes
          </h1>
          <p className="text-slate-400 mt-1">Gestión de almacenes y ubicaciones</p>
        </div>
        <div className="flex gap-3">
          <Link href="/warehouse/new" className="btn-primary">
            + Nuevo Almacén
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass p-4 rounded-xl">
          <span className="text-sm text-slate-400 uppercase tracking-wider font-semibold block">Total Almacenes</span>
          <span className="text-2xl font-bold text-white mt-1">{warehouses.length}</span>
        </div>
        <div className="glass p-4 rounded-xl">
          <span className="text-sm text-slate-400 uppercase tracking-wider font-semibold block">Activos</span>
          <span className="text-2xl font-bold text-green-400 mt-1">
            {warehouses.filter((w) => w.isActive).length}
          </span>
        </div>
        <div className="glass p-4 rounded-xl">
          <span className="text-sm text-slate-400 uppercase tracking-wider font-semibold block">Total Ubicaciones</span>
          <span className="text-2xl font-bold text-cyan-400 mt-1">
            {warehouses.reduce((acc, w) => acc + w._count.locations, 0)}
          </span>
        </div>
      </div>

      {/* Warehouse List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {warehouses.map((warehouse) => (
          <Link
            key={warehouse.id}
            href={`/warehouse/${warehouse.id}`}
            className="glass-card group hover:border-cyan-500/50"
          >
            <div className="flex justify-between items-start mb-4">
              <span className="text-4xl p-3 bg-cyan-500/10 rounded-xl group-hover:bg-cyan-500/20 transition-colors">
                🏭
              </span>
              <span
                className={`text-xs font-bold px-2 py-1 rounded ${
                  warehouse.isActive
                    ? "bg-green-500/20 text-green-400"
                    : "bg-red-500/20 text-red-400"
                }`}
              >
                {warehouse.isActive ? "ACTIVO" : "INACTIVO"}
              </span>
            </div>

            <h2 className="text-xl font-bold text-white group-hover:text-cyan-400 transition-colors">
              {warehouse.name}
            </h2>
            <p className="text-sm text-slate-400 font-mono mt-1">{warehouse.code}</p>

            {warehouse.description && (
              <p className="text-sm text-slate-500 mt-3 line-clamp-2">{warehouse.description}</p>
            )}

            {warehouse.address && (
              <p className="text-xs text-slate-600 mt-2">📍 {warehouse.address}</p>
            )}

            <div className="mt-4 pt-4 border-t border-white/5 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-white">{warehouse._count.locations}</span>
                <span className="text-xs text-slate-400">ubicaciones</span>
              </div>
              <span className="text-sm text-cyan-400 group-hover:text-cyan-300">
                Ver detalle →
              </span>
            </div>
          </Link>
        ))}

        {warehouses.length === 0 && (
          <div className="col-span-full glass-card text-center py-12">
            <span className="text-6xl block mb-4">📦</span>
            <p className="text-slate-400 text-lg">No hay almacenes registrados</p>
            <p className="text-slate-500 text-sm mt-2">
              Crea tu primer almacén para empezar a gestionar ubicaciones
            </p>
            <Link href="/warehouse/new" className="btn-primary mt-6 inline-block">
              + Crear Almacén
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
