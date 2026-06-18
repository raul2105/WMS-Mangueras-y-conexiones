/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { redirect } from "next/navigation";
import type { SalesInternalOrderStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getSessionContext } from "@/lib/auth/session-context";
import { pageGuard } from "@/components/rbac/PageGuard";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import RequestProductLineForm from "@/components/RequestProductLineForm";
import { isSystemAdmin } from "@/lib/rbac/permissions";
import { hasSalesWriteAccess, requireSalesWriteAccess } from "@/lib/rbac/sales";
import {
  addSalesRequestProductLine,
  cancelSalesRequestOrder,
  confirmSalesRequestOrder,
  deleteSalesRequestLine,
  markSalesRequestDelivered,
  pullSalesRequestOrder,
} from "@/lib/sales/request-service";
import { buildSalesRequestVisibilityWhere } from "@/lib/sales/visibility";
import {
  getMarkDeliveredEligibility,
  getSalesOrderFlowNarrative,
  getTakeOrderEligibility,
  SALES_INTERNAL_ORDER_STATUS_LABELS,
  summarizePickListStatus,
  summarizeProductionStatus,
} from "@/lib/sales/internal-orders";
import { getSalesConsoleTimelineItems } from "@/lib/sales/console";
import {
  firstErrorMessage,
  salesInternalOrderProductLineCreateSchema,
  salesInternalOrderTransitionSchema,
} from "@/lib/schemas/wms";
import { startPerf } from "@/lib/perf";
import { getRequestId } from "@/lib/request-meta";

export const dynamic = "force-dynamic";

function isNextRedirectError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof (error as { digest?: unknown }).digest === "string" &&
      (error as { digest: string }).digest.startsWith("NEXT_REDIRECT"),
  );
}

async function confirmRequest(formData: FormData) {
  "use server";
  const perf = startPerf("action.production.requests.detail.confirm");
  const requestId = await getRequestId();
  await requireSalesWriteAccess();
  const sessionCtx = await getSessionContext();
  const parsed = salesInternalOrderTransitionSchema.safeParse({
    orderId: String(formData.get("orderId") ?? "").trim(),
  });
  if (!parsed.success) {
    redirect(`/production/requests?error=${encodeURIComponent(firstErrorMessage(parsed.error))}`);
  }

  try {
    const servicePerf = startPerf("action.production.requests.detail.confirm.service");
    await confirmSalesRequestOrder(prisma, {
      orderId: parsed.data.orderId,
      confirmedByUserId: sessionCtx.user?.id ?? null,
    });
    servicePerf.end({ requestId, orderId: parsed.data.orderId });

    const { emitSyncEventSafe } = await import("@/lib/sync/sync-events");
    await emitSyncEventSafe({
      entityType: "ORDER",
      entityId: parsed.data.orderId,
      action: "UPDATE",
      payload: { orderId: parsed.data.orderId, status: "CONFIRMADA" },
    });
    perf.end({ requestId, orderId: parsed.data.orderId, ok: true });

    redirect(`/production/requests/${parsed.data.orderId}?ok=${encodeURIComponent("Pedido confirmado")}`);
  } catch (error) {
    perf.end({ requestId, orderId: parsed.data.orderId, ok: false });
    if (isNextRedirectError(error)) throw error;
    const message = error instanceof Error ? error.message : "No se pudo confirmar el pedido";
    redirect(`/production/requests/${parsed.data.orderId}?error=${encodeURIComponent(message)}`);
  }
}

