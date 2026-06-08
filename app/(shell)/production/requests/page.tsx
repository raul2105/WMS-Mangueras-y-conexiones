/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma, SalesInternalOrderStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getSessionContext } from "@/lib/auth/session-context";
import { pageGuard } from "@/components/rbac/PageGuard";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { hasSalesWriteAccess, requireSalesWriteAccess } from "@/lib/rbac/sales";
import { pullSalesRequestOrder } from "@/lib/sales/request-service";
import { firstErrorMessage, salesInternalOrderTransitionSchema } from "@/lib/schemas/wms";
import { startPerf } from "@/lib/perf";
import { getRequestId } from "@/lib/request-meta";
import {
  getMarkDeliveredEligibility,
  getTakeOrderEligibility,
  getSalesOrderFlowStage,
  getSalesOrderFlowNarrative,
  SALES_ORDER_FLOW_STAGE_LABELS,
  SALES_INTERNAL_ORDER_STATUS_LABELS,
  SALES_INTERNAL_ORDER_STATUS_STYLES,
  summarizePickListStatus,
  summarizeProductionStatus,
  type SalesOrderFlowStage,
} from "@/lib/sales/internal-orders";
import { buildSalesRequestVisibilityWhere, canManageAllSalesRequests } from "@/lib/sales/visibility";
import {
  evaluateFulfillmentSignals,
  isFulfillmentQueueFilter,
  matchQueueFilter,
  type FulfillmentQueueFilter,
} from "@/lib/dashboard/fulfillment-dashboard";
import {
  evaluateOperationalPresets,
  getOperationalPresetLabel,
  isOperationalPresetFilter,
  matchOperationalPreset,
  type OperationalPresetFilter,
} from "@/lib/dashboard/fulfillment-operational-presets";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const STALE_HOURS = 4;
const OPEN_ASSEMBLY_STATUSES = new Set(["BORRADOR", "ABIERTA", "EN_PROCESO"]);
const BUSINESS_TIMEZONE = "America/Mexico_City";

const QUEUE_LABELS: Record<FulfillmentQueueFilter, string> = {
  overdue: "Vencidos",
  today: "Vencen hoy",
  partial: "Parciales",
  stale: "Sin movimiento",
  unreleased: "Sin liberar",
  assembly_blocked: "Ensamble bloqueado",
};
const PRESET_LABELS: Record<OperationalPresetFilter, string> = {
  urgentes: getOperationalPresetLabel("URGENTES"),
  vencen_hoy: getOperationalPresetLabel("VENCEN_HOY"),
  sin_asignar: getOperationalPresetLabel("SIN_ASIGNAR"),
  sin_movimiento: getOperationalPresetLabel("SIN_MOVIMIENTO"),
  bloqueados: getOperationalPresetLabel("BLOQUEADOS"),
  listos_para_entrega: getOperationalPresetLabel("LISTOS_PARA_ENTREGA"),
};

type SearchParams = {
  status?: string;
  stage?: string;
  page?: string;
  customer?: string;
  queue?: string;
  preset?: string;
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

function getFilterPillClass(active: boolean) {
  return active
    ? "border border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] font-semibold shadow-[var(--shadow-sm)]"
    : "border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]";
}

function getFlowStageCardClass(stage: SalesOrderFlowStage) {
  if (stage === "en_surtido") return "border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]";
  if (stage === "listo_entrega" || stage === "entregado") return "border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]";
  if (stage === "cancelado") return "border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]";
  if (stage === "por_asignar") return "border-[var(--execution-active-border)] bg-[var(--execution-active-bg)] text-[var(--execution-active-text)]";
  return "border-[var(--status-neutral-border)] bg-[var(--status-neutral-bg)] text-[var(--status-neutral-text)]";
}

function getPrimaryCtaClass(isAllowed: boolean, code: string) {
  if (!isAllowed) return buttonStyles({ variant: "secondary", size: "lg", fullWidth: true, className: "pointer-events-none cursor-not-allowed opacity-60" });
  if (code === "TAKE_ORDER") {
    return "btn-mobile w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]";
  }
  if (code === "OPERATE_PICK" || code === "COMPLETE_ASSEMBLY") {
    return "btn-primary w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]";
  }
  if (code === "MARK_DELIVERED") {
    return "btn-sales w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]";
  }
  return buttonStyles({ variant: "secondary", size: "lg", fullWidth: true });
}

function parsePage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "--";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleDateString("es-MX");
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "--";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString("es-MX");
}

