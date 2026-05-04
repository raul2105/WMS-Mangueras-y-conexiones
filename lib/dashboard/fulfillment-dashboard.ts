import { unstable_cache } from "next/cache";
import type { PickListStatus, Prisma, ProductionOrderStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  getSalesOrderFlowNarrative,
  summarizePickListStatus,
  type SalesOrderFlowBadgeVariant,
} from "@/lib/sales/internal-orders";

export type DashboardRole = "SYSTEM_ADMIN" | "MANAGER";

export type FulfillmentRiskLevel = "ALTO" | "MEDIO" | "BAJO";

export type FulfillmentBlockingCause =
  | "OVERDUE_UNRELEASED"
  | "DUE_TODAY_UNRELEASED"
  | "STALE_PICK"
  | "PICK_PARTIAL"
  | "ASSEMBLY_PENDING"
  | "UNASSIGNED"
  | "NONE";

export type FulfillmentQueueFilter = "overdue" | "today" | "partial" | "stale" | "unreleased" | "assembly_blocked";

export type ProductionOpsFilter = "direct_active" | "assembly_open" | "assembly_blocked" | "at_risk";

export type FulfillmentKpiSet = {
  ordersToFulfill: number;
  overdue: number;
  dueToday: number;
  activeDirectPicks: number;
  openLinkedAssembly: number;
  relevantInboundPurchaseOrders: number;
};

export type FulfillmentQueueRow = {
  orderId: string;
  orderCode: string;
  customerName: string;
  warehouseName: string;
  dueDate: Date | null;
  orderStatus: string;
  pickStatus: string;
  requiresAssembly: boolean;
  flowStageLabel: string;
  flowBadgeVariant: SalesOrderFlowBadgeVariant;
  lastUpdatedAt: Date;
  riskLevel: FulfillmentRiskLevel;
  riskScore: number;
  blockingCause: FulfillmentBlockingCause;
  blockingCauseLabel: string;
  actionHref: string;
  actionLabel: string;
};

export type FulfillmentAlert = {
  id: "overdue" | "today_unreleased" | "stale" | "assembly" | "partial";
  title: string;
  description: string;
  severity: "danger" | "warning" | "accent";
  count: number;
  href: string;
};

export type FulfillmentAnalytics = {
  topCustomers: Array<{ label: string; count: number; href: string }>;
  topWarehouses: Array<{ label: string; count: number; href: string }>;
  topRiskOrders: Array<{ label: string; riskLevel: FulfillmentRiskLevel; href: string }>;
  topBlockingCauses: Array<{ label: string; count: number; href: string }>;
};

export type FulfillmentDashboardSnapshot = {
  generatedAt: string;
  staleHours: number;
  role: DashboardRole;
  kpis: FulfillmentKpiSet;
  queue: FulfillmentQueueRow[];
  alerts: FulfillmentAlert[];
  analytics: FulfillmentAnalytics;
};

type QueueSignalInput = {
  dueDate: Date | null;
  orderUpdatedAt: Date;
  assignedToUserId: string | null;
  hasProductLines: boolean;
  hasAssemblyLines: boolean;
  latestPickStatus: PickListStatus | null;
  latestPickUpdatedAt: Date | null;
  linkedAssemblyTotal: number;
  linkedAssemblyOpen: number;
  linkedAssemblyUpdatedAt: Date | null;
  now: Date;
  staleHours: number;
};

export type QueueSignals = {
  isOverdue: boolean;
  isDueToday: boolean;
  isPartial: boolean;
  isStale: boolean;
  isUnreleased: boolean;
  assemblyBlocked: boolean;
  riskLevel: FulfillmentRiskLevel;
  riskScore: number;
  blockingCause: FulfillmentBlockingCause;
  lastUpdatedAt: Date;
};

const ACTIVE_PICK_STATUSES: PickListStatus[] = ["DRAFT", "RELEASED", "IN_PROGRESS", "PARTIAL"];
const OPEN_ASSEMBLY_STATUSES: ProductionOrderStatus[] = ["BORRADOR", "ABIERTA", "EN_PROCESO"];

export function isFulfillmentQueueFilter(value: string | undefined): value is FulfillmentQueueFilter {
  return value === "overdue" || value === "today" || value === "partial" || value === "stale" || value === "unreleased" || value === "assembly_blocked";
}

