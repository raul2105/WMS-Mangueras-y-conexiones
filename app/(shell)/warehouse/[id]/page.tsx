import Link from "next/link";
import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import { pageGuard } from "@/components/rbac/PageGuard";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatCard } from "@/components/ui/stat-card";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function WarehouseDetailPage({ params }: PageProps) {
  await pageGuard("warehouse.manage");
  const { id } = await params;
  if (!id) {
    notFound();
  }

  const warehouse = await prisma.warehouse.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      address: true,
      isActive: true,
    },
  });

  if (!warehouse) {
    notFound();
  }

  const locations = await prisma.location.findMany({
    where: { warehouseId: warehouse.id },
    orderBy: [{ zone: "asc" }, { aisle: "asc" }, { rack: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      zone: true,
      aisle: true,
      rack: true,
      level: true,
      capacity: true,
      isActive: true,
      _count: {
        select: { inventory: true },
      },
    },
  });

  const totalLocations = locations.length;
  const activeLocations = locations.filter((location) => location.isActive).length;
  const occupiedLocations = locations.filter((location) => location._count.inventory > 0).length;

  const locationsByZone = locations.reduce((acc, location) => {
    const zone = location.zone || "SIN ZONA";
    if (!acc[zone]) acc[zone] = [];
    acc[zone].push(location);
    return acc;
  }, {} as Record<string, typeof locations>);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Almacenes"
        title={warehouse.name}
        description={warehouse.description || "Detalle operativo del almacén, su estado y sus ubicaciones."}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-[var(--text-muted)]">{warehouse.code}</span>
            <Badge variant={warehouse.isActive ? "success" : "danger"} size="sm">
              {warehouse.isActive ? "Activo" : "Inactivo"}
            </Badge>
          </div>
        }
        actions={
          <>
            <Link href="/warehouse" className={buttonStyles({ variant: "secondary" })}>
              Almacenes
            </Link>
            <Link href={`/warehouse/${warehouse.id}/edit`} className={buttonStyles({ variant: "secondary" })}>
              Editar
            </Link>
            <Link href={`/warehouse/${warehouse.id}/locations/new`} className={buttonStyles()}>
              + Nueva ubicación
            </Link>
          </>
        }
      />

      {warehouse.address ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--surface-secondary)] px-4 py-3 text-sm text-[var(--text-secondary)]">
          <span className="font-semibold text-[var(--text-primary)]">Dirección:</span> {warehouse.address}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Total ubicaciones" value={totalLocations.toLocaleString("es-MX")} meta="Configuradas en este almacén" />
        <StatCard label="Ubicaciones activas" value={activeLocations.toLocaleString("es-MX")} meta="Disponibles para operar" tone="success" />
        <StatCard label="Con inventario" value={occupiedLocations.toLocaleString("es-MX")} meta="Ubicaciones con stock" tone="accent" />
      </div>

      <SectionCard title="Ubicaciones" description="Agrupadas por zona para revisar capacidad y estado operativo.">
        {Object.keys(locationsByZone).length === 0 ? (
          <EmptyState
            title="No hay ubicaciones en este almacén"
            description="Crea la primera ubicación para empezar a organizar el inventario."
            actions={
              <Link href={`/warehouse/${warehouse.id}/locations/new`} className={buttonStyles({ size: "sm" })}>
                + Crear ubicación
              </Link>
            }
            compact
          />
        ) : (
          <div className="space-y-4">
            {Object.entries(locationsByZone).map(([zone, zoneLocations]) => (
              <SectionCard
                key={zone}
                title={`Zona: ${zone}`}
                description={`${zoneLocations.length} ubicaciones`}
                contentClassName="space-y-3"
              >
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {zoneLocations.map((location) => (
                    <article key={location.id} className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--surface-primary)] p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="font-mono text-xs text-[var(--text-muted)]">{location.code}</p>
                          <p className="font-semibold text-[var(--text-primary)]">{location.name}</p>
                        </div>
                        <Badge variant={location.isActive ? "success" : "danger"} size="sm">
                          {location.isActive ? "Activa" : "Inactiva"}
                        </Badge>
                      </div>

                      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <dt className="text-xs text-[var(--text-muted)]">Pasillo</dt>
                          <dd className="text-[var(--text-secondary)]">{location.aisle || "—"}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-[var(--text-muted)]">Rack</dt>
                          <dd className="text-[var(--text-secondary)]">{location.rack || "—"}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-[var(--text-muted)]">Nivel</dt>
                          <dd className="text-[var(--text-secondary)]">{location.level || "—"}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-[var(--text-muted)]">Capacidad</dt>
                          <dd className="text-[var(--text-secondary)]">{location.capacity ?? "—"}</dd>
                        </div>
                      </dl>

                      <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--border-default)] pt-3 text-sm">
                        <span className="text-[var(--text-secondary)]">{location._count.inventory} productos</span>
                        <Link href={`/labels/location/${location.id}`} className={buttonStyles({ variant: "ghost", size: "sm" })}>
                          Etiqueta
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              </SectionCard>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
