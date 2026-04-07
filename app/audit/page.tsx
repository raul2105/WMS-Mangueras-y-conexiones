import Link from "next/link";
import prisma from "@/lib/prisma";
import { pageGuard } from "@/components/rbac/PageGuard";
import { buttonStyles } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { Table, TableEmptyRow, TableRow, TableWrap, Td, Th } from "@/components/ui/table";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type SearchParams = {
  entityType?: string;
  action?: string;
  actor?: string;
  source?: string;
  entityId?: string;
  from?: string;
  to?: string;
  page?: string;
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await pageGuard("audit.view");
  const sp = await searchParams;

  const entityType = String(sp.entityType ?? "").trim();
  const action = String(sp.action ?? "").trim();
  const actor = String(sp.actor ?? "").trim();
  const source = String(sp.source ?? "").trim();
  const entityId = String(sp.entityId ?? "").trim();
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const fromDate = sp.from ? new Date(`${sp.from}T00:00:00`) : null;
  const toDate = sp.to ? new Date(`${sp.to}T23:59:59`) : null;

  const where = {
    ...(entityType ? { entityType: { contains: entityType } } : {}),
    ...(action ? { action: { contains: action } } : {}),
    ...(actor ? { actor: { contains: actor } } : {}),
    ...(source ? { source: { contains: source } } : {}),
    ...(entityId ? { entityId: { contains: entityId } } : {}),
    ...(fromDate || toDate
      ? {
          createdAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  function buildPageUrl(p: number) {
    const params = new URLSearchParams();
    if (entityType) params.set("entityType", entityType);
    if (action) params.set("action", action);
    if (actor) params.set("actor", actor);
    if (source) params.set("source", source);
    if (entityId) params.set("entityId", entityId);
    if (sp.from) params.set("from", sp.from);
    if (sp.to) params.set("to", sp.to);
    params.set("page", String(p));
    return `/audit?${params.toString()}`;
  }

  const exportParams = new URLSearchParams();
  if (entityType) exportParams.set("entityType", entityType);
  if (action) exportParams.set("action", action);
  if (actor) exportParams.set("actor", actor);
  if (source) exportParams.set("source", source);
  if (entityId) exportParams.set("entityId", entityId);
  if (sp.from) exportParams.set("from", sp.from);
  if (sp.to) exportParams.set("to", sp.to);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Auditoria"
        description="Bitacora de acciones criticas del sistema para trazabilidad operativa."
        actions={
          <a href={`/api/export/audit?${exportParams.toString()}`} className={buttonStyles({ variant: "secondary" })} download>
            Exportar CSV
          </a>
        }
      />

      <SectionCard title="Filtros" description="Filtra por entidad, accion, actor, origen, entidad puntual y fechas.">
        <form className="grid grid-cols-1 gap-4 md:grid-cols-6" method="get">
          <Input name="entityType" defaultValue={entityType} label="Entidad" placeholder="INVENTORY_MOVEMENT" />
          <Input name="action" defaultValue={action} label="Accion" placeholder="CREATE" />
          <Input name="actor" defaultValue={actor} label="Actor" placeholder="Operador" />
          <Input name="source" defaultValue={source} label="Origen" placeholder="inventory.pick" />
          <Input name="entityId" defaultValue={entityId} rootClassName="md:col-span-2" label="Entity ID" placeholder="UUID" />
          <Input name="from" type="date" defaultValue={sp.from ?? ""} label="Desde" />
          <Input name="to" type="date" defaultValue={sp.to ?? ""} label="Hasta" />
          <div className="md:col-span-6 flex items-end justify-end gap-3">
            <Link href="/audit" className={buttonStyles({ variant: "secondary" })}>
              Limpiar
            </Link>
            <button type="submit" className={buttonStyles()}>
              Filtrar
            </button>
          </div>
        </form>
      </SectionCard>

      <SectionCard title="Eventos" description={`${total.toLocaleString("es-MX")} registros · pagina ${page} de ${totalPages || 1}`}>
        <TableWrap striped>
          <Table>
            <thead>
              <tr>
                <Th>Fecha</Th>
                <Th>Entidad</Th>
                <Th>Entity ID</Th>
                <Th>Accion</Th>
                <Th>Actor</Th>
                <Th>Origen</Th>
                <Th className="text-center">Before</Th>
                <Th className="text-center">After</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <Td className="whitespace-nowrap">{new Date(row.createdAt).toLocaleString("es-MX")}</Td>
                  <Td className="font-semibold text-[var(--text-primary)]">{row.entityType}</Td>
                  <Td className="font-mono text-xs">{row.entityId ?? "--"}</Td>
                  <Td>{row.action}</Td>
                  <Td>{row.actor ?? "--"}</Td>
                  <Td>{row.source ?? "--"}</Td>
                  <Td className="text-center">{row.before ? "Si" : "No"}</Td>
                  <Td className="text-center">{row.after ? "Si" : "No"}</Td>
                </TableRow>
              ))}
              {rows.length === 0 ? <TableEmptyRow colSpan={8}>No hay eventos para los filtros seleccionados.</TableEmptyRow> : null}
            </tbody>
          </Table>
        </TableWrap>

        {totalPages > 1 && (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {page > 1 && (
              <Link href={buildPageUrl(page - 1)} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                Anterior
              </Link>
            )}
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const p = totalPages <= 7 ? i + 1 : page <= 4 ? i + 1 : page >= totalPages - 3 ? totalPages - 6 + i : page - 3 + i;
              return (
                <Link
                  key={p}
                  href={buildPageUrl(p)}
                  className={buttonStyles({ variant: p === page ? "primary" : "secondary", size: "sm" })}
                >
                  {p}
                </Link>
              );
            })}
            {page < totalPages && (
              <Link href={buildPageUrl(page + 1)} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                Siguiente
              </Link>
            )}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