export function isProductionOpsFilter(value: string | undefined): value is ProductionOpsFilter {
  return value === "direct_active" || value === "assembly_open" || value === "assembly_blocked" || value === "at_risk";
}

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

export function getBlockingCauseLabel(cause: FulfillmentBlockingCause) {
  switch (cause) {
    case "OVERDUE_UNRELEASED":
      return "Vencido sin liberación de surtido";
    case "DUE_TODAY_UNRELEASED":
      return "Vence hoy y aún no liberado";
    case "STALE_PICK":
      return "Surtido activo sin movimiento";
    case "PICK_PARTIAL":
      return "Surtido parcial con faltante";
    case "ASSEMBLY_PENDING":
      return "Ensamble ligado pendiente";
    case "UNASSIGNED":
      return "Pedido sin responsable asignado";
    default:
      return "Sin bloqueo crítico";
  }
}

export function evaluateFulfillmentSignals(input: QueueSignalInput): QueueSignals {
  const todayStart = startOfDay(input.now);
  const todayEnd = endOfDay(input.now);

  const isOverdue = Boolean(input.dueDate && input.dueDate.getTime() < todayStart.getTime());
  const isDueToday = Boolean(input.dueDate && input.dueDate.getTime() >= todayStart.getTime() && input.dueDate.getTime() <= todayEnd.getTime());
  const isPartial = input.latestPickStatus === "PARTIAL";
  const isUnreleased = input.hasProductLines && (!input.latestPickStatus || input.latestPickStatus === "DRAFT");
  const assemblyBlocked = input.hasAssemblyLines && (input.linkedAssemblyTotal === 0 || input.linkedAssemblyOpen > 0);

  const lastUpdatedAt = [input.orderUpdatedAt, input.latestPickUpdatedAt, input.linkedAssemblyUpdatedAt]
    .filter((value): value is Date => value instanceof Date)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? input.orderUpdatedAt;

  const staleThreshold = input.now.getTime() - input.staleHours * 60 * 60 * 1000;

  // Approximation documented: "sin movimiento" uses updatedAt of order/pick/linked assembly,
  // which may not represent every physical movement in floor operations.
  const isStale = Boolean(input.latestPickStatus && ACTIVE_PICK_STATUSES.includes(input.latestPickStatus) && lastUpdatedAt.getTime() < staleThreshold);

  let riskLevel: FulfillmentRiskLevel = "BAJO";
  let riskScore = 10;
  let blockingCause: FulfillmentBlockingCause = "NONE";

  if (isOverdue && isUnreleased) {
    riskLevel = "ALTO";
    riskScore = 100;
    blockingCause = "OVERDUE_UNRELEASED";
  } else if (isStale) {
    riskLevel = "ALTO";
    riskScore = 95;
    blockingCause = "STALE_PICK";
  } else if (isPartial) {
    riskLevel = "ALTO";
    riskScore = 90;
    blockingCause = "PICK_PARTIAL";
  } else if (assemblyBlocked) {
    riskLevel = "MEDIO";
    riskScore = 70;
    blockingCause = "ASSEMBLY_PENDING";
  } else if (isDueToday && isUnreleased) {
    riskLevel = "MEDIO";
    riskScore = 65;
    blockingCause = "DUE_TODAY_UNRELEASED";
  } else if (!input.assignedToUserId) {
    riskLevel = "MEDIO";
    riskScore = 55;
    blockingCause = "UNASSIGNED";
  }

  if (isOverdue && riskLevel !== "ALTO") {
    riskLevel = "ALTO";
    riskScore = Math.max(riskScore, 85);
  }

  return {
    isOverdue,
    isDueToday,
    isPartial,
    isStale,
    isUnreleased,
    assemblyBlocked,
    riskLevel,
    riskScore,
    blockingCause,
    lastUpdatedAt,
  };
}

export function matchQueueFilter(signals: QueueSignals, filter: FulfillmentQueueFilter) {
  switch (filter) {
    case "overdue":
      return signals.isOverdue;
    case "today":
      return signals.isDueToday;
    case "partial":
      return signals.isPartial;
    case "stale":
      return signals.isStale;
    case "unreleased":
      return signals.isUnreleased;
    case "assembly_blocked":
      return signals.assemblyBlocked;
    default:
      return true;
  }
}

