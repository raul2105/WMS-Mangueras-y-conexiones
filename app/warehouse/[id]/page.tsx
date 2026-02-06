import Link from "next/link";
import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function WarehouseDetailPage({ params }: PageProps) {
  const { id } = await params;
  if (!id) {
    notFound();
  }

  const warehouse = await prisma.warehouse.findUnique({
    where: { id },
  });

  if (!warehouse) {
    notFound();
  }

  const locations = await prisma.location.findMany({
    where: { warehouseId: warehouse.id },
    orderBy: [{ zone: "asc" }, { aisle: "asc" }, { rack: "asc" }],
    include: {
      _count: {
        select: { inventory: true },
      },
    },
  });

  const totalLocations = locations.length;
  const activeLocations = locations.filter((l) => l.isActive).length;
  const occupiedLocations = locations.filter((l) => l._count.inventory > 0).length;

  // Group locations by zone
  const locationsByZone = locations.reduce((acc, loc) => {
    const zone = loc.zone || "SIN ZONA";
    if (!acc[zone]) acc[zone] = [];
    acc[zone].push(loc);
    return acc;
  }, {} as Record<string, typeof locations>);

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <Link href="/warehouse" className="hover:text-white">
          Almacenes
        </Link>
        <span>/</span>
        <span className="text-white">{warehouse.name}</span>
      </div>

      {/* Header Card */}
      <div className="glass-card p-8">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-500">
              {warehouse.name}
            </h1>
            <div className="flex items-center gap-3 mt-2">
              <span className="bg-slate-700 px-2 py-1 rounded text-sm text-slate-300 font-mono">
                {warehouse.code}
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
          </div>
          <Link
            href={`/warehouse/${warehouse.id}/locations/new`}
            className="btn-primary"
          >
            + Nueva Ubicación
          </Link>
        </div>

        {warehouse.description && (
          <p className="text-slate-300 mb-4">{warehouse.description}</p>
        )}

        {warehouse.address && (
          <p className="text-slate-400 text-sm">📍 {warehouse.address}</p>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="glass p-4 rounded-lg">
            <p className="text-xs text-slate-400 uppercase font-bold">Total Ubicaciones</p>
            <p className="text-2xl font-bold text-white">{totalLocations}</p>
          </div>
          <div className="glass p-4 rounded-lg">
            <p className="text-xs text-slate-400 uppercase font-bold">Activas</p>
            <p className="text-2xl font-bold text-green-400">{activeLocations}</p>
          </div>
          <div className="glass p-4 rounded-lg">
            <p className="text-xs text-slate-400 uppercase font-bold">Con Inventario</p>
            <p className="text-2xl font-bold text-cyan-400">{occupiedLocations}</p>
          </div>
        </div>
      </div>

      {/* Locations by Zone */}
      {Object.keys(locationsByZone).length === 0 ? (
        <div className="glass-card text-center py-12">
          <span className="text-6xl block mb-4">📍</span>
          <p className="text-slate-400 text-lg">No hay ubicaciones en este almacén</p>
          <p className="text-slate-500 text-sm mt-2">
            Crea ubicaciones para organizar tu inventario
          </p>
          <Link
            href={`/warehouse/${warehouse.id}/locations/new`}
            className="btn-primary mt-6 inline-block"
          >
            + Crear Ubicación
          </Link>
        </div>
      ) : (
        Object.entries(locationsByZone).map(([zone, locations]) => (
          <div key={zone} className="glass-card">
            <h2 className="text-xl font-bold mb-4 text-cyan-400">
              Zona: {zone} ({locations.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {locations.map((location) => (
                <div
                  key={location.id}
                  className="glass p-4 rounded-lg border border-white/5 hover:border-cyan-500/50 transition-colors"
                >
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-white font-mono">{location.code}</h3>
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        location.isActive
                          ? "bg-green-500/20 text-green-400"
                          : "bg-red-500/20 text-red-400"
                      }`}
                    >
                      {location.isActive ? "✓" : "✗"}
                    </span>
                  </div>
                  <p className="text-sm text-slate-400 mb-3">{location.name}</p>

                  <div className="flex gap-2 text-xs text-slate-500">
                    {location.aisle && <span>Pasillo: {location.aisle}</span>}
                    {location.rack && <span>Rack: {location.rack}</span>}
                    {location.level && <span>Nivel: {location.level}</span>}
                  </div>

                  {location.capacity && (
                    <p className="text-xs text-slate-600 mt-2">
                      Capacidad: {location.capacity}
                    </p>
                  )}

                  <div className="mt-3 pt-3 border-t border-white/5 flex justify-between items-center">
                    <span className="text-sm text-slate-400">
                      {location._count.inventory} productos
                    </span>
                    {location._count.inventory > 0 && (
                      <span className="text-xs text-cyan-400">📦</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
