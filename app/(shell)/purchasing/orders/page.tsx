import Link from "next/link";
import prisma from "@/lib/prisma";
import { getSessionContext } from "@/lib/auth/session-context";
import { pageGuard } from "@/components/rbac/PageGuard";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { Table, TableRow, TableWrap, Td, Th } from "@/components/ui/table";
import {
  buildPurchaseOrderPresetWhere,
  getPurchaseOrderPresetLabel,
  isPurchaseOrderPresetFilter,
} from "@/lib/purchasing/purchase-order-presets";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;

const STATUS_LABELS: Record<string, string> = {
  BORRADOR: "Borrador",
  CONFIRMADA: "Confirmada",
  EN_TRANSITO: "En Tránsito",
  RECIBIDA: "Recibida",
  PARCIAL: "Parcial",
  CANCELADA: "Cancelada",
};

const STATUS_BADGE_VARIANTS: Record<string, "neutral" | "accent" | "success" | "warning" | "danger"> = {
  BORRADOR: "neutral",
  CONFIRMADA: "accent",
  EN_TRANSITO: "warning",
  RECIBIDA: "success",
  PARCIAL: "warning",
  CANCELADA: "danger",
};

type SearchParams = { status?: string; page?: string };
type PurchaseOrderSearchParams = SearchParams & { preset?: string };

