/* eslint-disable @typescript-eslint/no-explicit-any */ import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma, SalesInternalOrderStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getSessionContext } from "@/lib/auth/session-context";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { isSystemAdmin } from "@/lib/rbac/permissions";
import {
  hasProductionCockpitAccess,
  hasSalesWriteAccess,
  requireSalesWriteAccess,
} from "@/lib/rbac/sales";
import { pullSalesRequestOrder } from "@/lib/sales/request-service";
import {
  firstErrorMessage,
  salesInternalOrderTransitionSchema,
} from "@/lib/schemas/wms";
import { startPerf } from "@/lib/perf";
import { getRequestId } from "@/lib/request-meta";
import {
  getSalesConsoleStageProgress,
  getSalesConsoleWorkType,
  resolveSalesConsolePrimaryActionState,
  SALES_CONSOLE_STAGE_FLOW,
} from "@/lib/sales/console";
import {
  getMarkDeliveredEligibility,
  getTakeOrderEligibility,
  getSalesOrderFlowStage,
  getSalesOrderFlowNarrative,
  SALES_ORDER_FLOW_STAGE_LABELS,
  SALES_INTERNAL_ORDER_STATUS_LABELS,
  summarizePickListStatus,
  type SalesOrderFlowStage,
} from "@/lib/sales/internal-orders";
import { buildSalesRequestVisibilityWhere } from "@/lib/sales/visibility";
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
import { getOperationalUxState } from "@/lib/sales/operational-state";
export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;
const STALE_HOURS = 4;
const OPEN_ASSEMBLY_STATUSES = new Set(["BORRADOR", "ABIERTA", "EN_PROCESO"]);
const BUSINESS_TIMEZONE = "America/Mexico_City";
const QUEUE_LABELS: Record<FulfillmentQueueFilter, string> = {
  overdue: "Vencidos",
  today: "Vencen hoy",
  partial: "Surtidos parciales",
  stale: "Sin actividad reciente",
  unreleased: "Sin surtido liberado",
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
const STATUS_BADGE_VARIANTS: Record<
  SalesInternalOrderStatus,
  "neutral" | "success" | "danger"
> = { BORRADOR: "neutral", CONFIRMADA: "success", CANCELADA: "danger" };
const ACTION_LINK_CLASS =
  "inline-flex items-center justify-center rounded-[var(--radius-md)] border px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-surface)]";
const CHIP_BASE_CLASS =
  "inline-flex items-center rounded-[var(--radius-md)] border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-surface)]";
function getStatusBadgeVariant(status: SalesInternalOrderStatus) {
  return STATUS_BADGE_VARIANTS[status];
}
function getChipClassName(active: boolean) {
  return active
    ? `${CHIP_BASE_CLASS} border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)] shadow-sm`
    : `${CHIP_BASE_CLASS} border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]`;
}
function getTextLinkClassName() {
  return "text-[var(--accent)] underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-surface)]";
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
function buildRequestHref(args: {
  page: number;
  status?: SalesInternalOrderStatus;
  customer?: string;
  queue?: FulfillmentQueueFilter;
  stage?: SalesOrderFlowStage;
  preset?: OperationalPresetFilter;
}) {
  const params = new URLSearchParams();
  if (args.status) params.set("status", args.status);
  if (args.customer) params.set("customer", args.customer);
  if (args.queue) params.set("queue", args.queue);
  if (args.stage) params.set("stage", args.stage);
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
  const returnTo = returnToRaw.startsWith("/production/requests")
    ? returnToRaw
    : "/production/requests";
  if (!parsed.success) {
    redirect(
      `${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent(firstErrorMessage(parsed.error))}`,
    );
  }
  if (!sessionCtx.user?.id) {
    redirect(
      `${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent("Sesion invalida para tomar pedido")}`,
    );
  }
  try {
    const servicePerf = startPerf(
      "action.production.requests.list.pull.service",
    );
    await pullSalesRequestOrder(prisma, {
      orderId: parsed.data.orderId,
      assignedToUserId: sessionCtx.user.id,
    });
    servicePerf.end({ requestId, orderId: parsed.data.orderId });
    perf.end({ requestId, orderId: parsed.data.orderId, ok: true });
    redirect(
      `${returnTo}${returnTo.includes("?") ? "&" : "?"}ok=${encodeURIComponent("Pedido tomado; puedes continuar con la entrega")}`,
    );
  } catch (error) {
    perf.end({ requestId, orderId: parsed.data.orderId, ok: false });
    if (isNextRedirectError(error)) throw error;
    const message =
      error instanceof Error ? error.message : "No se pudo tomar el pedido";
    redirect(
      `${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`,
    );
  }
}
export default async function ProductionRequestsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [sp, sessionCtx] = await Promise.all([
    searchParams,
    getSessionContext(),
  ]);
  if (!sessionCtx.isAuthenticated) {
    redirect(`/login?callbackUrl=${encodeURIComponent("/production/requests")}`);
  }
  if (
    !hasProductionCockpitAccess({
      roles: sessionCtx.roles,
      permissions: sessionCtx.permissions,
    })
  ) {
    redirect("/forbidden?from=%2Fproduction%2Frequests");
  }
  const currentPage = parsePage(sp.page);
  const statusFilter: SalesInternalOrderStatus | undefined =
    sp.status === "BORRADOR" ||
    sp.status === "CONFIRMADA" ||
    sp.status === "CANCELADA"
      ? sp.status
      : undefined;
  const stageFilter: SalesOrderFlowStage | undefined =
    SALES_CONSOLE_STAGE_FLOW.includes(sp.stage as SalesOrderFlowStage)
      ? (sp.stage as SalesOrderFlowStage)
      : undefined;
  const queueFilter = isFulfillmentQueueFilter(sp.queue) ? sp.queue : undefined;
  const presetFilter = isOperationalPresetFilter(sp.preset)
    ? sp.preset
    : undefined;
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
  const totalCount = await prisma.salesInternalOrder.count({
    where: visibleWhere,
  });
  const orderSelect = {
    id: true,
    code: true,
    status: true,
    customerId: true,
    customerName: true,
    customer: { select: { id: true, name: true, isActive: true } },
    dueDate: true,
    assignedToUserId: true,
    assignedAt: true,
    pulledAt: true,
    preparedForDeliveryAt: true,
    deliveredToCustomerAt: true,
    updatedAt: true,
    warehouse: { select: { id: true, code: true, name: true } },
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
            id: true,
            sku: true,
            referenceCode: true,
            name: true,
            type: true,
            unitLabel: true,
            brand: true,
            inventory: {
              select: {
                quantity: true,
                reserved: true,
                available: true,
                location: { select: { warehouse: { select: { id: true } } } },
              },
            },
          },
        },
        assemblyConfiguration: {
          select: {
            hoseLength: true,
            assemblyQuantity: true,
            totalHoseRequired: true,
            sourceDocumentRef: true,
            notes: true,
            entryFittingProduct: { select: { sku: true, name: true } },
            hoseProduct: { select: { sku: true, name: true } },
            exitFittingProduct: { select: { sku: true, name: true } },
          },
        },
        pickTasks: {
          select: {
            reservedQty: true,
            pickedQty: true,
            shortQty: true,
            status: true,
            pickList: {
              select: {
                id: true,
                code: true,
                status: true,
                updatedAt: true,
                targetLocation: { select: { code: true, name: true } },
              },
            },
          },
        },
      },
    },
    pickLists: {
      where: { status: { not: "CANCELLED" } },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: 1,
      select: {
        code: true,
        status: true,
        updatedAt: true,
        targetLocation: { select: { code: true, name: true } },
      },
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
        preparedForDeliveryAt: true,
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
            id: true,
            code: true,
            sourceDocumentId: true,
            sourceDocumentLineId: true,
            status: true,
            updatedAt: true,
            assemblyWorkOrder: { select: { pickStatus: true } },
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
        const hasProductLines = candidate.lines.some(
          (line) => line.lineKind === "PRODUCT",
        );
        const hasAssemblyLines = candidate.lines.some(
          (line) => line.lineKind === "CONFIGURED_ASSEMBLY",
        );
        const assemblyLineIds = new Set(
          candidate.lines
            .filter((line) => line.lineKind === "CONFIGURED_ASSEMBLY")
            .map((line) => line.id),
        );
        const linkedForOrder = (linkedByOrder.get(candidate.id) ?? []).filter(
          (row) =>
            row.sourceDocumentLineId
              ? assemblyLineIds.has(row.sourceDocumentLineId)
              : false,
        );
        const linkedAssemblyOpen = linkedForOrder.filter((row) =>
          OPEN_ASSEMBLY_STATUSES.has(row.status),
        ).length;
        const hasCompletedConfiguredAssembly =
          !hasAssemblyLines ||
          (linkedForOrder.length > 0 && linkedAssemblyOpen === 0);
        const latestAssemblyUpdatedAt =
          linkedForOrder
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
          preparedForDeliveryAt: candidate.preparedForDeliveryAt,
          deliveredToCustomerAt: candidate.deliveredToCustomerAt,
          latestPickStatus: latestPick?.status ?? null,
          hasProductLines,
          hasAssemblyLines,
          hasCompletedConfiguredAssembly,
        });
        const hasCompletedDirectPick =
          !hasProductLines || latestPick?.status === "COMPLETED";
        const deliveredEligibility = getMarkDeliveredEligibility({
          status: candidate.status as SalesInternalOrderStatus,
          deliveredToCustomerAt: candidate.deliveredToCustomerAt,
          assignedToUserId: candidate.assignedToUserId,
          pulledAt: candidate.pulledAt,
          preparedForDeliveryAt: candidate.preparedForDeliveryAt,
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
          { now, timezone: BUSINESS_TIMEZONE, staleHours: STALE_HOURS },
        );
        const queueMatch = queueFilter
          ? matchQueueFilter(signals, queueFilter)
          : true;
        const presetMatch = presetFilter
          ? matchOperationalPreset(presetEvaluation, presetFilter, "primary")
          : true;
        const stageMatch = stageFilter ? flowStage === stageFilter : true;
        return queueMatch && stageMatch && presetMatch;
      })
      .map((row) => row.id);
    filteredCount = matchedIds.length;
    const totalPagesForQueue = Math.max(
      1,
      Math.ceil(filteredCount / PAGE_SIZE),
    );
    const safeCandidatePage = Math.min(currentPage, totalPagesForQueue);
    const pagedIds = matchedIds.slice(
      (safeCandidatePage - 1) * PAGE_SIZE,
      safeCandidatePage * PAGE_SIZE,
    );
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
          id: true,
          code: true,
          sourceDocumentId: true,
          sourceDocumentLineId: true,
          status: true,
          updatedAt: true,
          assemblyWorkOrder: { select: { pickStatus: true } },
        },
      })
    : [];
  const currentLinkedByOrder = new Map<
    string,
    typeof currentLinkedProduction
  >();
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
  const canRenderWriteActions = hasSalesWriteAccess({
    roles: sessionCtx.roles,
    permissions: sessionCtx.permissions,
  });
  const isOperatorView =
    sessionCtx.roles.includes("WAREHOUSE_OPERATOR") &&
    !sessionCtx.roles.includes("SALES_EXECUTIVE");
  const canOperateProductionActions =
    isSystemAdmin(sessionCtx.roles) ||
    sessionCtx.permissions.includes("production.execute");
  const canViewAdministrativeTable =
    canOperateProductionActions && !isOperatorView;
  const canViewCustomers =
    sessionCtx.isSystemAdmin ||
    sessionCtx.permissions.includes("customers.view");
  const buildHref = (
    page: number,
    status = statusFilter,
    queue = queueFilter,
    stage = stageFilter,
    preset = presetFilter,
  ) => {
    return buildRequestHref({
      page,
      status,
      customer: customerFilter || undefined,
      queue,
      stage,
      preset,
    });
  };
  // Los pedidos cerrados no compiten con el trabajo vivo. Siguen disponibles
  // como consulta, sin que el vendedor tenga que descifrar acciones caducadas.
  const activeOrders = orders.filter(
    (order) =>
      order.status !== "CANCELADA" && !order.deliveredToCustomerAt,
  );
  const historicalOrders = orders.filter(
    (order) =>
      order.status === "CANCELADA" || Boolean(order.deliveredToCustomerAt),
  );
  const activeFilters = [
    statusFilter
      ? {
          label: `Estado: ${SALES_INTERNAL_ORDER_STATUS_LABELS[statusFilter]}`,
          href: buildRequestHref({
            page: 1,
            customer: customerFilter || undefined,
            queue: queueFilter,
            stage: stageFilter,
            preset: presetFilter,
          }),
        }
      : null,
    queueFilter
      ? {
          label: `Cola: ${QUEUE_LABELS[queueFilter]}`,
          href: buildRequestHref({
            page: 1,
            status: statusFilter,
            customer: customerFilter || undefined,
            stage: stageFilter,
            preset: presetFilter,
          }),
        }
      : null,
    stageFilter
      ? {
          label: `Etapa: ${SALES_ORDER_FLOW_STAGE_LABELS[stageFilter]}`,
          href: buildRequestHref({
            page: 1,
            status: statusFilter,
            customer: customerFilter || undefined,
            queue: queueFilter,
            preset: presetFilter,
          }),
        }
      : null,
    presetFilter
      ? {
          label: `Filtro: ${PRESET_LABELS[presetFilter]}`,
          href: buildRequestHref({
            page: 1,
            status: statusFilter,
            customer: customerFilter || undefined,
            queue: queueFilter,
            stage: stageFilter,
          }),
        }
      : null,
    customerFilter
      ? {
          label: `Cliente: ${customerFilter}`,
          href: buildRequestHref({
            page: 1,
            status: statusFilter,
            queue: queueFilter,
            stage: stageFilter,
            preset: presetFilter,
          }),
        }
      : null,
  ].filter(Boolean) as Array<{ label: string; href: string }>;
  const quickFilters = (isOperatorView
    ? [
        { label: "Para actuar", href: buildHref(1, undefined, undefined, undefined, undefined), active: !statusFilter && !queueFilter && !stageFilter && !presetFilter },
        { label: "Por surtir", href: buildHref(1, undefined, "unreleased"), active: queueFilter === "unreleased" },
        { label: "En proceso", href: buildHref(1, undefined, undefined, "en_surtido"), active: stageFilter === "en_surtido" },
        { label: "Bloqueados", href: buildHref(1, undefined, undefined, undefined, "bloqueados"), active: presetFilter === "bloqueados" },
        { label: "Verificar", href: buildHref(1, undefined, "partial"), active: queueFilter === "partial" },
        { label: "Listos para entrega", href: buildHref(1, undefined, undefined, undefined, "listos_para_entrega"), active: presetFilter === "listos_para_entrega" },
      ]
    : [
        { label: "Para actuar", href: buildHref(1, undefined, undefined, undefined, undefined), active: !statusFilter && !queueFilter && !stageFilter && !presetFilter },
        { label: "En curso", href: buildHref(1, undefined, undefined, "en_surtido", undefined), active: stageFilter === "en_surtido" },
        { label: "Urgentes", href: buildHref(1, undefined, undefined, undefined, "urgentes"), active: presetFilter === "urgentes" },
        { label: "Para tomar", href: buildHref(1, undefined, undefined, undefined, "sin_asignar"), active: presetFilter === "sin_asignar" },
        { label: "Bloqueados", href: buildHref(1, undefined, undefined, undefined, "bloqueados"), active: presetFilter === "bloqueados" },
        { label: "Listos para entrega", href: buildHref(1, undefined, undefined, undefined, "listos_para_entrega"), active: presetFilter === "listos_para_entrega" },
      ]
  ).filter(Boolean) as Array<{
    label: string;
    href: string;
    active: boolean;
  }>;
  const advancedFilterGroups = [
    {
      title: "Estado del pedido",
      items: (Object.entries(SALES_INTERNAL_ORDER_STATUS_LABELS) as Array<
        [SalesInternalOrderStatus, string]
      >).map(([status, label]) => ({
        label: `${label}`,
        href: buildHref(1, status, undefined, undefined, undefined),
        active: statusFilter === status,
      })),
    },
    {
      title: "Etapa del flujo",
      items: SALES_CONSOLE_STAGE_FLOW.map((stage) => ({
        label: SALES_ORDER_FLOW_STAGE_LABELS[stage],
        href: buildHref(1, undefined, undefined, stage, undefined),
        active: stageFilter === stage,
      })),
    },
    {
      title: "Plazo y actividad",
      items: [
        {
          label: "Vencidos",
          href: buildHref(1, undefined, "overdue"),
          active: queueFilter === "overdue",
        },
        {
          label: "Vencen hoy",
          href: buildHref(1, undefined, "today"),
          active: queueFilter === "today",
        },
        {
          label: "Sin actividad reciente",
          href: buildHref(1, undefined, "stale"),
          active: queueFilter === "stale",
        },
      ],
    },
    {
      title: "Surtido y ensamble",
      items: [
        {
          label: "Sin surtido liberado",
          href: buildHref(1, undefined, "unreleased"),
          active: queueFilter === "unreleased",
        },
        {
          label: "Surtidos parciales",
          href: buildHref(1, undefined, "partial"),
          active: queueFilter === "partial",
        },
        {
          label: "Ensamble bloqueado",
          href: buildHref(1, undefined, "assembly_blocked"),
          active: queueFilter === "assembly_blocked",
        },
      ],
    },
  ];
  const myOrders = sessionCtx.user?.id
    ? orders
        .filter(
          (order) =>
            order.assignedToUserId === sessionCtx.user?.id &&
            order.status !== "CANCELADA",
        )
        .slice(0, 3)
    : [];
  const claimableOrders = orders
    .filter((order) => {
      const createdByManager =
        (order.requestedByUser?.userRoles.length ?? 0) > 0;
      return getTakeOrderEligibility({
        roles: sessionCtx.roles,
        status: order.status as SalesInternalOrderStatus,
        assignedToUserId: order.assignedToUserId,
        assignedToCurrentUser: order.assignedToUserId === sessionCtx.user?.id,
        pulledAt: order.pulledAt,
        isCreatedByManager: createdByManager,
      }).canTakeOrder;
    })
    .slice(0, 3);
  return (
    <div className="space-y-6">
      {" "}
      <PageHeader
        title={isOperatorView ? "Trabajo de almacén" : "Pedidos y surtidos"}
        description={
          isOperatorView
            ? "Elige una tarea física: surtir, continuar, verificar o completar un ensamble."
            : "Cola comercial para captura, seguimiento, asignación, surtido y entrega."
        }
        meta={`${filteredCount.toLocaleString("es-MX")} de ${totalCount.toLocaleString("es-MX")} pedidos${queueFilter ? ` · Cola: ${QUEUE_LABELS[queueFilter]}` : ""}${presetFilter ? ` · Filtro: ${PRESET_LABELS[presetFilter]}` : ""}${stageFilter ? ` · Etapa: ${SALES_ORDER_FLOW_STAGE_LABELS[stageFilter]}` : ""}`}
        actions={
          <>
            {canViewCustomers && !isOperatorView ? (
              <Link
                href="/sales/customers"
                className={buttonStyles({ variant: "secondary", size: "sm" })}
              >
                Clientes
              </Link>
            ) : null}
            {canRenderWriteActions ? (
              <Link
                href="/production/requests/new"
                className={buttonStyles({ variant: "primary", size: "sm" })}
              >
                + Nuevo pedido
              </Link>
            ) : null}
          </>
        }
      />
      {sp.ok ? (
        <div className="rounded-xl border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-4 py-3 text-sm text-[var(--status-success-text)]">
          {sp.ok}
        </div>
      ) : null}
      {sp.error ? (
        <div className="rounded-xl border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 text-sm text-[var(--status-danger-text)]">
          {sp.error}
        </div>
      ) : null}
      <section className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3 text-sm shadow-sm" data-testid="requests-work-summary">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="font-semibold text-[var(--text-primary)]">{isOperatorView ? "Trabajo asignado" : "Mi cola"}</span>
          <span>{myOrders.length.toLocaleString("es-MX")} asignados</span>
          {!isOperatorView ? <span>{claimableOrders.length.toLocaleString("es-MX")} disponibles para tomar</span> : null}
          {myOrders.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {myOrders.slice(0, 3).map((order) => <Link key={order.id} href={`/production/requests/${order.id}`} className={getTextLinkClassName()}>{order.code}</Link>)}
            </div>
          ) : null}
        </div>
      </section>
      <section className="space-y-3">
        <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 shadow-sm">
          <div
            className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            data-testid="requests-quick-filters"
          >
            {quickFilters.map((filter) => (
              <Link
                key={filter.label}
                href={filter.href}
                className={getChipClassName(filter.active)}
              >
                {filter.label}
              </Link>
            ))}
          </div>
          {activeFilters.length > 0 ? (
            <div
              className="mt-3 flex flex-wrap items-center gap-2 text-sm"
              data-testid="requests-active-filters"
            >
              <span className="font-semibold text-[var(--text-muted)]">
                Filtros activos:
              </span>
              {activeFilters.map((filter) => (
                <Link
                  key={filter.label}
                  href={filter.href}
                  className={getChipClassName(true)}
                >
                  {filter.label} ×
                </Link>
              ))}
              {activeFilters.length > 1 ? (
                <Link
                  href={buildRequestHref({ page: 1 })}
                  className={buttonStyles({ variant: "secondary", size: "sm" })}
                >
                  Limpiar todo
                </Link>
              ) : null}
            </div>
          ) : null}
          {!isOperatorView ? <details
            className="group mt-3 rounded-lg border border-dashed border-[var(--border-default)] bg-[var(--bg-subtle)] px-3 py-2"
            data-testid="requests-more-filters"
          >
            <summary className="cursor-pointer list-none text-sm font-semibold text-[var(--text-primary)]">
              Más filtros
            </summary>
            <div className="mt-3 space-y-4">
              {!isOperatorView ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    Cliente
                  </p>
                  <form
                    method="get"
                    className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-3"
                    data-testid="requests-customer-filter"
                  >
                    {statusFilter ? (
                      <input type="hidden" name="status" value={statusFilter} />
                    ) : null}
                    {queueFilter ? (
                      <input type="hidden" name="queue" value={queueFilter} />
                    ) : null}
                    {presetFilter ? (
                      <input type="hidden" name="preset" value={presetFilter} />
                    ) : null}
                    {stageFilter ? (
                      <input type="hidden" name="stage" value={stageFilter} />
                    ) : null}
                    <label className="block space-y-1">
                      <span className="text-sm text-[var(--text-muted)]">
                        Filtrar por cliente
                      </span>
                      <input
                        type="text"
                        name="customer"
                        defaultValue={customerFilter}
                        placeholder="Nombre o cuenta del cliente"
                        className="field"
                      />
                    </label>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="submit" className="btn-primary">
                        Filtrar
                      </button>
                      <Link
                        href={buildHref(
                          1,
                          undefined,
                          undefined,
                          undefined,
                          undefined,
                        )}
                        className={buttonStyles({ variant: "secondary" })}
                      >
                        Limpiar
                      </Link>
                    </div>
                  </form>
                </div>
              ) : null}
              <div className="grid gap-4 lg:grid-cols-2">
                {advancedFilterGroups.map((group) => (
                  <div key={group.title} className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      {isOperatorView && group.title === "Estado comercial"
                        ? "Estado del pedido"
                        : group.title}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {group.items.map((item) => (
                        <Link
                          key={item.label}
                          href={item.href}
                          className={getChipClassName(item.active)}
                        >
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </details> : null}
        </div>
      </section>{" "}
      <section className="space-y-4">
        {" "}
        {activeOrders.length === 0 ? (
          <div className="glass-card rounded-xl p-6 text-center text-[var(--text-muted)]">
            {" "}
            No hay pedidos activos para el filtro seleccionado.{" "}
          </div>
        ) : (
          activeOrders.map((order) => {
            const orderStatus = order.status as SalesInternalOrderStatus;
            const displayCustomer =
              order.customerName?.trim() || order.customer?.name || "--";
            const createdByManager =
              (order.requestedByUser?.userRoles.length ?? 0) > 0;
            const now = new Date();
            const productLines = (order.lines as any[]).filter(
              (line: any) => line.lineKind === "PRODUCT",
            );
            const configuredLines = (order.lines as any[]).filter(
              (line: any) => line.lineKind === "CONFIGURED_ASSEMBLY",
            );
            const assemblyLineIds = new Set(
              configuredLines.map((line: any) => line.id),
            );
            const linkedForOrder = (
              currentLinkedByOrder.get(order.id) ?? []
            ).filter((row) =>
              row.sourceDocumentLineId
                ? assemblyLineIds.has(row.sourceDocumentLineId)
                : false,
            );
            const pendingAssemblyOrders = linkedForOrder.filter(
              (row) =>
                row.status !== "COMPLETADA" && row.status !== "CANCELADA",
            );
            const assemblyHref =
              pendingAssemblyOrders.length === 1
                ? `/production/orders/${pendingAssemblyOrders[0].id}`
                : `/production/requests/${order.id}#ensambles`;
            const hasCompletedConfiguredAssembly =
              configuredLines.length === 0 ||
              (linkedForOrder.length === assemblyLineIds.size &&
                linkedForOrder.every((row) => row.status === "COMPLETADA"));
            const latestPick = order.pickLists[0] ?? null;
            const latestPickStatus = latestPick?.status ?? null;
            const hasCompletedDirectPick =
              productLines.length === 0 || latestPickStatus === "COMPLETED";
            const takeEligibility = getTakeOrderEligibility({
              roles: sessionCtx.roles,
              status: orderStatus,
              assignedToUserId: order.assignedToUserId,
              assignedToCurrentUser: order.assignedToUserId === sessionCtx.user?.id,
              pulledAt: order.pulledAt,
              isCreatedByManager: createdByManager,
            });
            const deliveredEligibility = getMarkDeliveredEligibility({
              status: orderStatus,
              deliveredToCustomerAt: order.deliveredToCustomerAt,
              assignedToUserId: order.assignedToUserId,
              pulledAt: order.pulledAt,
              preparedForDeliveryAt: order.preparedForDeliveryAt,
              hasCompletedDirectPick,
              hasCompletedConfiguredAssembly,
            });
            const operationalState = getOperationalUxState({
              blockingCause: "NONE",
              isPartial: latestPickStatus === "PARTIAL",
              assemblyBlocked: configuredLines.length > 0 && !hasCompletedConfiguredAssembly,
              isUnreleased: productLines.length > 0 && (!latestPickStatus || latestPickStatus === "DRAFT"),
              latestPickStatus,
              canMarkDelivered: deliveredEligibility.canMarkDelivered,
              isDelivered: Boolean(order.deliveredToCustomerAt),
              isCancelled: orderStatus === "CANCELADA",
              hasLines: productLines.length > 0 || configuredLines.length > 0,
            });
            const flowNarrative = getSalesOrderFlowNarrative({
              orderId: order.id,
              roles: sessionCtx.roles,
              status: orderStatus,
              assignedToUserId: order.assignedToUserId,
              preparedForDeliveryAt: order.preparedForDeliveryAt,
              deliveredToCustomerAt: order.deliveredToCustomerAt,
              pulledAt: order.pulledAt,
              latestPickStatus,
              hasProductLines: productLines.length > 0,
              hasAssemblyLines: configuredLines.length > 0,
              hasCompletedConfiguredAssembly,
              assemblyHref,
              takeEligibility,
              deliveredEligibility,
            });
            const workType = getSalesConsoleWorkType({
              flowStage: flowNarrative.flowStage,
              hasProductLines: productLines.length > 0,
              hasAssemblyLines: configuredLines.length > 0,
            });
            const stageProgress = getSalesConsoleStageProgress(
              flowNarrative.flowStage,
            );
            const primaryActionState = resolveSalesConsolePrimaryActionState({
              flowNarrative,
              canExecuteSalesActions: canRenderWriteActions,
              canExecuteProductionActions: canOperateProductionActions,
            });
            const dueDateMs = order.dueDate
              ? new Date(order.dueDate).getTime()
              : null;
            const isOverdue =
              dueDateMs !== null &&
              dueDateMs < now.getTime() &&
              orderStatus !== "CANCELADA";
            const isUrgent =
              !isOverdue &&
              dueDateMs !== null &&
              dueDateMs - now.getTime() <= 24 * 60 * 60 * 1000 &&
              dueDateMs - now.getTime() >= 0;
            const hasNoLines =
              productLines.length === 0 && configuredLines.length === 0;
            const attentionChips: Array<{
              label: string;
              variant: "neutral" | "accent" | "success" | "warning";
            }> = [];
            if (isOverdue) {
              attentionChips.push({ label: "Vencido", variant: "warning" });
            } else if (isUrgent) {
              attentionChips.push({ label: "Urgente", variant: "warning" });
            }
            if (primaryActionState.state === "blocked") {
              attentionChips.push({ label: "Bloqueado", variant: "warning" });
            }
            if (hasNoLines) {
              attentionChips.push({ label: "Sin líneas", variant: "neutral" });
            } else {
              attentionChips.push({
                label: `${productLines.length.toLocaleString("es-MX")} productos`,
                variant: productLines.length > 0 ? "accent" : "neutral",
              });
              if (configuredLines.length > 0) {
                attentionChips.push({
                  label: `${configuredLines.length.toLocaleString("es-MX")} ensambles`,
                  variant: "warning",
                });
              }
            }
            return (
              <article
                key={order.id}
                data-testid="request-card"
                className="glass-card space-y-4"
              >
                <header className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/production/requests/${order.id}`}
                        className="font-mono text-[var(--accent)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-surface)]"
                      >
                        {order.code}
                      </Link>
                      <Badge variant={getStatusBadgeVariant(orderStatus)}>
                        {SALES_INTERNAL_ORDER_STATUS_LABELS[orderStatus]}
                      </Badge>
                      <Badge variant={flowNarrative.flowBadgeVariant}>
                        {flowNarrative.flowStageLabel}
                      </Badge>
                      <Badge variant={operationalState.variant}>
                        {operationalState.label}
                      </Badge>
                    </div>
                    <p className="text-sm text-[var(--text-muted)]">
                      Cliente: {" "}
                      {order.customerId && canViewCustomers ? (
                        <Link
                          href={`/sales/customers/${order.customerId}`}
                          className={getTextLinkClassName()}
                        >
                          {displayCustomer}
                        </Link>
                      ) : (
                        displayCustomer
                      )}{" "}
                      {" · "}Almacen: {" "}
                      {order.warehouse
                        ? `${order.warehouse.code} - ${order.warehouse.name}`
                        : "--"}
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      <span><span className="font-medium text-[var(--text-primary)]">Siguiente:</span> {flowNarrative.nextRecommendedAction.label}</span>
                      <span><span className="font-medium text-[var(--text-primary)]">Compromiso:</span> {formatDate(order.dueDate)}</span>
                      <span><span className="font-medium text-[var(--text-primary)]">Responsable:</span> {order.assignedToUser ? (order.assignedToUser.name ?? order.assignedToUser.email ?? "--") : "Sin asignar"}</span>
                    </div>
                    <p className="text-xs text-[var(--text-muted)]">{operationalState.description}</p>
                    <div className="flex flex-wrap gap-2">
                      {attentionChips.map((chip) => (
                        <Badge key={chip.label} variant={chip.variant}>
                          {chip.label}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {primaryActionState.state === "allowed" &&
                    primaryActionState.code === "TAKE_ORDER" ? (
                      <form action={takeRequestFromList}>
                        <input
                          type="hidden"
                          name="orderId"
                          value={order.id}
                        />
                        <input
                          type="hidden"
                          name="returnTo"
                          value={buildHref(safePage)}
                        />
                        <button
                          type="submit"
                          disabled={!takeEligibility.canTakeOrder}
                          className={buttonStyles({
                          variant: "primary",
                            fullWidth: true,
                            className: !takeEligibility.canTakeOrder
                              ? "cursor-not-allowed opacity-55"
                              : "",
                          })}
                        >
                          {takeEligibility.takeActionLabel ?? "Tomar pedido"}
                        </button>
                      </form>
                    ) : primaryActionState.state === "allowed" ? (
                      <Link
                        href={primaryActionState.href}
                        className={buttonStyles({
                          variant: "primary",
                          fullWidth: true,
                        })}
                      >
                        {primaryActionState.label}
                      </Link>
                    ) : flowNarrative.flowStage !== "entregado" && flowNarrative.flowStage !== "cancelado" && flowNarrative.flowStage !== "captura" ? (
                      <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)] px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-medium text-[var(--text-primary)]">
                            {primaryActionState.label}
                          </p>
                          <Badge
                            variant={
                              primaryActionState.state === "blocked"
                                ? "warning"
                                : "neutral"
                            }
                            size="md"
                          >
                            {primaryActionState.state === "blocked"
                              ? "Bloqueada"
                              : "Informativa"}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-[var(--text-muted)]">
                          {primaryActionState.blockedReason ??
                            primaryActionState.reason}
                        </p>
                      </div>
                    ) : null}
                    <Link
                      href={`/production/requests/${order.id}`}
                      className={buttonStyles({
                        variant: primaryActionState.state === "allowed" || flowNarrative.flowStage === "entregado" || flowNarrative.flowStage === "cancelado" ? "secondary" : "primary",
                        fullWidth: true,
                      })}
                    >
                      {flowNarrative.flowStage === "entregado" || flowNarrative.flowStage === "cancelado" ? "Ver historial" : "Abrir pedido"}
                    </Link>
                  </div>
                </header>

                <details className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)]">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-surface)]">
                    <div>
                      <p className="font-medium text-[var(--text-primary)]">
                        Ver seguimiento operativo
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {isOperatorView
                          ? "Estado del pedido, validaciones y profundidad operativa."
                          : "Etapa comercial, validaciones y profundidad operativa."}
                      </p>
                    </div>
                    <Badge variant={flowNarrative.flowBadgeVariant}>
                      {flowNarrative.flowStageLabel}
                    </Badge>
                  </summary>
                  <div className="border-t border-[var(--border-soft)] p-4">
                    <div className="space-y-4">
                      <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
                        <p className="text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">
                          {isOperatorView ? "Seguimiento del pedido" : "Seguimiento comercial"}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {stageProgress.map((step) => (
                            <Badge key={step.stage} variant={step.variant}>
                              {step.step}. {step.label}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="grid gap-3 lg:grid-cols-2">
                        <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
                          <p className="text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">
                            Validaciones
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Badge
                              variant={
                                hasCompletedDirectPick ? "success" : "warning"
                              }
                            >
                              {hasCompletedDirectPick
                                ? "Surtido directo validado"
                                : latestPickStatus
                                  ? summarizePickListStatus(latestPickStatus)
                                  : "Surtido directo pendiente"}
                            </Badge>
                            <Badge
                              variant={
                                hasCompletedConfiguredAssembly
                                  ? "success"
                                  : configuredLines.length > 0
                                    ? "warning"
                                    : "neutral"
                              }
                            >
                              {hasCompletedConfiguredAssembly
                                ? "Ensamble validado"
                                : configuredLines.length > 0
                                  ? "Ensamble pendiente"
                                  : "Sin ensamble"}
                            </Badge>
                            <Badge
                              variant={
                                deliveredEligibility.canMarkDelivered
                                  ? "success"
                                  : "warning"
                              }
                            >
                              {deliveredEligibility.canMarkDelivered
                                ? "Entrega lista"
                                : "Entrega bloqueada"}
                            </Badge>
                          </div>
                          <p className="mt-3 text-xs text-[var(--text-muted)]">
                            {latestPick
                              ? `${latestPick.code} · ${latestPick.targetLocation.code} - ${latestPick.targetLocation.name}`
                              : "Sin pick list activo"}
                          </p>
                        </div>
                        <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
                          <p className="text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">
                            Profundidad operativa
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Badge
                              variant={productLines.length > 0 ? "accent" : "neutral"}
                            >
                              {productLines.length.toLocaleString("es-MX")} productos
                            </Badge>
                            <Badge
                              variant={
                                configuredLines.length > 0 ? "warning" : "neutral"
                              }
                            >
                              {configuredLines.length.toLocaleString("es-MX")} ensambles
                            </Badge>
                          </div>
                          <p className="mt-3 text-sm text-[var(--text-muted)]">
                            {hasNoLines
                              ? "Sin líneas"
                              : workType.detail}
                          </p>
                        </div>
                      </div>
                      <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
                        <p className="text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">
                          Resumen operativo persistente
                        </p>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          <div>
                            <p className="text-xs text-[var(--text-muted)]">
                              Asignación
                            </p>
                            <p className="text-sm text-[var(--text-primary)]">
                              {order.assignedToUser
                                ? (order.assignedToUser.name ??
                                  order.assignedToUser.email ??
                                  "--")
                                : "Sin asignar"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-[var(--text-muted)]">
                              Compromiso
                            </p>
                            <p className="text-sm text-[var(--text-primary)]">
                              {formatDate(order.dueDate)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-[var(--text-muted)]">
                              Último movimiento
                            </p>
                            <p className="text-sm text-[var(--text-primary)]">
                              {formatDateTime(order.updatedAt)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-[var(--text-muted)]">
                              Entrega
                            </p>
                            <p className="text-sm text-[var(--text-primary)]">
                              {deliveredEligibility.canMarkDelivered
                                ? "Lista para entrega"
                                : (deliveredEligibility.deliveredBlockedReason ??
                                  "Bloqueada")}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </details>
              </article>
            );
          })
        )}{" "}
      </section>{" "}
      {historicalOrders.length > 0 ? (
        <details id="historial" className="glass-card">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-surface)]">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                Historial
              </h2>
              <p className="text-sm text-[var(--text-muted)]">
                Pedidos entregados o cancelados, solo para consulta.
              </p>
            </div>
            <Badge variant="neutral">{historicalOrders.length}</Badge>
          </summary>
          <div className="mt-4 divide-y divide-[var(--border-soft)] rounded-xl border border-[var(--border-default)]">
            {historicalOrders.map((order) => (
              <Link
                key={order.id}
                href={`/production/requests/${order.id}`}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              >
                <span className="font-mono text-[var(--accent)]">{order.code}</span>
                <span className="text-[var(--text-muted)]">
                  {order.customerName?.trim() || order.customer?.name || "--"}
                </span>
                <Badge variant={order.status === "CANCELADA" ? "warning" : "success"}>
                  {order.status === "CANCELADA" ? "Cancelado" : "Entregado"}
                </Badge>
              </Link>
            ))}
          </div>
        </details>
      ) : null}
      {canViewAdministrativeTable ? (
        <details className="glass-card space-y-4">
          <summary className="cursor-pointer list-none">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                Vista administrativa
              </h2>
              <p className="text-sm text-[var(--text-muted)]">
                Resumen tabular para managers y admin sin desplazar la vista
                comercial principal.
              </p>
            </div>
          </summary>
          <div
            className="overflow-x-auto pt-4"
            tabIndex={0}
            aria-label="Tabla administrativa de pedidos"
          >
            <table className="w-full text-sm" aria-label="Tabla administrativa de pedidos">
              <thead>
                <tr className="border-b border-[var(--border-soft)] text-[var(--text-muted)]">
                  <th className="py-3 text-left">Código</th>
                  <th className="py-3 text-left">Cliente</th>
                  <th className="py-3 text-left">Estado</th>
                  <th className="py-3 text-left">Etapa</th>
                  <th className="py-3 text-left">Responsable</th>
                  <th className="py-3 text-left">Fecha compromiso</th>
                  <th className="py-3 text-left">Bloqueo / riesgo</th>
                  <th className="py-3 text-right">Último movimiento</th>
                  <th className="py-3 text-left">Acción</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="py-10 text-center text-[var(--text-muted)]"
                    >
                      No hay pedidos para el filtro seleccionado.
                    </td>
                  </tr>
                ) : (
                  orders.map((order) => {
                    const orderStatus = order.status as SalesInternalOrderStatus;
                    const displayCustomer =
                      order.customerName?.trim() || order.customer?.name || "--";
                    const createdByManager =
                      (order.requestedByUser?.userRoles.length ?? 0) > 0;
                    const hasProductLines = order.lines.some(
                      (line: any) => line.lineKind === "PRODUCT",
                    );
                    const hasAssemblyLines = order.lines.some(
                      (line: any) => line.lineKind === "CONFIGURED_ASSEMBLY",
                    );
                    const assemblyLineIds = new Set(
                      order.lines
                        .filter(
                          (line: any) => line.lineKind === "CONFIGURED_ASSEMBLY",
                        )
                        .map((line: any) => line.id),
                    );
                    const linkedForOrder = (
                      currentLinkedByOrder.get(order.id) ?? []
                    ).filter((row) =>
                      row.sourceDocumentLineId
                        ? assemblyLineIds.has(row.sourceDocumentLineId)
                        : false,
                    );
                    const hasCompletedConfiguredAssembly =
                      !hasAssemblyLines ||
                      (linkedForOrder.length === assemblyLineIds.size &&
                        linkedForOrder.every(
                          (row) => row.status === "COMPLETADA",
                        ));
                    const latestPickStatus = order.pickLists[0]?.status ?? null;
                    const takeEligibility = getTakeOrderEligibility({
                      roles: sessionCtx.roles,
                      status: orderStatus,
                      assignedToUserId: order.assignedToUserId,
                      assignedToCurrentUser: order.assignedToUserId === sessionCtx.user?.id,
                      pulledAt: order.pulledAt,
                      isCreatedByManager: createdByManager,
                    });
                    const hasCompletedDirectPick =
                      !hasProductLines || latestPickStatus === "COMPLETED";
                    const deliveredEligibility = getMarkDeliveredEligibility({
                      status: orderStatus,
                      deliveredToCustomerAt: order.deliveredToCustomerAt,
                      assignedToUserId: order.assignedToUserId,
                      pulledAt: order.pulledAt,
                      preparedForDeliveryAt: order.preparedForDeliveryAt,
                      hasCompletedDirectPick,
                      hasCompletedConfiguredAssembly,
                    });
                    const flowNarrative = getSalesOrderFlowNarrative({
                      orderId: order.id,
                      roles: sessionCtx.roles,
                      status: orderStatus,
                      assignedToUserId: order.assignedToUserId,
                      preparedForDeliveryAt: order.preparedForDeliveryAt,
                      deliveredToCustomerAt: order.deliveredToCustomerAt,
                      pulledAt: order.pulledAt,
                      latestPickStatus,
                      hasProductLines,
                      hasAssemblyLines,
                      hasCompletedConfiguredAssembly,
                      takeEligibility,
                      deliveredEligibility,
                    });
                    const riskLabel =
                      deliveredEligibility.canMarkDelivered
                        ? flowNarrative.riskLabel
                        : deliveredEligibility.deliveredBlockedReason ??
                          flowNarrative.riskLabel;

                    return (
                      <tr
                        key={order.id}
                        className="border-b border-[var(--border-soft)] align-top hover:bg-[var(--table-hover)]"
                      >
                        <td className="py-3">
                          <Link
                            href={`/production/requests/${order.id}`}
                            className="font-mono text-[var(--accent)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-surface)]"
                          >
                            {order.code}
                          </Link>
                        </td>
                        <td className="py-3 text-[var(--text-secondary)]">
                          {order.customerId && canViewCustomers ? (
                            <Link
                              href={`/sales/customers/${order.customerId}`}
                              className={getTextLinkClassName()}
                            >
                              {displayCustomer}
                            </Link>
                          ) : (
                            displayCustomer
                          )}
                        </td>
                        <td className="py-3">
                          <Badge variant={getStatusBadgeVariant(orderStatus)}>
                            {SALES_INTERNAL_ORDER_STATUS_LABELS[orderStatus]}
                          </Badge>
                        </td>
                        <td className="py-3 text-[var(--text-muted)]">
                          <Badge variant={flowNarrative.flowBadgeVariant}>
                            {flowNarrative.flowStageLabel}
                          </Badge>
                        </td>
                        <td className="py-3 text-[var(--text-muted)]">
                          {order.assignedToUser
                            ? (order.assignedToUser.name ??
                              order.assignedToUser.email ??
                              "--")
                            : "Sin asignar"}
                        </td>
                        <td className="py-3 text-[var(--text-muted)]">
                          {order.dueDate
                            ? new Date(order.dueDate).toLocaleDateString(
                                "es-MX",
                              )
                            : "--"}
                        </td>
                        <td className="py-3 text-[var(--text-muted)]">
                          {riskLabel}
                        </td>
                        <td className="py-3 text-right text-[var(--text-secondary)]">
                          {formatDateTime(order.updatedAt)}
                        </td>
                        <td className="py-3">
                          <Link
                            href={`/production/requests/${order.id}`}
                            className={buttonStyles({
                              variant: "secondary",
                              size: "sm",
                            })}
                          >
                            Ver detalle
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
      {totalPages > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          {" "}
          <Link
            href={buildHref(Math.max(1, safePage - 1))}
            className={`${ACTION_LINK_CLASS} border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] ${safePage <= 1 ? "pointer-events-none opacity-40" : ""}`}
          >
            {" "}
            ← Anterior{" "}
          </Link>{" "}
          <span className="text-[var(--text-muted)]">
            {" "}
            Pagina {safePage} de {totalPages}{" "}
          </span>{" "}
          <Link
            href={buildHref(Math.min(totalPages, safePage + 1))}
            className={`${ACTION_LINK_CLASS} border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] ${safePage >= totalPages ? "pointer-events-none opacity-40" : ""}`}
          >
            {" "}
            Siguiente →{" "}
          </Link>{" "}
        </div>
      ) : null}{" "}
    </div>
  );
}
