import Link from "next/link";
import prisma from "@/lib/prisma";
import { buttonStyles } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { BoxIcon, InventoryIcon, WarehouseIcon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TableRow, TableWrap, Td, Th } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { pageGuard } from "@/components/rbac/PageGuard";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 24;

function parsePage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export default async function WarehousePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await pageGuard("warehouse.manage");
  const sp = await searchParams;
  const currentPage = parsePage(sp.page);

  const [totalCount, activeCount, totalLocations, warehouses] =
    await Promise.all([
      prisma.warehouse.count(),
      prisma.warehouse.count({ where: { isActive: true } }),
      prisma.location.count(),
      prisma.warehouse.findMany({
        orderBy: { name: "asc" },
        skip: (currentPage - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          address: true,
          isActive: true,
          _count: {
            select: { locations: true },
          },
        },
      }),
    ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  const buildHref = (page: number) =>
    page > 1 ? `/warehouse?page=${page}` : "/warehouse";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Almacenes"
        description="Gestiona almacenes activos, capacidad de ubicaciones y acceso a detalles operativos."
        meta={`${totalCount.toLocaleString("es-MX")} almacenes registrados`}
        actions={
          <Link href="/warehouse/new" className={buttonStyles()}>
            Nuevo almacen
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard
          label="Total almacenes"
          value={totalCount.toLocaleString("es-MX")}
          meta="Registrados en el maestro"
          icon={<WarehouseIcon className="h-5 w-5" />}
        />
        <StatCard
          label="Activos"
          value={activeCount.toLocaleString("es-MX")}
          meta="Disponibles para operacion"
          tone="success"
          icon={<BoxIcon className="h-5 w-5" />}
        />
        <StatCard
          label="Ubicaciones"
          value={totalLocations.toLocaleString("es-MX")}
          meta="Capacidad total configurada"
          tone="accent"
          icon={<InventoryIcon className="h-5 w-5" />}
        />
      </div>

      <SectionCard
        title="Listado de almacenes"
        description={`Pagina ${safePage} de ${totalPages}`}
        footer={
          totalPages > 1 ? (
            <div className="flex w-full items-center justify-between gap-2 text-sm">
              <Link
                href={buildHref(Math.max(1, safePage - 1))}
                className={buttonStyles({
                  variant: "secondary",
                  size: "sm",
                  className:
                    safePage <= 1 ? "pointer-events-none opacity-40" : "",
                })}
              >
                Anterior
              </Link>
              <span className="text-[var(--text-muted)]">
                {safePage} / {totalPages}
              </span>
              <Link
                href={buildHref(Math.min(totalPages, safePage + 1))}
                className={buttonStyles({
                  variant: "secondary",
                  size: "sm",
                  className:
                    safePage >= totalPages
                      ? "pointer-events-none opacity-40"
                      : "",
                })}
              >
                Siguiente
              </Link>
            </div>
          ) : null
        }
      >
        {warehouses.length === 0 ? (
          <EmptyState
            title="No hay almacenes registrados"
            description="Crea tu primer almacen para empezar a gestionar ubicaciones e inventario."
            actions={
              <Link
                href="/warehouse/new"
                className={buttonStyles({ size: "sm" })}
              >
                Crear almacen
              </Link>
            }
          />
        ) : (
          <>
            <div
              className="grid gap-3 md:hidden"
              data-mobile-card-list="warehouse"
            >
              {warehouses.map((warehouse) => (
                <article
                  key={warehouse.id}
                  className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-elevated)] p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="font-mono text-xs text-[var(--text-muted)]">
                        {warehouse.code}
                      </p>
                      <p className="font-medium text-[var(--text-primary)]">
                        {warehouse.name}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {warehouse.description || "--"}
                      </p>
                    </div>
                    <Badge variant={warehouse.isActive ? "success" : "danger"}>
                      {warehouse.isActive ? "Activo" : "Inactivo"}
                    </Badge>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-xs text-[var(--text-muted)]">
                        Ubicaciones
                      </dt>
                      <dd className="font-semibold text-[var(--text-primary)]">
                        {warehouse._count.locations}
                      </dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-xs text-[var(--text-muted)]">
                        Direccion
                      </dt>
                      <dd className="text-[var(--text-secondary)]">
                        {warehouse.address || "--"}
                      </dd>
                    </div>
                  </dl>
                  <Link
                    href={`/warehouse/${warehouse.id}`}
                    className={buttonStyles({
                      variant: "secondary",
                      size: "sm",
                      className: "mt-4 w-full",
                    })}
                  >
                    Ver detalle
                  </Link>
                </article>
              ))}
            </div>

            <div className="hidden md:block">
              <TableWrap striped>
                <Table className="min-w-[760px]">
                  <thead>
                    <tr>
                      <Th>Codigo</Th>
                      <Th>Almacen</Th>
                      <Th>Estado</Th>
                      <Th className="text-right">Ubicaciones</Th>
                      <Th>Direccion</Th>
                      <Th className="text-right">Accion</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {warehouses.map((warehouse) => (
                      <TableRow key={warehouse.id}>
                        <Td className="font-mono text-xs text-[var(--text-primary)]">
                          {warehouse.code}
                        </Td>
                        <Td>
                          <div className="space-y-1">
                            <p className="font-medium text-[var(--text-primary)]">
                              {warehouse.name}
                            </p>
                            <p className="text-xs text-[var(--text-muted)]">
                              {warehouse.description || "--"}
                            </p>
                          </div>
                        </Td>
                        <Td>
                          <Badge
                            variant={warehouse.isActive ? "success" : "danger"}
                          >
                            {warehouse.isActive ? "Activo" : "Inactivo"}
                          </Badge>
                        </Td>
                        <Td className="text-right font-semibold text-[var(--text-primary)]">
                          {warehouse._count.locations}
                        </Td>
                        <Td className="text-sm text-[var(--text-secondary)]">
                          {warehouse.address || "--"}
                        </Td>
                        <Td className="text-right">
                          <Link
                            href={`/warehouse/${warehouse.id}`}
                            className={buttonStyles({
                              variant: "ghost",
                              size: "sm",
                            })}
                          >
                            Ver detalle
                          </Link>
                        </Td>
                      </TableRow>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            </div>
          </>
        )}
      </SectionCard>
    </div>
  );
}