function parsePage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-MX");
}

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<PurchaseOrderSearchParams>;
}) {
  await pageGuard("purchasing.view");
  const sp = await searchParams;
  const sessionCtx = await getSessionContext();
  const canManagePurchasing =
    sessionCtx.isSystemAdmin || sessionCtx.permissions.includes("purchasing.manage");
  const presetFilter = isPurchaseOrderPresetFilter(sp.preset) ? sp.preset : undefined;
  const statusFilter = !presetFilter ? (sp.status as
    | "BORRADOR"
    | "CONFIRMADA"
    | "EN_TRANSITO"
    | "RECIBIDA"
    | "PARCIAL"
    | "CANCELADA"
    | undefined) : undefined;
  const currentPage = parsePage(sp.page);

  const presetWhere = buildPurchaseOrderPresetWhere(presetFilter);
  const where = statusFilter ? { status: statusFilter } : presetWhere;

  const [
    orders,
    totalCount,
    filteredCount,
    draftCount,
    confirmedCount,
    transitCount,
    partialCount,
    receivedCount,
    overdueCount,
    dueTodayCount,
  ] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        folio: true,
        status: true,
        expectedDate: true,
        supplier: { select: { name: true, code: true, businessName: true } },
        _count: { select: { lines: true, receipts: true } },
        lines: { select: { qtyOrdered: true, qtyReceived: true } },
      },
    }),
    prisma.purchaseOrder.count(),
    prisma.purchaseOrder.count({ where }),
    prisma.purchaseOrder.count({ where: buildPurchaseOrderPresetWhere("borrador") }),
    prisma.purchaseOrder.count({ where: buildPurchaseOrderPresetWhere("confirmadas") }),
    prisma.purchaseOrder.count({ where: buildPurchaseOrderPresetWhere("en_transito") }),
    prisma.purchaseOrder.count({ where: buildPurchaseOrderPresetWhere("parciales") }),
    prisma.purchaseOrder.count({ where: buildPurchaseOrderPresetWhere("recibidas") }),
    prisma.purchaseOrder.count({ where: buildPurchaseOrderPresetWhere("vencidas") }),
    prisma.purchaseOrder.count({ where: buildPurchaseOrderPresetWhere("por_recibir_hoy") }),
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  const buildHref = (page: number) => {
    const params = new URLSearchParams();
    if (presetFilter) params.set("preset", presetFilter);
    else if (statusFilter) params.set("status", statusFilter);
    if (page > 1) params.set("page", String(page));
    const query = params.toString();
    return query ? `/purchasing/orders?${query}` : "/purchasing/orders";
  };

  const filterButtons = [
    { key: "todas", label: `Todas (${totalCount})` },
    { key: "borrador", label: `${getPurchaseOrderPresetLabel("borrador")} (${draftCount})` },
    { key: "confirmadas", label: `${getPurchaseOrderPresetLabel("confirmadas")} (${confirmedCount})` },
    { key: "en_transito", label: `${getPurchaseOrderPresetLabel("en_transito")} (${transitCount})` },
    { key: "parciales", label: `${getPurchaseOrderPresetLabel("parciales")} (${partialCount})` },
    { key: "recibidas", label: `${getPurchaseOrderPresetLabel("recibidas")} (${receivedCount})` },
    { key: "vencidas", label: `${getPurchaseOrderPresetLabel("vencidas")} (${overdueCount})` },
    { key: "por_recibir_hoy", label: `${getPurchaseOrderPresetLabel("por_recibir_hoy")} (${dueTodayCount})` },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Compras"
        title="Órdenes de compra"
        description="Lista operativa por preset. El detalle y las acciones de gestión solo aparecen para roles autorizados."
        meta={`${filteredCount} órdenes registradas`}
        actions={
          <>
            <Link href="/purchasing" className={buttonStyles({ variant: "secondary" })}>
              Compras
            </Link>
            {canManagePurchasing ? (
              <Link href="/purchasing/orders/new" className={buttonStyles()}>
                + Nueva OC
              </Link>
            ) : null}
          </>
        }
      />

      <SectionCard
        title="Presets operativos"
        description="Filtra por ciclo operativo sin perder el contexto de la lista."
        contentClassName="space-y-3"
      >
        <div className="flex flex-wrap gap-2">
          {filterButtons.map((filter) => (
            <Link
              key={filter.key}
              href={filter.key === "todas" ? "/purchasing/orders" : `/purchasing/orders?preset=${filter.key}`}
              className={buttonStyles({
                variant: presetFilter === filter.key || (filter.key === "todas" && !presetFilter && !statusFilter)
                  ? "primary"
                  : "secondary",
                size: "sm",
              })}
            >
              {filter.label}
            </Link>
          ))}
        </div>
        {!canManagePurchasing ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-secondary)] px-3 py-2 text-sm text-[var(--text-secondary)]">
            Vista de solo lectura para tu rol. No se muestran enlaces de gestión ni rutas restringidas.
          </div>
        ) : null}
      </SectionCard>

      {orders.length === 0 ? (
        <EmptyState
          title={statusFilter ? `No hay órdenes con estado "${STATUS_LABELS[statusFilter]}"` : "No hay órdenes de compra"}
          description="Cambia el filtro o crea la primera orden si tu rol lo permite."
          actions={
            canManagePurchasing ? (
              <Link href="/purchasing/orders/new" className={buttonStyles({ size: "sm" })}>
                + Crear primera OC
              </Link>
            ) : undefined
          }
        />
      ) : (
        <SectionCard
          title="Listado de órdenes"
          description={`Página ${safePage} de ${totalPages}`}
          footer={
            totalPages > 1 ? (
              <div className="flex w-full items-center justify-between gap-2 text-sm">
                <Link
                  href={buildHref(Math.max(1, safePage - 1))}
                  className={buttonStyles({
                    variant: "secondary",
                    size: "sm",
                    className: safePage <= 1 ? "pointer-events-none opacity-40" : "",
                  })}
                >
                  Anterior
                </Link>
                <span className="text-[var(--text-muted)]">
                  Página {safePage} de {totalPages}
                </span>
                <Link
                  href={buildHref(Math.min(totalPages, safePage + 1))}
                  className={buttonStyles({
                    variant: "secondary",
                    size: "sm",
                    className: safePage >= totalPages ? "pointer-events-none opacity-40" : "",
                  })}
                >
                  Siguiente
                </Link>
              </div>
            ) : null
          }
          contentClassName="space-y-0 px-0 py-0"
        >
          <div className="grid gap-3 md:hidden">
            {orders.map((order) => {
              const totalOrdered = order.lines.reduce((sum, line) => sum + line.qtyOrdered, 0);
              const totalReceived = order.lines.reduce((sum, line) => sum + line.qtyReceived, 0);
              const pct = totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0;

              return (
                <article
                  key={order.id}
                  className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--surface-secondary)] p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Folio</p>
                      {canManagePurchasing ? (
                        <Link href={`/purchasing/orders/${order.id}`} className="font-mono text-sm font-semibold text-[var(--text-primary)] hover:text-[var(--text-accent)]">
                          {order.folio}
                        </Link>
                      ) : (
                        <p className="font-mono text-sm font-semibold text-[var(--text-primary)]">{order.folio}</p>
                      )}
                    </div>
                    <Badge variant={STATUS_BADGE_VARIANTS[order.status] ?? "neutral"} size="sm">
                      {STATUS_LABELS[order.status] ?? order.status}
                    </Badge>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="col-span-2">
                      <p className="text-xs text-[var(--text-muted)]">Proveedor</p>
                      <p className="text-[var(--text-primary)]">
                        <span className="font-mono text-xs text-[var(--text-muted)] mr-1">{order.supplier.code}</span>
                        {order.supplier.businessName ?? order.supplier.name}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--text-muted)]">Esperada</p>
                      <p className="text-[var(--text-secondary)]">{formatDate(order.expectedDate)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--text-muted)]">Líneas</p>
                      <p className="font-semibold text-[var(--text-primary)]">{order._count.lines}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--text-muted)]">% recibido</p>
                      <p className="font-semibold text-[var(--status-info)]">{pct}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--text-muted)]">Recepciones</p>
                      <p className="font-semibold text-[var(--text-primary)]">{order._count.receipts}</p>
                    </div>
                  </div>

                  {canManagePurchasing ? (
                    <div className="mt-4">
                      <Link href={`/purchasing/orders/${order.id}`} className={buttonStyles({ variant: "secondary", size: "sm", fullWidth: true })}>
                        Ver detalle
                      </Link>
                    </div>
                  ) : (
                    <p className="mt-4 text-xs text-[var(--text-muted)]">Detalle no disponible para tu rol.</p>
                  )}
                </article>
              );
            })}
          </div>

          <div className="hidden md:block">
            <TableWrap dense striped label="Listado de órdenes de compra" className="rounded-none border-0 shadow-none">
              <Table className="min-w-[760px]">
                <thead>
                  <tr>
                    <Th>Folio</Th>
                    <Th>Proveedor</Th>
                    <Th>Estado</Th>
                    <Th>Fecha esperada</Th>
                    <Th className="text-right">Líneas</Th>
                    <Th className="text-right">% recibido</Th>
                    <Th className="text-right">Acción</Th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => {
                    const totalOrdered = order.lines.reduce((sum, line) => sum + line.qtyOrdered, 0);
                    const totalReceived = order.lines.reduce((sum, line) => sum + line.qtyReceived, 0);
                    const pct = totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0;

                    return (
                      <TableRow key={order.id}>
                        <Td className="font-mono text-xs text-[var(--text-primary)]">
                          {canManagePurchasing ? (
                            <Link href={`/purchasing/orders/${order.id}`} className="font-semibold text-[var(--text-primary)] hover:text-[var(--text-accent)]">
                              {order.folio}
                            </Link>
                          ) : (
                            order.folio
                          )}
                        </Td>
                        <Td className="text-[var(--text-secondary)]">
                          <span className="text-xs font-mono text-[var(--text-muted)] mr-1">{order.supplier.code}</span>
                          {order.supplier.businessName ?? order.supplier.name}
                        </Td>
                        <Td>
                          <Badge variant={STATUS_BADGE_VARIANTS[order.status] ?? "neutral"} size="sm">
                            {STATUS_LABELS[order.status] ?? order.status}
                          </Badge>
                        </Td>
                        <Td className="text-sm text-[var(--text-secondary)]">{formatDate(order.expectedDate)}</Td>
                        <Td className="text-right font-semibold text-[var(--text-primary)]">{order._count.lines}</Td>
                        <Td className="text-right font-semibold text-[var(--status-info)]">{pct}%</Td>
                        <Td className="text-right">
                          {canManagePurchasing ? (
                            <Link href={`/purchasing/orders/${order.id}`} className={buttonStyles({ variant: "ghost", size: "sm" })}>
                              Ver detalle
                            </Link>
                          ) : (
                            <span className="text-xs text-[var(--text-muted)]">Solo lectura</span>
                          )}
                        </Td>
                      </TableRow>
                    );
                  })}
                </tbody>
              </Table>
            </TableWrap>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