async function cancelRequest(formData: FormData) {
  "use server";
  const perf = startPerf("action.production.requests.detail.cancel");
  const requestId = await getRequestId();
  await requireSalesWriteAccess();
  const sessionCtx = await getSessionContext();
  const parsed = salesInternalOrderTransitionSchema.safeParse({
    orderId: String(formData.get("orderId") ?? "").trim(),
  });
  if (!parsed.success) {
    redirect(`/production/requests?error=${encodeURIComponent(firstErrorMessage(parsed.error))}`);
  }

  try {
    const servicePerf = startPerf("action.production.requests.detail.cancel.service");
    await cancelSalesRequestOrder(prisma, {
      orderId: parsed.data.orderId,
      cancelledByUserId: sessionCtx.user?.id ?? null,
    });
    servicePerf.end({ requestId, orderId: parsed.data.orderId });

    const { emitSyncEventSafe } = await import("@/lib/sync/sync-events");
    await emitSyncEventSafe({
      entityType: "ORDER",
      entityId: parsed.data.orderId,
      action: "UPDATE",
      payload: { orderId: parsed.data.orderId, status: "CANCELADA" },
    });
    perf.end({ requestId, orderId: parsed.data.orderId, ok: true });

    redirect(`/production/requests/${parsed.data.orderId}?ok=${encodeURIComponent("Pedido cancelado")}`);
  } catch (error) {
    perf.end({ requestId, orderId: parsed.data.orderId, ok: false });
    if (isNextRedirectError(error)) throw error;
    const message = error instanceof Error ? error.message : "No se pudo cancelar el pedido";
    redirect(`/production/requests/${parsed.data.orderId}?error=${encodeURIComponent(message)}`);
  }
}

async function takeRequest(formData: FormData) {
  "use server";
  const perf = startPerf("action.production.requests.detail.pull");
  const requestId = await getRequestId();
  await requireSalesWriteAccess();
  const sessionCtx = await getSessionContext();
  const parsed = salesInternalOrderTransitionSchema.safeParse({
    orderId: String(formData.get("orderId") ?? "").trim(),
  });
  if (!parsed.success) {
    redirect(`/production/requests?error=${encodeURIComponent(firstErrorMessage(parsed.error))}`);
  }
  if (!sessionCtx.user?.id) {
    redirect(`/production/requests/${parsed.data.orderId}?error=${encodeURIComponent("Sesión inválida para tomar pedido")}`);
  }

  try {
    const servicePerf = startPerf("action.production.requests.detail.pull.service");
    await pullSalesRequestOrder(prisma, {
      orderId: parsed.data.orderId,
      assignedToUserId: sessionCtx.user.id,
    });
    servicePerf.end({ requestId, orderId: parsed.data.orderId });
    perf.end({ requestId, orderId: parsed.data.orderId, ok: true });
    redirect(`/production/requests/${parsed.data.orderId}?ok=${encodeURIComponent("Pedido tomado y asignado")}`);
  } catch (error) {
    perf.end({ requestId, orderId: parsed.data.orderId, ok: false });
    if (isNextRedirectError(error)) throw error;
    const message = error instanceof Error ? error.message : "No se pudo tomar el pedido";
    redirect(`/production/requests/${parsed.data.orderId}?error=${encodeURIComponent(message)}`);
  }
}

async function markDelivered(formData: FormData) {
  "use server";
  const perf = startPerf("action.production.requests.detail.delivered");
  const requestId = await getRequestId();
  await requireSalesWriteAccess();
  const sessionCtx = await getSessionContext();
  const parsed = salesInternalOrderTransitionSchema.safeParse({
    orderId: String(formData.get("orderId") ?? "").trim(),
  });
  if (!parsed.success) {
    redirect(`/production/requests?error=${encodeURIComponent(firstErrorMessage(parsed.error))}`);
  }
  if (!sessionCtx.user?.id) {
    redirect(`/production/requests/${parsed.data.orderId}?error=${encodeURIComponent("Sesión inválida para marcar entrega")}`);
  }

  try {
    const servicePerf = startPerf("action.production.requests.detail.delivered.service");
    const result = await markSalesRequestDelivered(prisma, {
      orderId: parsed.data.orderId,
      deliveredByUserId: sessionCtx.user.id,
    });
    servicePerf.end({ requestId, orderId: parsed.data.orderId });
    perf.end({ requestId, orderId: parsed.data.orderId, ok: true });
    const message = result.alreadyDelivered
      ? result.warning
      : "Pedido marcado como entregado al cliente";
    redirect(`/production/requests/${parsed.data.orderId}?ok=${encodeURIComponent(message)}`);
  } catch (error) {
    perf.end({ requestId, orderId: parsed.data.orderId, ok: false });
    if (isNextRedirectError(error)) throw error;
    const message = error instanceof Error ? error.message : "No se pudo marcar la entrega";
    redirect(`/production/requests/${parsed.data.orderId}?error=${encodeURIComponent(message)}`);
  }
}