function toWarehouseLabel(warehouse: { code: string; name: string } | null | undefined) {
  if (!warehouse) return "Sin almacén";
  return `${warehouse.code} - ${warehouse.name}`;
}

function toCustomerLabel(customerName: string | null | undefined) {
  return customerName?.trim() || "Sin cliente";
}

function toDateKey(date: Date | null) {
  if (!date) return Number.MAX_SAFE_INTEGER;
  return date.getTime();
}

const loadFulfillmentDashboardSnapshot = unstable_cache(
  async (nowIso: string, staleHours: number, role: DashboardRole): Promise<FulfillmentDashboardSnapshot> => {
    const now = new Date(nowIso);

    const orderWhere: Prisma.SalesInternalOrderWhereInput = {
      status: "CONFIRMADA",
      deliveredToCustomerAt: null,
    };

    const [orders, inboundPoCount] = await Promise.all([
      prisma.salesInternalOrder.findMany({
        where: orderWhere,
        select: {
          id: true,
          code: true,
          status: true,
          customerName: true,
          dueDate: true,
          updatedAt: true,
          assignedToUserId: true,
          warehouse: { select: { code: true, name: true } },
          lines: { select: { id: true, lineKind: true } },
          pickLists: {
            where: { status: { not: "CANCELLED" } },
            orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
            take: 1,
            select: {
              status: true,
              updatedAt: true,
            },
          },
        },
      }),
      // Approximation documented: no deterministic order-level relevance against PO lines yet.
      prisma.purchaseOrder.count({
        where: {
          status: { in: ["CONFIRMADA", "EN_TRANSITO", "PARCIAL"] },
        },
      }),
    ]);

    const orderIds = orders.map((row) => row.id);
    const linkedProduction = orderIds.length
      ? await prisma.productionOrder.findMany({
          where: {
            sourceDocumentType: "SalesInternalOrder",
            sourceDocumentId: { in: orderIds },
          },
          select: {
            id: true,
            code: true,
            status: true,
            sourceDocumentId: true,
            sourceDocumentLineId: true,
            updatedAt: true,
          },
        })
      : [];

    const linkedByOrder = new Map<string, typeof linkedProduction>();
    for (const row of linkedProduction) {
      const key = row.sourceDocumentId ?? "";
      if (!key) continue;
      const bucket = linkedByOrder.get(key);
      if (bucket) {
        bucket.push(row);
      } else {
        linkedByOrder.set(key, [row]);
      }
    }

    const queueRows: FulfillmentQueueRow[] = orders.map((order) => {
      const latestPick = order.pickLists[0] ?? null;
      const hasProductLines = order.lines.some((line) => line.lineKind === "PRODUCT");
      const assemblyLines = order.lines.filter((line) => line.lineKind === "CONFIGURED_ASSEMBLY");
      const linkedForOrder = linkedByOrder.get(order.id) ?? [];
      const assemblyLineIds = new Set(assemblyLines.map((line) => line.id));
      const linkedForAssemblyLines = linkedForOrder.filter((row) => (row.sourceDocumentLineId ? assemblyLineIds.has(row.sourceDocumentLineId) : false));

      const linkedAssemblyOpen = linkedForAssemblyLines.filter((row) => OPEN_ASSEMBLY_STATUSES.includes(row.status)).length;
      const latestAssemblyUpdatedAt = linkedForAssemblyLines
        .map((row) => row.updatedAt)
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

      const signals = evaluateFulfillmentSignals({
        dueDate: order.dueDate,
        orderUpdatedAt: order.updatedAt,
        assignedToUserId: order.assignedToUserId,
        hasProductLines,
        hasAssemblyLines: assemblyLines.length > 0,
        latestPickStatus: latestPick?.status ?? null,
        latestPickUpdatedAt: latestPick?.updatedAt ?? null,
        linkedAssemblyTotal: linkedForAssemblyLines.length,
        linkedAssemblyOpen,
        linkedAssemblyUpdatedAt: latestAssemblyUpdatedAt,
        now,
        staleHours,
      });

      const activeDirectPick = latestPick?.status ? ACTIVE_PICK_STATUSES.includes(latestPick.status) : false;
      const firstOpenAssembly = linkedForAssemblyLines.find((row) => OPEN_ASSEMBLY_STATUSES.includes(row.status));
      const hasCompletedConfiguredAssembly = assemblyLines.length === 0
        || (
          linkedForAssemblyLines.length === assemblyLines.length
          && linkedForAssemblyLines.every((row) => row.status === "COMPLETADA")
        );
      const flowNarrative = getSalesOrderFlowNarrative({
        orderId: order.id,
        status: order.status,
        assignedToUserId: order.assignedToUserId,
        deliveredToCustomerAt: null,
        latestPickStatus: latestPick?.status ?? null,
        hasProductLines,
        hasAssemblyLines: assemblyLines.length > 0,
        hasCompletedConfiguredAssembly,
      });

      const actionHref = activeDirectPick
        ? `/production/fulfillment/${order.id}`
        : firstOpenAssembly
          ? `/production/orders/${firstOpenAssembly.id}`
          : `/production/requests/${order.id}`;

      const actionLabel = activeDirectPick
        ? "Operar surtido"
        : firstOpenAssembly
          ? "Operar ensamble"
          : "Ver pedido";

      return {
        orderId: order.id,
        orderCode: order.code,
        customerName: toCustomerLabel(order.customerName),
        warehouseName: toWarehouseLabel(order.warehouse),
        dueDate: order.dueDate,
        orderStatus: order.status,
        pickStatus: summarizePickListStatus(latestPick?.status),
        requiresAssembly: assemblyLines.length > 0,
        flowStageLabel: flowNarrative.flowStageLabel,
        flowBadgeVariant: flowNarrative.flowBadgeVariant,
        lastUpdatedAt: signals.lastUpdatedAt,
        riskLevel: signals.riskLevel,
        riskScore: signals.riskScore,
        blockingCause: signals.blockingCause,
        blockingCauseLabel: getBlockingCauseLabel(signals.blockingCause),
        actionHref,
        actionLabel,
      };
    });

    queueRows.sort((a, b) => {
      if (b.riskScore !== a.riskScore) return b.riskScore - a.riskScore;
      const dueDelta = toDateKey(a.dueDate) - toDateKey(b.dueDate);
      if (dueDelta !== 0) return dueDelta;
      return b.lastUpdatedAt.getTime() - a.lastUpdatedAt.getTime();
    });

    const signalMap = new Map<string, QueueSignals>();
    for (const order of orders) {
      const latestPick = order.pickLists[0] ?? null;
      const hasProductLines = order.lines.some((line) => line.lineKind === "PRODUCT");
      const assemblyLines = order.lines.filter((line) => line.lineKind === "CONFIGURED_ASSEMBLY");
      const linkedForOrder = linkedByOrder.get(order.id) ?? [];
      const assemblyLineIds = new Set(assemblyLines.map((line) => line.id));
      const linkedForAssemblyLines = linkedForOrder.filter((row) => (row.sourceDocumentLineId ? assemblyLineIds.has(row.sourceDocumentLineId) : false));
      const linkedAssemblyOpen = linkedForAssemblyLines.filter((row) => OPEN_ASSEMBLY_STATUSES.includes(row.status)).length;
      const latestAssemblyUpdatedAt = linkedForAssemblyLines
        .map((row) => row.updatedAt)
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

      signalMap.set(
        order.id,
        evaluateFulfillmentSignals({
          dueDate: order.dueDate,
          orderUpdatedAt: order.updatedAt,
          assignedToUserId: order.assignedToUserId,
          hasProductLines,
          hasAssemblyLines: assemblyLines.length > 0,
          latestPickStatus: latestPick?.status ?? null,
          latestPickUpdatedAt: latestPick?.updatedAt ?? null,
          linkedAssemblyTotal: linkedForAssemblyLines.length,
          linkedAssemblyOpen,
          linkedAssemblyUpdatedAt: latestAssemblyUpdatedAt,
          now,
          staleHours,
        }),
      );
    }

    const activeDirectPicks = orders.filter((order) => {
      const status = order.pickLists[0]?.status;
      return Boolean(status && ACTIVE_PICK_STATUSES.includes(status));
    }).length;

    const openLinkedAssembly = linkedProduction.filter((row) => OPEN_ASSEMBLY_STATUSES.includes(row.status)).length;

    const alerts: FulfillmentAlert[] = [
      {
        id: "overdue",
        title: "Pedidos vencidos sin surtido",
        description: "Pedidos confirmados vencidos y con bloqueo operativo activo.",
        severity: "danger",
        count: Array.from(signalMap.values()).filter((row) => row.isOverdue).length,
        href: "/production/requests?queue=overdue",
      },
      {
        id: "today_unreleased",
        title: "Pedidos de hoy sin liberación",
        description: "Comprometidos hoy que todavía no liberan surtido directo.",
        severity: "warning",
        count: Array.from(signalMap.values()).filter((row) => row.isDueToday && row.isUnreleased).length,
        href: "/production/requests?queue=today",
      },
      {
        id: "stale",
        title: "Surtidos activos sin movimiento",
        description: `Sin movimiento operativo por más de ${staleHours} horas.`,
        severity: "accent",
        count: Array.from(signalMap.values()).filter((row) => row.isStale).length,
        href: "/production/requests?queue=stale",
      },
      {
        id: "assembly",
        title: "Ensambles ligados no completados",
        description: "Pedidos con líneas configuradas y ensamble aún pendiente.",
        severity: "warning",
        count: Array.from(signalMap.values()).filter((row) => row.assemblyBlocked).length,
        href: "/production/requests?queue=assembly_blocked",
      },
      {
        id: "partial",
        title: "Pedidos parciales",
        description: "Surtidos directos con faltantes registrados.",
        severity: "danger",
        count: Array.from(signalMap.values()).filter((row) => row.isPartial).length,
        href: "/production/requests?queue=partial",
      },
    ];

    const topCustomers = Array.from(
      queueRows.reduce((acc, row) => {
        const next = (acc.get(row.customerName) ?? 0) + 1;
        acc.set(row.customerName, next);
        return acc;
      }, new Map<string, number>()),
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, count]) => ({ label, count, href: `/production/requests?customer=${encodeURIComponent(label === "Sin cliente" ? "" : label)}` }));

    const topWarehouses = Array.from(
      queueRows.reduce((acc, row) => {
        const next = (acc.get(row.warehouseName) ?? 0) + 1;
        acc.set(row.warehouseName, next);
        return acc;
      }, new Map<string, number>()),
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, count]) => ({ label, count, href: "/production/requests" }));

    const topRiskOrders = queueRows.slice(0, 8).map((row) => ({
      label: row.orderCode,
      riskLevel: row.riskLevel,
      href: `/production/requests/${row.orderId}`,
    }));

    const topBlockingCauses = Array.from(
      queueRows.reduce((acc, row) => {
        if (row.blockingCause === "NONE") return acc;
        const next = (acc.get(row.blockingCause) ?? 0) + 1;
        acc.set(row.blockingCause, next);
        return acc;
      }, new Map<FulfillmentBlockingCause, number>()),
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cause, count]) => {
        const href = cause === "ASSEMBLY_PENDING" ? "/production/requests?queue=assembly_blocked" : "/production/requests";
        return { label: getBlockingCauseLabel(cause), count, href };
      });

    const kpis: FulfillmentKpiSet = {
      ordersToFulfill: orders.length,
      overdue: alerts.find((alert) => alert.id === "overdue")?.count ?? 0,
      dueToday: Array.from(signalMap.values()).filter((row) => row.isDueToday).length,
      activeDirectPicks,
      openLinkedAssembly,
      relevantInboundPurchaseOrders: inboundPoCount,
    };

    const queue = role === "SYSTEM_ADMIN" ? queueRows.slice(0, 25) : queueRows.slice(0, 50);

    return {
      generatedAt: now.toISOString(),
      staleHours,
      role,
      kpis,
      queue,
      alerts,
      analytics: {
        topCustomers,
        topWarehouses,
        topRiskOrders,
        topBlockingCauses,
      },
    };
  },
  ["dashboard-fulfillment-v1"],
  { revalidate: 60, tags: ["dashboard:fulfillment"] },
);

export async function getFulfillmentDashboardSnapshot(args: { now?: Date; staleHours?: number; role: DashboardRole }) {
  const now = args.now ?? new Date();
  const staleHours = args.staleHours ?? 4;
  return loadFulfillmentDashboardSnapshot(now.toISOString(), staleHours, args.role);
}
