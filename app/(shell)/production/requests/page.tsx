/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma, SalesInternalOrderStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getSessionContext } from "@/lib/auth/session-context";
import { pageGuard } from "@/components/rbac/PageGuard";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { hasSalesWriteAccess, requireSalesWriteAccess } from "@/lib/rbac/sales";
import { pullSalesRequestOrder } from "@/lib/sales/request-service";
import { firstErrorMessage, salesInternalOrderTransitionSchema } from "@/lib/schemas/wms";
import { startPerf } from "@/lib/perf";
import { getRequestId } from "@/lib/request-meta";
import {
  getTakeOrderEligibility,
  getSalesOrderFlowStage,
  getSalesOrderFlowNarrative,
  SALES_ORDER_FLOW_STAGE_LABELS,
  SALES_INTERNAL_ORDER_STATUS_LABELS,
  SALES_INTERNAL_ORDER_STATUS_STYLES,
  type SalesOrderFlowStage,
} from "@/lib/sales/internal-orders";
import { buildSalesRequestVisibilityWhere, canManageAllSalesRequests } from "@/lib/sales/visibility";
import {
  evaluateFulfillmentSignals,
  isFulfillmentQueueFilter,
  matchQueueFilter,
  type FulfillmentQueueFilter,
} from "@/lib/dashboard/fulfillment-dashboard";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const STALE_HOURS = 4;
const OPEN_ASSEMBLY_STATUSES = new Set(["BORRADOR", "ABIERTA", "EN_PROCESO"]);

const QUEUE_LABELS: Record<FulfillmentQueueFilter, string> = {
  overdue: "Vencidos",
  today: "Vencen hoy",
  partial: "Parciales",
  stale: "Sin movimiento",
  unreleased: "Sin liberar",
  assembly_blocked: "Ensamble bloqueado",
};

type SearchParams = {
  status?: string;
  stage?: string;
  page?: string;
  customer?: string;
  queue?: string;
  ok?: string;
  error?: string;
};

const FLOW_STAGE_ORDER: SalesOrderFlowStage[] = [
  "captura",
  "por_asignar",
  "en_surtido",
  "listo_entrega",
  "entregado",
  "cancelado",
];

function parsePage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function isNextRedirectError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof (error as { digest?: unknown }).digest === "string" &&
      (error as { digest: string }).digest.startsWith("NEXT_REDIRECT"),
  );
}

function buildReturnHref(args: { status?: SalesInternalOrderStatus; customer?: string; queue?: FulfillmentQueueFilter; page: number }) {
  const params = new URLSearchParams();
  if (args.status) params.set("status", args.status);
  if (args.customer) params.set("customer", args.customer);
  if (args.queue) params.set("queue", args.queue);
  if (args.page > 1) params.set("page", String(args.page));
  const qs = params.toString();
  return qs ? `/production/requests?${qs}` : "/production/requests";
}