async function addProductLine(formData: FormData) {
  "use server";
  const perf = startPerf("action.production.requests.detail.add_line");
  const requestId = await getRequestId();
  await requireSalesWriteAccess();

  const orderId = String(formData.get("orderId") ?? "").trim();
  const productId = String(formData.get("productId") ?? "").trim();
  const requestedQtyRaw = String(formData.get("requestedQty") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  const parsed = salesInternalOrderProductLineCreateSchema.safeParse({
    orderId,
    productId,
    requestedQtyRaw,
    notes: notes || undefined,
  });
  if (!parsed.success) {
    redirect(`/production/requests/${orderId}?error=${encodeURIComponent(firstErrorMessage(parsed.error))}`);
  }

  try {
    const servicePerf = startPerf("action.production.requests.detail.add_line.service");
    await addSalesRequestProductLine(prisma, {
      orderId: parsed.data.orderId,
      productId: parsed.data.productId,
      requestedQty: parsed.data.requestedQtyRaw,
      notes: parsed.data.notes ?? null,
    });
    servicePerf.end({ requestId, orderId, productId });
    perf.end({ requestId, orderId, productId, ok: true });
    redirect(`/production/requests/${orderId}?ok=${encodeURIComponent("Producto agregado al pedido")}`);
  } catch (error) {
    perf.end({ requestId, orderId, productId, ok: false });
    if (isNextRedirectError(error)) throw error;
    const message = error instanceof Error ? error.message : "No se pudo agregar el producto";
    redirect(`/production/requests/${orderId}?error=${encodeURIComponent(message)}`);
  }
}

async function deleteLine(formData: FormData) {
  "use server";
  const perf = startPerf("action.production.requests.detail.delete_line");
  const requestId = await getRequestId();
  await requireSalesWriteAccess();

  const orderId = String(formData.get("orderId") ?? "").trim();
  const lineId = String(formData.get("lineId") ?? "").trim();
  if (!orderId || !lineId) {
    redirect("/production/requests");
  }

  try {
    const servicePerf = startPerf("action.production.requests.detail.delete_line.service");
    await deleteSalesRequestLine(prisma, { orderId, lineId });
    servicePerf.end({ requestId, orderId, lineId });
    perf.end({ requestId, orderId, lineId, ok: true });
    redirect(`/production/requests/${orderId}?ok=${encodeURIComponent("Línea eliminada")}`);
  } catch (error) {
    perf.end({ requestId, orderId, lineId, ok: false });
    if (isNextRedirectError(error)) throw error;
    const message = error instanceof Error ? error.message : "No se pudo eliminar la línea";
    redirect(`/production/requests/${orderId}?error=${encodeURIComponent(message)}`);
  }
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

function getExecutionBadgeVariant(status: string | null | undefined): "neutral" | "accent" | "success" | "warning" | "danger" {
  switch (status) {
    case "COMPLETED":
    case "COMPLETADA":
      return "success";
    case "PARTIAL":
    case "IN_PROGRESS":
    case "RELEASED":
    case "ABIERTA":
    case "EN_PROCESO":
      return "warning";
    case "CANCELLED":
    case "CANCELADA":
      return "danger";
    default:
      return "neutral";
  }
}

export default async function ProductionRequestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await pageGuard("sales.view");
  const { id } = await params;
  const sp = await searchParams;
  const sessionCtx = await getSessionContext();
  const visibilityWhere = buildSalesRequestVisibilityWhere({
    roles: sessionCtx.roles,
    userId: sessionCtx.user?.id ?? null,
    baseWhere: { id },
  });

  const order = await (prisma as any).salesInternalOrder.findFirst({
    where: visibilityWhere,
    select: {
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
      createdAt: true,
      confirmedAt: true,
      cancelledAt: true,
      warehouse: { select: { id: true, code: true, name: true } },
      requestedByUser: {
        select: {
          name: true,
          email: true,
          userRoles: {
            where: {
              role: {
                code: "MANAGER",
                isActive: true,
              },
            },
            select: { roleId: true },
          },
        },
      },
      assignedToUser: { select: { name: true, email: true } },
      confirmedByUser: { select: { name: true, email: true } },
      cancelledByUser: { select: { name: true, email: true } },
      deliveredByUser: { select: { name: true, email: true } },
      pickLists: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          code: true,
          status: true,
          updatedAt: true,
          targetLocation: { select: { code: true, name: true } },
        },
      },
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
                  location: {
                    select: {
                      warehouse: { select: { id: true } },
                    },
                  },
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
                  targetLocation: { select: { code: true, name: true } },
                },
              },
            },
          },
        },
      },
    },
  }) as any;
  if (!order) redirect("/production/requests");

  const linkedProductionOrders = await prisma.productionOrder.findMany({
    where: {
      sourceDocumentType: "SalesInternalOrder",
      sourceDocumentId: order.id,
    },
    select: {
      id: true,
      code: true,
      status: true,
      sourceDocumentLineId: true,
      assemblyWorkOrder: {
        select: {
          pickStatus: true,
        },
      },
    },
  });

  const recentAudit = await prisma.auditLog.findMany({
    where: {
      entityType: "SALES_INTERNAL_ORDER",
      entityId: order.id,
      action: {
        in: [
          "CREATE_REQUEST_DRAFT",
          "CONFIRM_REQUEST",
          "PULL_REQUEST",
          "RELEASE_DIRECT_PICKLIST",
          "CONFIRM_DIRECT_PICK",
          "MARK_DELIVERED_TO_CUSTOMER",
          "CANCEL_REQUEST",
        ],
      },
    },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: {
      action: true,
      actor: true,
      createdAt: true,
      actorUser: { select: { name: true, email: true } },
    },
  });

  const linkedProductionByLine = new Map(
    linkedProductionOrders
      .filter((row) => row.sourceDocumentLineId)
      .map((row) => [row.sourceDocumentLineId as string, row])
  );

  const canOperateDirectPick = isSystemAdmin(sessionCtx.roles) || sessionCtx.permissions.includes("production.execute");
  const canViewCustomers = sessionCtx.isSystemAdmin || sessionCtx.permissions.includes("customers.view");
  const orderStatus = order.status as SalesInternalOrderStatus;
  const orderStatusBadgeVariant: "neutral" | "success" | "danger" =
    orderStatus === "BORRADOR" ? "neutral" : orderStatus === "CONFIRMADA" ? "success" : "danger";
  const displayCustomer = order.customerName?.trim() || order.customer?.name || "--";
  const latestPickList = order.pickLists[0] ?? null;
  const isCreatedByManager = (order.requestedByUser?.userRoles.length ?? 0) > 0;
  const canRenderWriteActions = hasSalesWriteAccess({ roles: sessionCtx.roles, permissions: sessionCtx.permissions });
  const takeEligibility = getTakeOrderEligibility({
    roles: sessionCtx.roles,
    status: orderStatus,
    assignedToUserId: order.assignedToUserId,
    isCreatedByManager,
  });

  const productLines = (order.lines as any[]).filter((line: any) => line.lineKind === "PRODUCT");
  const configuredLines = (order.lines as any[]).filter((line: any) => line.lineKind === "CONFIGURED_ASSEMBLY");
  const hasCompletedDirectPick = productLines.length === 0 || latestPickList?.status === "COMPLETED";
  const expectedAssemblyLineIds = new Set(configuredLines.map((line: any) => line.id));
  const hasCompletedConfiguredAssembly = configuredLines.length === 0
    || (
      linkedProductionOrders.length === configuredLines.length
      && linkedProductionOrders.every((row) => expectedAssemblyLineIds.has(row.sourceDocumentLineId ?? "") && row.status === "COMPLETADA")
    );
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
    latestPickStatus: latestPickList?.status ?? null,
    hasProductLines: productLines.length > 0,
    hasAssemblyLines: configuredLines.length > 0,
    hasCompletedConfiguredAssembly,
    takeEligibility,
    deliveredEligibility,
  });
  const timeline = getSalesConsoleTimelineItems({
    createdAt: order.createdAt,
    confirmedAt: order.confirmedAt,
    assignedAt: order.assignedAt,
    pulledAt: order.pulledAt,
    latestPickStatus: latestPickList?.status ?? null,
    latestPickUpdatedAt: latestPickList?.updatedAt ?? null,
    deliveredAt: order.deliveredToCustomerAt,
    cancelledAt: order.cancelledAt,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <p className="font-mono text-sm text-[var(--accent)]">{order.code}</p>
          <h1 className="text-3xl font-semibold text-[var(--text-primary)]">Pedido comercial</h1>
          <p className="text-sm text-[var(--text-muted)]">
            Cliente:{" "}
            {order.customerId && canViewCustomers ? (
              <Link href={`/sales/customers/${order.customerId}`} className="text-[var(--accent)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-surface)]">
                {displayCustomer}
              </Link>
            ) : (
              displayCustomer
            )}{" "}
            · Almacen: {order.warehouse ? `${order.warehouse.code} - ${order.warehouse.name}` : "--"}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Badge variant={orderStatusBadgeVariant}>{SALES_INTERNAL_ORDER_STATUS_LABELS[orderStatus]}</Badge>
          <Link href="/production/requests" className={buttonStyles({ variant: "secondary" })}>
            ← Pedidos
          </Link>
        </div>
      </div>

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

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.12fr)_minmax(320px,0.88fr)]">
        <div className="glass-card space-y-4 text-sm text-[var(--text-secondary)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Estado y siguiente acción</h2>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[var(--text-muted)]">Etapa actual:</span>
                <Badge variant={flowNarrative.flowBadgeVariant}>{flowNarrative.flowStageLabel}</Badge>
              </div>
              <p className="text-[var(--text-primary)]">
                Cliente:{" "}
                {order.customerId && canViewCustomers ? (
                  <Link href={`/sales/customers/${order.customerId}`} className="text-[var(--accent)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-surface)]">
                    {displayCustomer}
                  </Link>
                ) : (
                  displayCustomer
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/production/requests" className={buttonStyles({ variant: "secondary" })}>
                ← Pedidos
              </Link>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
              Siguiente acción
            </p>
            <p className="mt-2 text-[var(--text-primary)]">
              {flowNarrative.nextRecommendedAction.blockedReason ? (
                <span className="text-[var(--text-muted)]">
                  {flowNarrative.nextRecommendedAction.label}
                </span>
              ) : (
                <Link href={flowNarrative.nextRecommendedAction.href} className="text-[var(--accent)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-surface)]">
                  {flowNarrative.nextRecommendedAction.label}
                </Link>
              )}
            </p>
            {flowNarrative.nextRecommendedAction.blockedReason ? (
              <p className="mt-1 text-xs text-[var(--status-warning-text)]">
                {flowNarrative.nextRecommendedAction.blockedReason}
              </p>
            ) : null}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)] px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                Pedido
              </p>
              <p className="mt-1 text-[var(--text-primary)]">
                {order.warehouse ? `${order.warehouse.code} - ${order.warehouse.name}` : "--"}
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                Fecha compromiso: {formatDate(order.dueDate)}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)] px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                Asignación
              </p>
              <p className="mt-1 text-[var(--text-primary)]">
                {order.assignedToUser?.name ?? order.assignedToUser?.email ?? "--"}
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                Solicitado por: {order.requestedByUser?.name ?? order.requestedByUser?.email ?? "--"}
              </p>
            </div>
          </div>

          {order.notes ? (
            <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)] p-4 text-[var(--text-secondary)]">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                Notas
              </p>
              <p className="mt-2 text-sm">{order.notes}</p>
            </div>
          ) : null}
        </div>

        <div className="glass-card space-y-4">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Acciones</h2>
          <div className="flex flex-wrap gap-3">
            {canRenderWriteActions ? (
              <>
                {order.status === "BORRADOR" ? (
                  <form action={confirmRequest}>
                    <input type="hidden" name="orderId" value={order.id} />
                    <button type="submit" className="btn-primary" disabled={order.lines.length === 0}>
                      Confirmar pedido
                    </button>
                  </form>
                ) : null}
                {order.status !== "CANCELADA" ? (
                  <form action={cancelRequest}>
                    <input type="hidden" name="orderId" value={order.id} />
                    <button type="submit" className="btn-secondary border-[var(--danger-soft)] bg-[var(--danger-soft)] text-[var(--danger-text)] hover:bg-[var(--danger-soft-hover)]">
                      Cancelar pedido
                    </button>
                  </form>
                ) : null}
                <div className="space-y-1">
                  <form action={takeRequest}>
                    <input type="hidden" name="orderId" value={order.id} />
                    <button
                      type="submit"
                      disabled={!takeEligibility.canTakeOrder}
                      className={`btn-primary ${!takeEligibility.canTakeOrder ? "cursor-not-allowed opacity-55" : ""}`}
                    >
                      Tomar pedido
                    </button>
                  </form>
                  {!takeEligibility.canTakeOrder ? <p className="text-xs text-[var(--status-warning-text)]">{takeEligibility.takeBlockedReason}</p> : null}
                </div>
                <div className="space-y-1">
                  <form action={markDelivered}>
                    <input type="hidden" name="orderId" value={order.id} />
                    <button
                      type="submit"
                      disabled={!deliveredEligibility.canMarkDelivered}
                      className={`btn-secondary ${!deliveredEligibility.canMarkDelivered ? "cursor-not-allowed opacity-55" : ""}`}
                    >
                      Entregado al cliente
                    </button>
                  </form>
                  {!deliveredEligibility.canMarkDelivered ? (
                    <p className="text-xs text-[var(--status-warning-text)]">{deliveredEligibility.deliveredBlockedReason}</p>
                  ) : null}
                </div>
              </>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">Este rol puede revisar el pedido, pero no ejecutar acciones de escritura.</p>
            )}
            {canOperateDirectPick && productLines.length > 0 ? (
              <Link href={`/production/fulfillment/${order.id}`} className={buttonStyles({ variant: "secondary" })}>
                Operar surtido directo
              </Link>
            ) : null}
          </div>
          <p className="text-sm text-[var(--text-muted)]">
            La captura y el seguimiento viven en el pedido. La operación física directa y el ensamble exacto siguen en vistas separadas.
          </p>
          {latestPickList ? (
            <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)] px-4 py-3 text-sm text-[var(--text-secondary)]">
              Último surtido directo: <span className="font-mono text-[var(--accent)]">{latestPickList.code}</span> · {summarizePickListStatus(latestPickList.status)}
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Destino: {latestPickList.targetLocation.code} - {latestPickList.targetLocation.name}
              </p>
            </div>
          ) : null}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
        <div className="glass-card space-y-3">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Timeline operativo</h2>
          <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
            {timeline.map((item) => (
              <li key={item.label} className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-subtle)] px-3 py-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-[var(--text-primary)]">{item.label}</p>
                    <p className="text-xs text-[var(--text-muted)]">{item.detail}</p>
                  </div>
                  <Badge variant={item.variant} size="sm">
                    {item.at ? formatDateTime(item.at) : "Pendiente"}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <details className="glass-card space-y-3">
          <summary className="cursor-pointer text-lg font-semibold text-[var(--text-primary)]">
            Auditoria reciente
          </summary>
          <div className="mt-3 space-y-2">
            {recentAudit.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">Sin eventos de auditoria para este pedido.</p>
            ) : (
              <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
                {recentAudit.map((entry, idx) => (
                  <li key={`${entry.action}-${entry.createdAt.toISOString()}-${idx}`} className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-subtle)] px-3 py-2">
                    <p className="text-[var(--text-primary)]">{entry.action}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {entry.actorUser?.name ?? entry.actorUser?.email ?? entry.actor ?? "system"} · {formatDateTime(entry.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>
      </section>

      {order.status === "BORRADOR" ? (
        <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          <div className="glass-card space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Agregar producto independiente</h2>
              <p className="text-sm text-[var(--text-muted)]">Reserva stock exacto en almacenamiento y recalcula el surtido directo del pedido.</p>
            </div>
            {canRenderWriteActions ? (
              <RequestProductLineForm
                orderId={order.id}
                warehouseId={order.warehouse?.id ?? ""}
                disabled={!order.warehouse}
                action={addProductLine}
              />
            ) : (
              <p className="text-sm text-[var(--text-muted)]">Este rol no puede modificar líneas.</p>
            )}
          </div>

          <div className="glass-card space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Agregar ensamble configurado</h2>
              <p className="text-sm text-[var(--text-muted)]">Configura las 3 piezas exactas y crea la orden de ensamble ligada sin usar un SKU de ensamble.</p>
            </div>
            <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)] p-4 text-sm text-[var(--text-secondary)]">
              Cada linea configurada genera su orden exacta con reserva y pick list draft desde este pedido.
            </div>
            <div className="flex justify-end">
              {canRenderWriteActions ? (
                <Link href={`/production/requests/${order.id}/assembly/new`} className={buttonStyles({ variant: "primary" })}>
                  Configurar ensamble
                </Link>
              ) : (
                <span className="text-sm text-[var(--text-muted)]">Solo lectura</span>
              )}
            </div>
          </div>
        </section>
      ) : (
        <section className="glass-card space-y-3">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Configuracion de ensamble</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Este pedido esta en <strong>{SALES_INTERNAL_ORDER_STATUS_LABELS[orderStatus]}</strong>. La modalidad de ensamble configurado solo se habilita cuando el pedido esta en <strong>BORRADOR</strong>.
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            Si necesitas editar la configuracion, crea un nuevo pedido o usa uno en estado borrador.
          </p>
        </section>
      )}

      <section className="glass-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Productos independientes</h2>
            <p className="text-sm text-[var(--text-muted)]">Lineas con surtido directo a staging sin pasar por WIP.</p>
          </div>
          {canOperateDirectPick && productLines.length > 0 ? (
            <Link href={`/production/fulfillment/${order.id}`} className={buttonStyles({ variant: "secondary", size: "sm" })}>
              Ver surtido directo
            </Link>
          ) : null}
        </div>

        {productLines.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">Todavia no hay productos independientes en este pedido.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)]">
                  <th className="py-3 text-left">Producto</th>
                  <th className="py-3 text-right">Solicitado</th>
                  <th className="py-3 text-right">Reservado</th>
                  <th className="py-3 text-right">Surtido</th>
                  <th className="py-3 text-right">Faltante</th>
                  <th className="py-3 text-left">Estado</th>
                  <th className="py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {productLines.map((line: any) => {
                  const reserved = line.pickTasks.reduce((acc: number, task: any) => acc + task.reservedQty, 0);
                  const picked = line.pickTasks.reduce((acc: number, task: any) => acc + task.pickedQty, 0);
                  const shortQty = line.pickTasks.reduce((acc: number, task: any) => acc + task.shortQty, 0);
                  const currentPickList = line.pickTasks[0]?.pickList ?? null;
                  const filteredInventory = order.warehouse
                    ? (line.product?.inventory ?? []).filter((row: any) => row.location.warehouse.id === order.warehouse?.id)
                    : (line.product?.inventory ?? []);
                  const available = filteredInventory.reduce((acc: number, row: any) => acc + row.available, 0);

                  return (
                    <tr key={line.id} className="border-b border-[var(--border-soft)] align-top hover:bg-[var(--table-hover)]">
                      <td className="py-3 pr-3 text-[var(--text-secondary)]">
                        <p className="font-mono text-[var(--accent)]">{line.product?.sku}</p>
                        <p>{line.product?.name}</p>
                        <p className="text-xs text-[var(--text-muted)]">{line.product?.referenceCode ?? line.product?.brand ?? "--"}</p>
                        <p className="mt-1 text-xs text-[var(--text-muted)]">Disponible actual: {available.toLocaleString("es-MX")}</p>
                        {line.notes ? <p className="mt-1 text-xs text-[var(--text-muted)]">{line.notes}</p> : null}
                      </td>
                      <td className="py-3 text-right text-[var(--text-primary)]">{line.requestedQty.toLocaleString("es-MX")} {line.product?.unitLabel ?? "unidad"}</td>
                      <td className="py-3 text-right text-[var(--status-warning-text)]">{reserved.toLocaleString("es-MX")}</td>
                      <td className="py-3 text-right text-[var(--status-success-text)]">{picked.toLocaleString("es-MX")}</td>
                      <td className="py-3 text-right text-[var(--status-danger-text)]">{shortQty.toLocaleString("es-MX")}</td>
                      <td className="py-3 text-[var(--text-secondary)]">
                        {currentPickList ? (
                          <div className="space-y-1">
                            <Badge variant={getExecutionBadgeVariant(currentPickList.status)}>{summarizePickListStatus(currentPickList.status)}</Badge>
                            <p className="text-xs text-[var(--text-muted)]">
                              {currentPickList.code} → {currentPickList.targetLocation.code}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-[var(--text-muted)]">Sin surtido directo</span>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        {canRenderWriteActions && order.status === "BORRADOR" ? (
                          <form action={deleteLine}>
                            <input type="hidden" name="orderId" value={order.id} />
                            <input type="hidden" name="lineId" value={line.id} />
                            <button type="submit" className="text-xs text-[var(--status-danger-text)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-surface)]">
                              Eliminar
                            </button>
                          </form>
                        ) : (
                          <span className="text-xs text-[var(--text-muted)]">--</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="glass-card space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Ensambles configurados</h2>
          <p className="text-sm text-[var(--text-muted)]">Lineas que generan una orden exacta ligada al pedido sin depender de un SKU `ASSEMBLY`.</p>
        </div>

        {configuredLines.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">Todavia no hay ensambles configurados en este pedido.</p>
        ) : (
          <div className="space-y-4">
            {configuredLines.map((line: any) => {
              const linkedProduction = linkedProductionByLine.get(line.id);
              return (
                <article key={line.id} className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)] p-4 text-sm text-[var(--text-secondary)]">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                      <p className="font-semibold text-[var(--text-primary)]">
                        {line.assemblyConfiguration?.entryFittingProduct.sku} + {line.assemblyConfiguration?.hoseProduct.sku} + {line.assemblyConfiguration?.exitFittingProduct.sku}
                      </p>
                      <p>
                        Longitud: {line.assemblyConfiguration?.hoseLength ?? "--"} · Cantidad: {line.assemblyConfiguration?.assemblyQuantity ?? "--"} · Manguera total: {line.assemblyConfiguration?.totalHoseRequired ?? "--"}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">Documento fuente: {line.assemblyConfiguration?.sourceDocumentRef ?? "--"}</p>
                      <p className="text-xs text-[var(--text-muted)]">Notas tecnicas: {line.assemblyConfiguration?.notes ?? line.notes ?? "--"}</p>
                    </div>
                    <div className="space-y-2 md:text-right">
                      {linkedProduction ? (
                        <>
                          <Link href={`/production/orders/${linkedProduction.id}`} className="font-mono text-[var(--accent)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-surface)]">
                            {linkedProduction.code}
                          </Link>
                          <p className="text-xs text-[var(--text-muted)]">{summarizeProductionStatus(linkedProduction.status)}</p>
                          <p className="text-xs text-[var(--text-muted)]">Picking: {linkedProduction.assemblyWorkOrder?.pickStatus ?? "--"}</p>
                        </>
                      ) : (
                        <p className="text-xs text-[var(--text-muted)]">Sin orden ligada</p>
                      )}
                      {canRenderWriteActions && order.status === "BORRADOR" ? (
                        <form action={deleteLine}>
                          <input type="hidden" name="orderId" value={order.id} />
                          <input type="hidden" name="lineId" value={line.id} />
                          <button type="submit" className="text-xs text-[var(--status-danger-text)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-surface)]">
                            Eliminar linea
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