function formatQty(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(numeric)) return "0";
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 }).format(numeric);
}

function getLineProductLabel(line: any) {
  const product = line.product;
  if (!product) return "Producto sin referencia";
  return [product.sku ?? product.referenceCode, product.name].filter(Boolean).join(" - ") || "Producto sin referencia";
}

function getAssemblyComponentSummary(line: any) {
  const config = line.assemblyConfiguration;
  if (!config) return ["Configuracion pendiente"];
  return [
    config.entryFittingProduct ? `Entrada: ${config.entryFittingProduct.sku ?? "--"} ${config.entryFittingProduct.name ?? ""}`.trim() : null,
    config.hoseProduct ? `Manguera: ${config.hoseProduct.sku ?? "--"} ${config.hoseProduct.name ?? ""}`.trim() : null,
    config.exitFittingProduct ? `Salida: ${config.exitFittingProduct.sku ?? "--"} ${config.exitFittingProduct.name ?? ""}`.trim() : null,
  ].filter(Boolean) as string[];
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

function buildReturnHref(args: {
  status?: SalesInternalOrderStatus;
  customer?: string;
  queue?: FulfillmentQueueFilter;
  preset?: OperationalPresetFilter;
  page: number;
}) {
  const params = new URLSearchParams();
  if (args.status) params.set("status", args.status);
  if (args.customer) params.set("customer", args.customer);
  if (args.queue) params.set("queue", args.queue);
  if (args.preset) params.set("preset", args.preset);
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
  const presetFilter = isOperationalPresetFilter(sp.preset) ? sp.preset : undefined;
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
    notes: true,
    assignedToUserId: true,
    assignedAt: true,
    pulledAt: true,
    deliveredToCustomerAt: true,
    updatedAt: true,
    createdAt: true,
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
    lines: {
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        lineKind: true,
        requestedQty: true,
        notes: true,
        product: {
          select: {
            sku: true,
            referenceCode: true,
            name: true,
            unitLabel: true,
          },
        },
        assemblyConfiguration: {
          select: {
            hoseLength: true,
            assemblyQuantity: true,
            totalHoseRequired: true,
            notes: true,
            entryFittingProduct: { select: { sku: true, name: true } },
            hoseProduct: { select: { sku: true, name: true } },
            exitFittingProduct: { select: { sku: true, name: true } },
          },
        },
      },
    },
    pickLists: {
      where: { status: { not: "CANCELLED" } },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: 1,
      select: { status: true, updatedAt: true, code: true },
    },
  } as const;

  let orders: any[] = [];
  let filteredCount = 0;

  if (queueFilter || stageFilter || presetFilter) {
    const queueCandidates = await prisma.salesInternalOrder.findMany({
      where,
      select: {
        id: true,
        status: true,
        dueDate: true,
        updatedAt: true,
        assignedToUserId: true,
        pulledAt: true,
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
        const hasProductLines = candidate.lines.some((line) => line.lineKind === "PRODUCT");
        const hasAssemblyLines = candidate.lines.some((line) => line.lineKind === "CONFIGURED_ASSEMBLY");
        const assemblyLineIds = new Set(candidate.lines.filter((line) => line.lineKind === "CONFIGURED_ASSEMBLY").map((line) => line.id));
        const linkedForOrder = (linkedByOrder.get(candidate.id) ?? []).filter((row) => (row.sourceDocumentLineId ? assemblyLineIds.has(row.sourceDocumentLineId) : false));
        const linkedAssemblyOpen = linkedForOrder.filter((row) => OPEN_ASSEMBLY_STATUSES.has(row.status)).length;
        const hasCompletedConfiguredAssembly = !hasAssemblyLines || (linkedForOrder.length > 0 && linkedAssemblyOpen === 0);
        const latestAssemblyUpdatedAt = linkedForOrder
          .map((row) => row.updatedAt)
          .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

        const signals = evaluateFulfillmentSignals({
          dueDate: candidate.dueDate,
          orderUpdatedAt: candidate.updatedAt,
          assignedToUserId: candidate.assignedToUserId,
          hasProductLines,
          hasAssemblyLines,
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
          hasProductLines,
          hasAssemblyLines,
          hasCompletedConfiguredAssembly,
        });
        const hasCompletedDirectPick = !hasProductLines || latestPick?.status === "COMPLETED";
        const deliveredEligibility = getMarkDeliveredEligibility({
          status: candidate.status as SalesInternalOrderStatus,
          deliveredToCustomerAt: candidate.deliveredToCustomerAt,
          assignedToUserId: candidate.assignedToUserId,
          pulledAt: candidate.pulledAt,
          hasCompletedDirectPick,
          hasCompletedConfiguredAssembly,
        });
        const presetEvaluation = evaluateOperationalPresets(
          {
            dueDate: candidate.dueDate,
            assignedToUserId: candidate.assignedToUserId,
            flowStage,
            isPartial: signals.isPartial,
            isUnreleased: signals.isUnreleased,
            assemblyBlocked: signals.assemblyBlocked,
            canMarkDelivered: deliveredEligibility.canMarkDelivered,
            isStale: signals.isStale,
            lastOperationalUpdateAt: signals.lastUpdatedAt,
            inActiveQueue: true,
          },
          {
            now,
            timezone: BUSINESS_TIMEZONE,
            staleHours: STALE_HOURS,
          },
        );
        const queueMatch = queueFilter ? matchQueueFilter(signals, queueFilter) : true;
        const presetMatch = presetFilter ? matchOperationalPreset(presetEvaluation, presetFilter, "primary") : true;
        const stageMatch = stageFilter ? flowStage === stageFilter : true;
        return queueMatch && stageMatch && presetMatch;
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
          code: true,
          assemblyWorkOrder: {
            select: {
              availabilityStatus: true,
              pickStatus: true,
              hasShortage: true,
            },
          },
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

  const buildHref = (page: number, status = statusFilter, queue = queueFilter, stage = stageFilter, preset = presetFilter) => {
    const base = buildReturnHref({
      status,
      customer: customerFilter || undefined,
      queue,
      preset,
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
        title="Warehouse Execution Cockpit"
        description="Cola operativa para pedidos, surtido directo y ensambles configurados."
        meta={`${filteredCount.toLocaleString("es-MX")} de ${totalCount.toLocaleString("es-MX")} pedidos${queueFilter ? ` · Pedidos por atender: ${QUEUE_LABELS[queueFilter]}` : ""}${presetFilter ? ` · Preset operativo: ${PRESET_LABELS[presetFilter]}` : ""}${stageFilter ? ` · Etapa: ${SALES_ORDER_FLOW_STAGE_LABELS[stageFilter]}` : ""}`}
        actions={
          <>
            <Link href="/production/availability" className={buttonStyles({ variant: "secondary" })}>
              Disponibilidad
            </Link>
            <Link href="/production/equivalences" className={buttonStyles({ variant: "secondary" })}>
              Equivalencias
            </Link>
            <Link href="/production/requests/new" className="btn-primary">
              Nuevo pedido
            </Link>
          </>
        }
      />

      {sp.ok ? <div className="rounded-[var(--radius-lg)] border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-4 py-3 text-sm text-[var(--status-success-text)]">{sp.ok}</div> : null}
      {sp.error ? <div className="rounded-[var(--radius-lg)] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 text-sm text-[var(--status-danger-text)]">{sp.error}</div> : null}

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Pedidos visibles" value={totalCount.toString()} />
        <StatCard label="Borrador" value={(statusCountMap.BORRADOR ?? 0).toString()} tone="accent" />
        <StatCard label="Con ensamble" value={linkedAssemblyCount.toString()} tone="warning" />
        <StatCard label="Surtidos activos" value={directPickCount.toString()} tone="success" />
      </div>

      <section className="op-panel space-y-4" aria-label="Filtros del cockpit">
        <form method="get" className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          {statusFilter ? <input type="hidden" name="status" value={statusFilter} /> : null}
          {queueFilter ? <input type="hidden" name="queue" value={queueFilter} /> : null}
          {presetFilter ? <input type="hidden" name="preset" value={presetFilter} /> : null}
          {stageFilter ? <input type="hidden" name="stage" value={stageFilter} /> : null}
          <label className="space-y-1">
            <span className="text-sm font-medium text-[var(--text-secondary)]">Cliente</span>
            <input
              type="text"
              name="customer"
              defaultValue={customerFilter}
              placeholder="Nombre o cuenta del cliente"
              className="field"
            />
          </label>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <button type="submit" className={buttonStyles({ variant: "secondary", fullWidth: true })}>
              Filtrar
            </button>
            <Link href={buildHref(1, undefined, undefined, undefined, undefined)} className={buttonStyles({ variant: "secondary", fullWidth: true })}>
              Limpiar
            </Link>
          </div>
        </form>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2" aria-label="Filtros por cola">
            <Link href={buildHref(1, statusFilter, undefined, stageFilter)} className={`rounded-[var(--radius-md)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${getFilterPillClass(!queueFilter)}`}>
              Todos por atender
            </Link>
            {(Object.keys(QUEUE_LABELS) as FulfillmentQueueFilter[]).map((queue) => (
              <Link
                key={queue}
                href={buildHref(1, statusFilter, queue, stageFilter)}
                className={`rounded-[var(--radius-md)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${getFilterPillClass(queueFilter === queue)}`}
              >
                {QUEUE_LABELS[queue]}
              </Link>
            ))}
          </div>

          <div className="flex flex-wrap gap-2" aria-label="Presets operativos">
            <Link
              href={buildHref(1, statusFilter, queueFilter, stageFilter, undefined)}
              className={`rounded-[var(--radius-md)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${getFilterPillClass(!presetFilter)}`}
            >
              Todos presets
            </Link>
            {(Object.keys(PRESET_LABELS) as OperationalPresetFilter[]).map((preset) => (
              <Link
                key={preset}
                href={buildHref(1, statusFilter, queueFilter, stageFilter, preset)}
                className={`rounded-[var(--radius-md)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${getFilterPillClass(presetFilter === preset)}`}
              >
                {PRESET_LABELS[preset]}
              </Link>
            ))}
          </div>

          <div className="flex flex-wrap gap-2" aria-label="Etapas de flujo">
            <Link href={buildHref(1, statusFilter, queueFilter, undefined)} className={`rounded-[var(--radius-md)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${getFilterPillClass(!stageFilter)}`}>
              Todas etapas
            </Link>
            {FLOW_STAGE_ORDER.map((stage) => (
              <Link
                key={stage}
                href={buildHref(1, statusFilter, queueFilter, stage)}
                className={`rounded-[var(--radius-md)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${getFilterPillClass(stageFilter === stage)}`}
              >
                {SALES_ORDER_FLOW_STAGE_LABELS[stage]}
              </Link>
            ))}
          </div>

          <div className="flex flex-wrap gap-2" aria-label="Estado administrativo">
            <Link href={buildHref(1, undefined, queueFilter)} className={`rounded-[var(--radius-md)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${getFilterPillClass(!statusFilter)}`}>
              Todos ({totalCount})
            </Link>
            {Object.entries(SALES_INTERNAL_ORDER_STATUS_LABELS).map(([status, label]) => (
              <Link
                key={status}
                href={buildHref(1, status as SalesInternalOrderStatus, queueFilter)}
                className={`rounded-[var(--radius-md)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${getFilterPillClass(statusFilter === status)}`}
              >
                {label} ({statusCountMap[status] ?? 0})
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="op-layout" aria-label="Cola operativa de pedidos">
        {orders.length === 0 ? (
          <div className="op-panel text-center">
            <p className="text-sm font-medium text-[var(--text-primary)]">No hay pedidos para el filtro seleccionado.</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Ajusta etapa, preset o cliente para regresar a la cola operativa.</p>
          </div>
        ) : orders.map((order) => {
          const orderStatus = order.status as SalesInternalOrderStatus;
          const displayCustomer = order.customerName?.trim() || order.customer?.name || "--";
          const createdByManager = (order.requestedByUser?.userRoles.length ?? 0) > 0;
          const productLines = order.lines.filter((line: any) => line.lineKind === "PRODUCT");
          const assemblyLines = order.lines.filter((line: any) => line.lineKind === "CONFIGURED_ASSEMBLY");
          const hasProductLines = productLines.length > 0;
          const hasAssemblyLines = assemblyLines.length > 0;
          const assemblyLineIds = new Set(assemblyLines.map((line: any) => line.id));
          const linkedForOrder = (currentLinkedByOrder.get(order.id) ?? []).filter((row) =>
            row.sourceDocumentLineId ? assemblyLineIds.has(row.sourceDocumentLineId) : false,
          );
          const linkedByLine = new Map(linkedForOrder.map((row) => [row.sourceDocumentLineId, row]));
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
          const hasCompletedDirectPick = !hasProductLines || latestPickStatus === "COMPLETED";
          const deliveredEligibility = getMarkDeliveredEligibility({
            status: orderStatus,
            deliveredToCustomerAt: order.deliveredToCustomerAt,
            assignedToUserId: order.assignedToUserId,
            pulledAt: order.pulledAt,
            hasCompletedDirectPick,
            hasCompletedConfiguredAssembly,
          });
          const flowNarrative = getSalesOrderFlowNarrative({
            orderId: order.id,
            roles: sessionCtx.roles,
            status: orderStatus,
            assignedToUserId: order.assignedToUserId,
            deliveredToCustomerAt: order.deliveredToCustomerAt,
            pulledAt: order.pulledAt,
            latestPickStatus,
            hasProductLines,
            hasAssemblyLines,
            hasCompletedConfiguredAssembly,
            takeEligibility,
            deliveredEligibility,
          });
          const isAvailableForPull = !managerOrAdmin && takeEligibility.canTakeOrder;
          const primaryCta = flowNarrative.primaryCta;
          const primaryCtaBlockedReason = primaryCta.blockedReason ?? primaryCta.action.blockedReason;
          const primaryCtaClass = getPrimaryCtaClass(primaryCta.isAllowed, primaryCta.code);
          const activeFlowIndex = FLOW_STAGE_ORDER.indexOf(flowNarrative.flowStage);
          const linePreview = [...productLines.slice(0, 2), ...assemblyLines.slice(0, 2)].slice(0, 3);
          const hiddenLineCount = Math.max(0, order.lines.length - linePreview.length);

          return (
            <article key={order.id} className="op-card space-y-4" aria-labelledby={`order-${order.id}-title`}>
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <Link
                        id={`order-${order.id}-title`}
                        href={`/production/requests/${order.id}`}
                        className="block truncate font-mono text-sm font-semibold text-[var(--accent)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                      >
                        {order.code}
                      </Link>
                      <h2 className="text-xl font-semibold text-[var(--text-primary)]">{displayCustomer}</h2>
                      <p className="text-sm text-[var(--text-secondary)]">
                        {order.warehouse ? `${order.warehouse.code} - ${order.warehouse.name}` : "Sin almacen"} · Entrega {formatDate(order.dueDate)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 sm:justify-end">
                      <span className={`rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-semibold ${SALES_INTERNAL_ORDER_STYLES(orderStatus)}`}>
                        {SALES_INTERNAL_ORDER_STATUS_LABELS[orderStatus]}
                      </span>
                      <span className={`rounded-[var(--radius-sm)] border px-2.5 py-1 text-xs font-semibold ${getFlowStageCardClass(flowNarrative.flowStage)}`}>
                        {flowNarrative.flowStageLabel}
                      </span>
                      {isAvailableForPull ? <span className="op-state op-state-mobile">Disponible para pull</span> : null}
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="surface p-3">
                      <p className="text-xs uppercase text-[var(--text-muted)]">Lineas producto</p>
                      <p className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">{productLines.length}</p>
                    </div>
                    <div className="surface p-3">
                      <p className="text-xs uppercase text-[var(--text-muted)]">Ensambles</p>
                      <p className="mt-1 text-2xl font-semibold text-[var(--role-warehouse-accent)]">{assemblyLines.length}</p>
                    </div>
                    <div className="surface p-3">
                      <p className="text-xs uppercase text-[var(--text-muted)]">Surtido directo</p>
                      <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{summarizePickListStatus(latestPickStatus)}</p>
                    </div>
                  </div>

                  <ol className="grid gap-2 md:grid-cols-3 xl:grid-cols-6" aria-label="Etapas del pedido">
                    {FLOW_STAGE_ORDER.map((stage, index) => {
                      const isActive = flowNarrative.flowStage === stage;
                      const isComplete = activeFlowIndex > index && activeFlowIndex >= 0;
                      return (
                        <li key={stage} className={`op-step ${isActive ? "op-step-active" : ""} ${isComplete ? "op-step-complete" : ""}`}>
                          <span className="op-step-marker">{index + 1}</span>
                          <span className="text-xs font-semibold text-[var(--text-primary)]">{SALES_ORDER_FLOW_STAGE_LABELS[stage]}</span>
                        </li>
                      );
                    })}
                  </ol>

                  <div className="grid gap-3 lg:grid-cols-2">
                    <div className="surface p-3">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Lineas agregadas</h3>
                        <Badge variant={hasProductLines ? "success" : "neutral"}>{hasProductLines ? "Producto" : "Sin producto"}</Badge>
                      </div>
                      <div className="mt-3 space-y-2">
                        {productLines.length === 0 ? (
                          <p className="text-sm text-[var(--text-muted)]">No hay lineas independientes.</p>
                        ) : productLines.slice(0, 3).map((line: any) => (
                          <div key={line.id} className="rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-3">
                            <p className="text-sm font-semibold text-[var(--text-primary)]">{getLineProductLabel(line)}</p>
                            <p className="mt-1 text-xs text-[var(--text-secondary)]">Cantidad: {formatQty(line.requestedQty)} {line.product?.unitLabel ?? ""}</p>
                            {line.notes ? <p className="mt-1 text-xs text-[var(--text-muted)]">{line.notes}</p> : null}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="surface p-3">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Ensambles configurados</h3>
                        <Badge variant={hasCompletedConfiguredAssembly ? "success" : hasAssemblyLines ? "warning" : "neutral"}>
                          {hasAssemblyLines ? (hasCompletedConfiguredAssembly ? "Listos" : "Pendientes") : "Sin ensamble"}
                        </Badge>
                      </div>
                      <div className="mt-3 space-y-2">
                        {assemblyLines.length === 0 ? (
                          <p className="text-sm text-[var(--text-muted)]">No hay ensambles configurados.</p>
                        ) : assemblyLines.slice(0, 3).map((line: any) => {
                          const production = linkedByLine.get(line.id);
                          const config = line.assemblyConfiguration;
                          return (
                            <details key={line.id} className="rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 open:border-[var(--execution-active-border)]">
                              <summary className="cursor-pointer text-sm font-semibold text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                                {getLineProductLabel(line)}
                              </summary>
                              <div className="mt-2 space-y-2 text-xs text-[var(--text-secondary)]">
                                <p>Cantidad: {formatQty(config?.assemblyQuantity ?? line.requestedQty)} · Manguera: {formatQty(config?.totalHoseRequired)} · Longitud: {formatQty(config?.hoseLength)}</p>
                                <p>Estado: {summarizeProductionStatus(production?.status)} · Disponibilidad: {production?.assemblyWorkOrder?.availabilityStatus ?? "Sin validar"}</p>
                                {production?.assemblyWorkOrder?.hasShortage ? <p className="text-[var(--status-danger-text)]">Faltante detectado en componentes.</p> : null}
                                <ul className="space-y-1">
                                  {getAssemblyComponentSummary(line).map((component) => <li key={component}>{component}</li>)}
                                </ul>
                                {config?.notes || line.notes ? <p>Notas: {config?.notes ?? line.notes}</p> : null}
                              </div>
                            </details>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {hiddenLineCount > 0 ? (
                    <p className="text-xs text-[var(--text-muted)]">{hiddenLineCount} lineas adicionales disponibles en el detalle del pedido.</p>
                  ) : null}
                </div>

                <aside className="op-sidebar space-y-4" aria-label="Resumen persistente del pedido">
                  <div className="space-y-2">
                    <p className="text-xs uppercase text-[var(--text-muted)]">Siguiente accion</p>
                    <h3 className="text-xl font-semibold text-[var(--text-primary)]">{primaryCta.action.label}</h3>
                    <p className="text-sm text-[var(--text-secondary)]">{primaryCta.reason}</p>
                    {primaryCtaBlockedReason ? <p className="text-sm text-[var(--warning)]">{primaryCtaBlockedReason}</p> : null}
                  </div>

                  <div className="grid gap-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[var(--text-muted)]">Asignado a</span>
                      <span className="text-right font-medium text-[var(--text-primary)]">{order.assignedToUser?.name ?? order.assignedToUser?.email ?? "Sin asignar"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[var(--text-muted)]">Promesa</span>
                      <span className="font-medium text-[var(--text-primary)]">{formatDate(order.dueDate)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[var(--text-muted)]">Ultimo movimiento</span>
                      <span className="font-medium text-[var(--text-primary)]">{formatDateTime(order.updatedAt)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[var(--text-muted)]">Validaciones</span>
                      <span className="font-medium text-[var(--text-primary)]">
                        {hasCompletedDirectPick && hasCompletedConfiguredAssembly ? "Completas" : "Pendientes"}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Badge variant={hasCompletedDirectPick ? "success" : hasProductLines ? "warning" : "neutral"}>Surtido directo</Badge>
                    <Badge variant={hasCompletedConfiguredAssembly ? "success" : hasAssemblyLines ? "warning" : "neutral"}>Ensambles</Badge>
                    <Badge variant={deliveredEligibility.canMarkDelivered ? "success" : "neutral"}>Entrega</Badge>
                  </div>

                  {canRenderWriteActions && primaryCta.code === "TAKE_ORDER" ? (
                    <form action={takeRequestFromList}>
                      <input type="hidden" name="orderId" value={order.id} />
                      <input type="hidden" name="returnTo" value={buildHref(safePage)} />
                      <button type="submit" disabled={!takeEligibility.canTakeOrder} className={primaryCtaClass}>
                        {primaryCta.action.label}
                      </button>
                    </form>
                  ) : (
                    <Link
                      href={primaryCta.action.href}
                      aria-disabled={!primaryCta.isAllowed}
                      className={primaryCtaClass}
                    >
                      {primaryCta.action.label}
                    </Link>
                  )}

                  <Link href={`/production/requests/${order.id}`} className={buttonStyles({ variant: "secondary", fullWidth: true })}>
                    Ver detalle completo
                  </Link>
                </aside>
              </div>
            </article>
          );
        })}
      </section>

      <section className="table-shell overflow-x-auto" aria-label="Tabla administrativa secundaria">
        <table className="w-full text-sm">
          <thead className="table-head">
            <tr>
              <th className="px-3 py-3 text-left">Codigo</th>
              <th className="px-3 py-3 text-left">Cliente</th>
              <th className="px-3 py-3 text-left">Estado</th>
              <th className="px-3 py-3 text-left">Etapa</th>
              <th className="px-3 py-3 text-left">Almacen</th>
              <th className="px-3 py-3 text-left">Asignado a</th>
              <th className="px-3 py-3 text-left">Entrega</th>
              <th className="px-3 py-3 text-right">Lineas</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-[var(--text-muted)]">
                  No hay pedidos para el filtro seleccionado.
                </td>
              </tr>
            ) : orders.map((order) => {
              const orderStatus = order.status as SalesInternalOrderStatus;
              const displayCustomer = order.customerName?.trim() || order.customer?.name || "--";
              const productLines = order.lines.filter((line: any) => line.lineKind === "PRODUCT");
              const assemblyLines = order.lines.filter((line: any) => line.lineKind === "CONFIGURED_ASSEMBLY");
              const assemblyLineIds = new Set(assemblyLines.map((line: any) => line.id));
              const linkedForOrder = (currentLinkedByOrder.get(order.id) ?? []).filter((row) =>
                row.sourceDocumentLineId ? assemblyLineIds.has(row.sourceDocumentLineId) : false,
              );
              const hasCompletedConfiguredAssembly = assemblyLines.length === 0
                || (linkedForOrder.length === assemblyLineIds.size && linkedForOrder.every((row) => row.status === "COMPLETADA"));
              const flowStage = getSalesOrderFlowStage({
                status: orderStatus,
                assignedToUserId: order.assignedToUserId,
                deliveredToCustomerAt: order.deliveredToCustomerAt,
                latestPickStatus: order.pickLists[0]?.status ?? null,
                hasProductLines: productLines.length > 0,
                hasAssemblyLines: assemblyLines.length > 0,
                hasCompletedConfiguredAssembly,
              });
              return (
                <tr key={order.id} className="table-row">
                  <td className="px-3 py-3">
                    <Link href={`/production/requests/${order.id}`} className="font-mono text-[var(--accent)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                      {order.code}
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-[var(--text-primary)]">
                    {order.customerId && canViewCustomers ? (
                      <Link href={`/sales/customers/${order.customerId}`} className="text-[var(--accent)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                        {displayCustomer}
                      </Link>
                    ) : (
                      displayCustomer
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span className={`rounded-[var(--radius-sm)] px-2 py-1 text-xs font-semibold ${SALES_INTERNAL_ORDER_STYLES(orderStatus)}`}>
                      {SALES_INTERNAL_ORDER_STATUS_LABELS[orderStatus]}
                    </span>
                  </td>
                  <td className="px-3 py-3"><Badge variant={flowStage === "en_surtido" ? "warning" : flowStage === "listo_entrega" || flowStage === "entregado" ? "success" : flowStage === "cancelado" ? "danger" : "accent"}>{SALES_ORDER_FLOW_STAGE_LABELS[flowStage]}</Badge></td>
                  <td className="px-3 py-3 text-[var(--text-secondary)]">{order.warehouse ? `${order.warehouse.code} - ${order.warehouse.name}` : "--"}</td>
                  <td className="px-3 py-3 text-[var(--text-primary)]">{order.assignedToUser?.name ?? order.assignedToUser?.email ?? "Sin asignar"}</td>
                  <td className="px-3 py-3 text-[var(--text-secondary)]">{formatDate(order.dueDate)}</td>
                  <td className="px-3 py-3 text-right text-[var(--text-primary)]">{order._count.lines}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between gap-3 text-sm">
          <Link href={buildHref(Math.max(1, safePage - 1))} className={buttonStyles({ variant: "secondary", className: safePage <= 1 ? "pointer-events-none opacity-40" : "" })}>
            Anterior
          </Link>
          <span className="text-[var(--text-muted)]">Pagina {safePage} de {totalPages}</span>
          <Link href={buildHref(Math.min(totalPages, safePage + 1))} className={buttonStyles({ variant: "secondary", className: safePage >= totalPages ? "pointer-events-none opacity-40" : "" })}>
            Siguiente
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function SALES_INTERNAL_ORDER_STYLES(status: SalesInternalOrderStatus) {
  return SALES_INTERNAL_ORDER_STATUS_STYLES[status];
}