async function takeRequestFromList(formData: FormData) {
  "use server";
  const perf = startPerf("action.production.requests.list.pull");
  const requestId = await getRequestId();
  await requireSalesWriteAccess();
  const sessionCtx = await getSessionContext();
  const parsed = salesInternalOrderTransitionSchema.safeParse({
    orderId: String(formData.get("orderId") ?? "").trim(),
  });
  const returnToRaw = String(formData.get("returnTo") ?? "").trim();
  const returnTo = returnToRaw.startsWith("/production/requests") ? returnToRaw : "/production/requests";

  if (!parsed.success) {
    redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent(firstErrorMessage(parsed.error))}`);
  }

  if (!sessionCtx.user?.id) {
    redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent("Sesion invalida para tomar pedido")}`);
  }

  try {
    const servicePerf = startPerf("action.production.requests.list.pull.service");
    await pullSalesRequestOrder(prisma, {
      orderId: parsed.data.orderId,
      assignedToUserId: sessionCtx.user.id,
    });
    servicePerf.end({ requestId, orderId: parsed.data.orderId });
    perf.end({ requestId, orderId: parsed.data.orderId, ok: true });
    redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}ok=${encodeURIComponent("Pedido tomado y asignado")}`);
  } catch (error) {
    perf.end({ requestId, orderId: parsed.data.orderId, ok: false });
    if (isNextRedirectError(error)) throw error;
    const message = error instanceof Error ? error.message : "No se pudo tomar el pedido";
    redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
  }
}

export default async function ProductionRequestsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await pageGuard("sales.view");
  const [sp, sessionCtx] = await Promise.all([searchParams, getSessionContext()]);
  const currentPage = parsePage(sp.page);
  const statusFilter: SalesInternalOrderStatus | undefined =
    sp.status === "BORRADOR" || sp.status === "CONFIRMADA" || sp.status === "CANCELADA" ? sp.status : undefined;
  const stageFilter: SalesOrderFlowStage | undefined = FLOW_STAGE_ORDER.includes(sp.stage as SalesOrderFlowStage)
    ? (sp.stage as SalesOrderFlowStage)
    : undefined;
  const queueFilter = isFulfillmentQueueFilter(sp.queue) ? sp.queue : undefined;
  const customerFilter = (sp.customer ?? "").trim();

  const baseWhere: Prisma.SalesInternalOrderWhereInput = {
    ...(customerFilter ? { customerName: { contains: customerFilter } } : {}),
  };

  const visibleWhere = buildSalesRequestVisibilityWhere({
    roles: sessionCtx.roles,
    userId: sessionCtx.user?.id ?? null,
    baseWhere,
  });
  const where: Prisma.SalesInternalOrderWhereInput = statusFilter
    ? { AND: [visibleWhere, { status: statusFilter }] }
    : visibleWhere;

  const [totalCount, groupedStatuses, linkedAssemblyCount, directPickCount] = await Promise.all([
    prisma.salesInternalOrder.count({ where: visibleWhere }),
    prisma.salesInternalOrder.groupBy({ by: ["status"], _count: { status: true }, where: visibleWhere }),
    prisma.salesInternalOrder.count({
      where: {
        AND: [
          visibleWhere,
          {
            lines: {
              some: { lineKind: "CONFIGURED_ASSEMBLY" },
            },
          },
        ],
      },
    }),
    prisma.salesInternalOrderPickList.count({
      where: {
        status: { in: ["DRAFT", "RELEASED", "IN_PROGRESS", "PARTIAL"] },
        order: { is: visibleWhere },
      },
    }),
  ]);

  const orderSelect = {
    id: true,
    code: true,
    status: true,
    customerId: true,
    customerName: true,
    customer: {
      select: {
        id: true,
        name: true,
        isActive: true,
      },
    },
    dueDate: true,
    assignedToUserId: true,
    deliveredToCustomerAt: true,
    updatedAt: true,
    warehouse: { select: { code: true, name: true } },
    requestedByUser: {
      select: {
        name: true,
        email: true,
        userRoles: {
          where: { role: { code: "MANAGER", isActive: true } },
          select: { roleId: true },
        },
      },
    },
    assignedToUser: { select: { name: true, email: true } },
    _count: { select: { lines: true, pickLists: true } },
    lines: { select: { id: true, lineKind: true } },
    pickLists: {
      where: { status: { not: "CANCELLED" } },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: 1,
      select: { status: true, updatedAt: true },
    },
  } as const;

  let orders: any[] = [];
  let filteredCount = 0;

  if (queueFilter || stageFilter) {
    const queueCandidates = await prisma.salesInternalOrder.findMany({
      where,
      select: {
        id: true,
        status: true,
        dueDate: true,
        updatedAt: true,
        assignedToUserId: true,
        deliveredToCustomerAt: true,
        lines: { select: { id: true, lineKind: true } },
        pickLists: {
          where: { status: { not: "CANCELLED" } },
          orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
          take: 1,
          select: { status: true, updatedAt: true },
        },
      },
    });

    const candidateIds = queueCandidates.map((row) => row.id);
    const linkedProduction = candidateIds.length
      ? await prisma.productionOrder.findMany({
          where: {
            sourceDocumentType: "SalesInternalOrder",
            sourceDocumentId: { in: candidateIds },
          },
          select: {
            sourceDocumentId: true,
            sourceDocumentLineId: true,
            status: true,
            updatedAt: true,
          },
        })
      : [];

    const linkedByOrder = new Map<string, typeof linkedProduction>();
    for (const row of linkedProduction) {
      const orderId = row.sourceDocumentId ?? "";
      if (!orderId) continue;
      const bucket = linkedByOrder.get(orderId);
      if (bucket) {
        bucket.push(row);
      } else {
        linkedByOrder.set(orderId, [row]);
      }
    }

    const now = new Date();
    const matchedIds = queueCandidates
      .filter((candidate) => {
        const latestPick = candidate.pickLists[0] ?? null;
        const assemblyLineIds = new Set(candidate.lines.filter((line) => line.lineKind === "CONFIGURED_ASSEMBLY").map((line) => line.id));
        const linkedForOrder = (linkedByOrder.get(candidate.id) ?? []).filter((row) => (row.sourceDocumentLineId ? assemblyLineIds.has(row.sourceDocumentLineId) : false));
        const linkedAssemblyOpen = linkedForOrder.filter((row) => OPEN_ASSEMBLY_STATUSES.has(row.status)).length;
        const latestAssemblyUpdatedAt = linkedForOrder
          .map((row) => row.updatedAt)
          .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

        const signals = evaluateFulfillmentSignals({
          dueDate: candidate.dueDate,
          orderUpdatedAt: candidate.updatedAt,
          assignedToUserId: candidate.assignedToUserId,
          hasProductLines: candidate.lines.some((line) => line.lineKind === "PRODUCT"),
          hasAssemblyLines: candidate.lines.some((line) => line.lineKind === "CONFIGURED_ASSEMBLY"),
          latestPickStatus: latestPick?.status ?? null,
          latestPickUpdatedAt: latestPick?.updatedAt ?? null,
          linkedAssemblyTotal: linkedForOrder.length,
          linkedAssemblyOpen,
          linkedAssemblyUpdatedAt: latestAssemblyUpdatedAt,
          now,
          staleHours: STALE_HOURS,
        });
        const flowStage = getSalesOrderFlowStage({
          status: candidate.status as SalesInternalOrderStatus,
          assignedToUserId: candidate.assignedToUserId,
          deliveredToCustomerAt: candidate.deliveredToCustomerAt,
          latestPickStatus: latestPick?.status ?? null,
          hasProductLines: candidate.lines.some((line) => line.lineKind === "PRODUCT"),
          hasAssemblyLines: candidate.lines.some((line) => line.lineKind === "CONFIGURED_ASSEMBLY"),
          hasCompletedConfiguredAssembly: linkedForOrder.length > 0 && linkedAssemblyOpen === 0,
        });
        const queueMatch = queueFilter ? matchQueueFilter(signals, queueFilter) : true;
        const stageMatch = stageFilter ? flowStage === stageFilter : true;
        return queueMatch && stageMatch;
      })
      .map((row) => row.id);

    filteredCount = matchedIds.length;
    const totalPagesForQueue = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));
    const safeCandidatePage = Math.min(currentPage, totalPagesForQueue);
    const pagedIds = matchedIds.slice((safeCandidatePage - 1) * PAGE_SIZE, safeCandidatePage * PAGE_SIZE);

    orders = pagedIds.length
      ? await (prisma as any).salesInternalOrder.findMany({
          where: { id: { in: pagedIds } },
          select: orderSelect,
        })
      : [];

    const orderById = new Map(orders.map((order) => [order.id, order]));
    orders = pagedIds.map((id) => orderById.get(id)).filter(Boolean);
  } else {
    [orders, filteredCount] = await Promise.all([
      (prisma as any).salesInternalOrder.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (currentPage - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: orderSelect,
      }),
      prisma.salesInternalOrder.count({ where }),
    ]);
  }

  const totalPages = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const currentOrderIds = orders.map((order) => order.id);
  const currentLinkedProduction = currentOrderIds.length
    ? await prisma.productionOrder.findMany({
        where: {
          sourceDocumentType: "SalesInternalOrder",
          sourceDocumentId: { in: currentOrderIds },
        },
        select: {
          sourceDocumentId: true,
          sourceDocumentLineId: true,
          status: true,
        },
      })
    : [];
  const currentLinkedByOrder = new Map<string, typeof currentLinkedProduction>();
  for (const row of currentLinkedProduction) {
    const orderId = row.sourceDocumentId ?? "";
    if (!orderId) continue;
    const bucket = currentLinkedByOrder.get(orderId);
    if (bucket) {
      bucket.push(row);
    } else {
      currentLinkedByOrder.set(orderId, [row]);
    }
  }
  const statusCountMap = Object.fromEntries(groupedStatuses.map((row) => [row.status, row._count.status]));
  const managerOrAdmin = canManageAllSalesRequests(sessionCtx.roles);
  const canRenderWriteActions = hasSalesWriteAccess({ roles: sessionCtx.roles, permissions: sessionCtx.permissions });
  const canViewCustomers = sessionCtx.isSystemAdmin || sessionCtx.permissions.includes("customers.view");

  const buildHref = (page: number, status = statusFilter, queue = queueFilter, stage = stageFilter) => {
    const base = buildReturnHref({
      status,
      customer: customerFilter || undefined,
      queue,
      page,
    });
    if (!stage) return base;
    const [path, query = ""] = base.split("?");
    const params = new URLSearchParams(query);
    params.set("stage", stage);
    const qs = params.toString();
    return qs ? `${path}?${qs}` : path;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pedidos de surtido"
        description="Captura mixta de productos y ensambles configurados dentro del modulo de ensamble."
        meta={`${filteredCount.toLocaleString("es-MX")} de ${totalCount.toLocaleString("es-MX")} pedidos${queueFilter ? ` · Pedidos por atender: ${QUEUE_LABELS[queueFilter]}` : ""}${stageFilter ? ` · Etapa: ${SALES_ORDER_FLOW_STAGE_LABELS[stageFilter]}` : ""}`}
        actions={
          <>
            <Link href="/production/availability" className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:text-white">
              Disponibilidad
            </Link>
            <Link href="/production/equivalences" className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:text-white">
              Equivalencias
            </Link>
            <Link href="/production/requests/new" className="btn-primary">
              + Nuevo pedido
            </Link>
          </>
        }
      />

      {sp.ok ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{sp.ok}</div> : null}
      {sp.error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{sp.error}</div> : null}

      <div className="grid gap-4 md:grid-cols-4">
        <div className="glass-card">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Pedidos</p>
          <p className="mt-3 text-3xl font-semibold text-white">{totalCount}</p>
        </div>
        <div className="glass-card">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Borrador</p>
          <p className="mt-3 text-3xl font-semibold text-white">{statusCountMap.BORRADOR ?? 0}</p>
        </div>
        <div className="glass-card">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Ensamble ligado</p>
          <p className="mt-3 text-3xl font-semibold text-white">{linkedAssemblyCount}</p>
        </div>
        <div className="glass-card">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Surtidos directos activos</p>
          <p className="mt-3 text-3xl font-semibold text-white">{directPickCount}</p>
        </div>
      </div>

      <form method="get" className="glass-card flex flex-col gap-3 md:flex-row md:items-end">
        {statusFilter ? <input type="hidden" name="status" value={statusFilter} /> : null}
        {queueFilter ? <input type="hidden" name="queue" value={queueFilter} /> : null}
        {stageFilter ? <input type="hidden" name="stage" value={stageFilter} /> : null}
        <label className="flex-1 space-y-1">
          <span className="text-sm text-slate-400">Filtrar por cliente</span>
          <input
            type="text"
            name="customer"
            defaultValue={customerFilter}
            placeholder="Nombre o cuenta del cliente"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white"
          />
        </label>
        <div className="flex gap-2">
          <button type="submit" className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-200 hover:text-white">
            Filtrar
          </button>
          <Link href={buildHref(1, undefined, undefined)} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:text-white">
            Limpiar
          </Link>
        </div>
      </form>

      <div className="flex flex-wrap gap-2">
        <Link href={buildHref(1, statusFilter, undefined, stageFilter)} className={`rounded-lg px-3 py-1.5 text-sm glass ${!queueFilter ? "bg-white/10 text-white font-semibold" : "text-slate-400 hover:text-white"}`}>
          Todos por atender
        </Link>
        {(Object.keys(QUEUE_LABELS) as FulfillmentQueueFilter[]).map((queue) => (
          <Link
            key={queue}
            href={buildHref(1, statusFilter, queue, stageFilter)}
            className={`rounded-lg px-3 py-1.5 text-sm glass ${queueFilter === queue ? "bg-white/10 text-white font-semibold" : "text-slate-400 hover:text-white"}`}
          >
            {QUEUE_LABELS[queue]}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href={buildHref(1, statusFilter, queueFilter, undefined)} className={`rounded-lg px-3 py-1.5 text-sm glass ${!stageFilter ? "bg-white/10 text-white font-semibold" : "text-slate-400 hover:text-white"}`}>
          Todas etapas
        </Link>
        {FLOW_STAGE_ORDER.map((stage) => (
          <Link
            key={stage}
            href={buildHref(1, statusFilter, queueFilter, stage)}
            className={`rounded-lg px-3 py-1.5 text-sm glass ${stageFilter === stage ? "bg-white/10 text-white font-semibold" : "text-slate-400 hover:text-white"}`}
          >
            {SALES_ORDER_FLOW_STAGE_LABELS[stage]}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href={buildHref(1, undefined, queueFilter)} className={`rounded-lg px-3 py-1.5 text-sm glass ${!statusFilter ? "bg-white/10 text-white font-semibold" : "text-slate-400 hover:text-white"}`}>
          Todos ({totalCount})
        </Link>
        {Object.entries(SALES_INTERNAL_ORDER_STATUS_LABELS).map(([status, label]) => (
          <Link
            key={status}
            href={buildHref(1, status as SalesInternalOrderStatus, queueFilter)}
            className={`rounded-lg px-3 py-1.5 text-sm glass ${statusFilter === status ? "bg-white/10 text-white font-semibold" : "text-slate-400 hover:text-white"}`}
          >
            {label} ({statusCountMap[status] ?? 0})
          </Link>
        ))}
      </div>

      <div className="glass-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-slate-400">
              <th className="py-3 text-left">Codigo</th>
              <th className="py-3 text-left">Cliente</th>
              <th className="py-3 text-left">Estado</th>
              <th className="py-3 text-left">Almacen</th>
              <th className="py-3 text-left">Solicitado por</th>
              <th className="py-3 text-left">Asignado a</th>
              <th className="py-3 text-left">Entrega</th>
              <th className="py-3 text-right">Lineas</th>
              <th className="py-3 text-left">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-10 text-center text-slate-500">
                  No hay pedidos para el filtro seleccionado.
                </td>
              </tr>
            ) : orders.map((order) => {
              const orderStatus = order.status as SalesInternalOrderStatus;
              const displayCustomer = order.customerName?.trim() || order.customer?.name || "--";
              const createdByManager = (order.requestedByUser?.userRoles.length ?? 0) > 0;
              const hasProductLines = order.lines.some((line: any) => line.lineKind === "PRODUCT");
              const hasAssemblyLines = order.lines.some((line: any) => line.lineKind === "CONFIGURED_ASSEMBLY");
              const assemblyLineIds = new Set(order.lines.filter((line: any) => line.lineKind === "CONFIGURED_ASSEMBLY").map((line: any) => line.id));
              const linkedForOrder = (currentLinkedByOrder.get(order.id) ?? []).filter((row) =>
                row.sourceDocumentLineId ? assemblyLineIds.has(row.sourceDocumentLineId) : false,
              );
              const hasCompletedConfiguredAssembly = !hasAssemblyLines
                || (
                  linkedForOrder.length === assemblyLineIds.size
                  && linkedForOrder.every((row) => row.status === "COMPLETADA")
                );
              const latestPickStatus = order.pickLists[0]?.status ?? null;
              const takeEligibility = getTakeOrderEligibility({
                roles: sessionCtx.roles,
                status: orderStatus,
                assignedToUserId: order.assignedToUserId,
                isCreatedByManager: createdByManager,
              });
              const flowNarrative = getSalesOrderFlowNarrative({
                orderId: order.id,
                status: orderStatus,
                assignedToUserId: order.assignedToUserId,
                deliveredToCustomerAt: order.deliveredToCustomerAt,
                latestPickStatus,
                hasProductLines,
                hasAssemblyLines,
                hasCompletedConfiguredAssembly,
                takeEligibility,
              });
              const isAvailableForPull = !managerOrAdmin && takeEligibility.canTakeOrder;
              return (
                <tr key={order.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-3">
                    <Link href={`/production/requests/${order.id}`} className="font-mono text-cyan-300 hover:text-white">
                      {order.code}
                    </Link>
                  </td>
                  <td className="py-3 text-slate-300">
                    {order.customerId && canViewCustomers ? (
                      <Link href={`/sales/customers/${order.customerId}`} className="text-cyan-300 hover:text-white">
                        {displayCustomer}
                      </Link>
                    ) : (
                      displayCustomer
                    )}
                  </td>
                  <td className="py-3">
                    <span className={`rounded px-2 py-1 text-xs font-semibold ${SALES_INTERNAL_ORDER_STYLES(orderStatus)}`}>
                      {SALES_INTERNAL_ORDER_STATUS_LABELS[orderStatus]}
                    </span>
                  </td>
                  <td className="py-3 text-slate-400">{order.warehouse ? `${order.warehouse.code} - ${order.warehouse.name}` : "--"}</td>
                  <td className="py-3 text-slate-400">{order.requestedByUser?.name ?? order.requestedByUser?.email ?? "--"}</td>
                  <td className="py-3 text-slate-300">
                    {order.assignedToUser ? (
                      order.assignedToUser.name ?? order.assignedToUser.email ?? "--"
                    ) : (
                      <span className="text-slate-500">Sin asignar</span>
                    )}
                    {isAvailableForPull ? (
                      <span className="ml-2 rounded px-2 py-0.5 text-xs font-semibold text-cyan-200 bg-cyan-500/20">
                        Disponible para pull
                      </span>
                    ) : null}
                  </td>
                  <td className="py-3 text-slate-400">
                    <p>{order.dueDate ? new Date(order.dueDate).toLocaleDateString("es-MX") : "--"}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Badge variant={flowNarrative.flowBadgeVariant}>{flowNarrative.flowStageLabel}</Badge>
                      <Link href={flowNarrative.nextRecommendedAction.href} className="text-xs text-cyan-300 hover:text-white">
                        {flowNarrative.nextRecommendedAction.label}
                      </Link>
                    </div>
                  </td>
                  <td className="py-3 text-right text-slate-300">{order._count.lines}</td>
                  <td className="py-3">
                    {canRenderWriteActions ? (
                      <div className="space-y-1">
                        <form action={takeRequestFromList}>
                          <input type="hidden" name="orderId" value={order.id} />
                          <input type="hidden" name="returnTo" value={buildHref(safePage)} />
                          <button
                            type="submit"
                            disabled={!takeEligibility.canTakeOrder}
                            className={`rounded-lg border px-3 py-1.5 text-xs ${
                              takeEligibility.canTakeOrder
                                ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-200 hover:border-cyan-400/40 hover:text-white"
                                : "cursor-not-allowed border-white/10 bg-white/5 text-slate-500"
                            }`}
                          >
                            Tomar pedido
                          </button>
                        </form>
                        {!takeEligibility.canTakeOrder ? (
                          <p className="text-xs text-[var(--warning)]">{takeEligibility.takeBlockedReason}</p>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500">--</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between gap-3 text-sm">
          <Link href={buildHref(Math.max(1, safePage - 1))} className={`rounded-lg border border-white/10 px-4 py-2 ${safePage <= 1 ? "pointer-events-none opacity-40" : "text-slate-300 hover:text-white"}`}>
            ← Anterior
          </Link>
          <span className="text-slate-500">Pagina {safePage} de {totalPages}</span>
          <Link href={buildHref(Math.min(totalPages, safePage + 1))} className={`rounded-lg border border-white/10 px-4 py-2 ${safePage >= totalPages ? "pointer-events-none opacity-40" : "text-slate-300 hover:text-white"}`}>
            Siguiente →
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function SALES_INTERNAL_ORDER_STYLES(status: SalesInternalOrderStatus) {
  return SALES_INTERNAL_ORDER_STATUS_STYLES[status];
}
