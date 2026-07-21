/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { redirect } from "next/navigation";
import type { SalesInternalOrderStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getSessionContext } from "@/lib/auth/session-context";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import RequestProductLineForm from "@/components/RequestProductLineForm";
import { isSystemAdmin } from "@/lib/rbac/permissions";
import {
  hasProductionCockpitAccess,
  hasSalesAssignmentAccess,
  hasSalesWriteAccess,
  requireSalesAssignmentAccess,
  requireSalesWriteAccess,
} from "@/lib/rbac/sales";
import {
  addSalesRequestProductLine,
  cancelSalesRequestOrder,
  assignSalesRequestOrder,
  confirmSalesRequestOrder,
  deleteSalesRequestLine,
  markSalesRequestPreparedForDelivery,
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
  salesInternalOrderAssignmentSchema,
  salesInternalOrderPreparationSchema,
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
    redirect(`/production/requests/${parsed.data.orderId}?ok=${encodeURIComponent("Pedido tomado; puedes continuar con la entrega")}`);
  } catch (error) {
    perf.end({ requestId, orderId: parsed.data.orderId, ok: false });
    if (isNextRedirectError(error)) throw error;
    const message = error instanceof Error ? error.message : "No se pudo tomar el pedido";
    redirect(`/production/requests/${parsed.data.orderId}?error=${encodeURIComponent(message)}`);
  }
}

async function assignRequest(formData: FormData) {
  "use server";
  const perf = startPerf("action.production.requests.detail.assign");
  const requestId = await getRequestId();
  await requireSalesAssignmentAccess();
  const sessionCtx = await getSessionContext();
  const parsed = salesInternalOrderAssignmentSchema.safeParse({
    orderId: String(formData.get("orderId") ?? "").trim(),
    assigneeUserId: String(formData.get("assigneeUserId") ?? "").trim(),
  });
  if (!parsed.success || !sessionCtx.user?.id) {
    const message = parsed.success ? "Sesión inválida para asignar el pedido" : firstErrorMessage(parsed.error);
    redirect(`/production/requests?error=${encodeURIComponent(message)}`);
  }
  try {
    const result = await assignSalesRequestOrder(prisma, {
      ...parsed.data,
      assignedByUserId: sessionCtx.user.id,
    });
    perf.end({ requestId, orderId: parsed.data.orderId, ok: true, alreadyAssigned: result.alreadyAssigned });
    redirect(`/production/requests/${parsed.data.orderId}?ok=${encodeURIComponent(result.alreadyAssigned ? "El pedido ya estaba asignado a ese vendedor" : "Vendedor asignado; queda pendiente de aceptación")}`);
  } catch (error) {
    perf.end({ requestId, orderId: parsed.data.orderId, ok: false });
    if (isNextRedirectError(error)) throw error;
    const message = error instanceof Error ? error.message : "No se pudo asignar el pedido";
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

async function markPreparedForDelivery(formData: FormData) {
  "use server";
  const perf = startPerf("action.production.requests.detail.prepare_delivery");
  const requestId = await getRequestId();
  await (await import("@/lib/rbac")).requirePermission("production.execute");
  const sessionCtx = await getSessionContext();
  const parsed = salesInternalOrderPreparationSchema.safeParse({
    orderId: String(formData.get("orderId") ?? "").trim(),
    preparedLocationId: String(formData.get("preparedLocationId") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim() || undefined,
  });
  if (!parsed.success || !sessionCtx.user?.id) {
    const message = parsed.success ? "Sesión inválida para preparar el pedido" : firstErrorMessage(parsed.error);
    redirect(`/production/requests/${String(formData.get("orderId") ?? "")}?error=${encodeURIComponent(message)}`);
  }
  try {
    const result = await markSalesRequestPreparedForDelivery(prisma, {
      ...parsed.data,
      preparedByUserId: sessionCtx.user.id,
    });
    perf.end({ requestId, orderId: parsed.data.orderId, ok: true, alreadyPrepared: result.alreadyPrepared });
    redirect(`/production/requests/${parsed.data.orderId}?ok=${encodeURIComponent(result.alreadyPrepared ? result.warning : "Pedido preparado para entrega")}`);
  } catch (error) {
    perf.end({ requestId, orderId: parsed.data.orderId, ok: false });
    if (isNextRedirectError(error)) throw error;
    const message = error instanceof Error ? error.message : "No se pudo preparar el pedido";
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
  const { id } = await params;
  const sp = await searchParams;
  const sessionCtx = await getSessionContext();
  if (!sessionCtx.isAuthenticated) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/production/requests/${id}`)}`);
  }
  if (
    !hasProductionCockpitAccess({
      roles: sessionCtx.roles,
      permissions: sessionCtx.permissions,
    })
  ) {
    redirect(`/forbidden?from=${encodeURIComponent(`/production/requests/${id}`)}`);
  }
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
      preparedForDeliveryAt: true,
      preparedForDeliveryNotes: true,
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
      preparedForDeliveryByUser: { select: { name: true, email: true } },
      preparedForDeliveryLocation: { select: { code: true, name: true } },
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

  const canManageAssignments = hasSalesAssignmentAccess({ roles: sessionCtx.roles });
  const salesExecutives = canManageAssignments
    ? await prisma.user.findMany({
        where: {
          isActive: true,
          userRoles: { some: { role: { code: "SALES_EXECUTIVE", isActive: true } } },
        },
        orderBy: [{ name: "asc" }, { email: "asc" }],
        select: { id: true, name: true, email: true },
      })
    : [];
  const deliveryLocations = order.warehouse?.id
    ? await prisma.location.findMany({
        where: {
          warehouseId: order.warehouse.id,
          isActive: true,
          usageType: { in: ["STAGING", "SHIPPING"] },
        },
        orderBy: [{ usageType: "asc" }, { code: "asc" }],
        select: { id: true, code: true, name: true, usageType: true },
      })
    : [];

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
          "MARK_PREPARED_FOR_DELIVERY",
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
  const isOperatorView =
    sessionCtx.roles.includes("WAREHOUSE_OPERATOR") &&
    !sessionCtx.roles.includes("SALES_EXECUTIVE");
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
    assignedToCurrentUser: order.assignedToUserId === sessionCtx.user?.id,
    pulledAt: order.pulledAt,
    isCreatedByManager,
  });

  const productLines = (order.lines as any[]).filter((line: any) => line.lineKind === "PRODUCT");
  const configuredLines = (order.lines as any[]).filter((line: any) => line.lineKind === "CONFIGURED_ASSEMBLY");
  const hasCompletedDirectPick = productLines.length === 0 || latestPickList?.status === "COMPLETED";
  const expectedAssemblyLineIds = new Set(configuredLines.map((line: any) => line.id));
  const pendingAssemblyOrders = linkedProductionOrders.filter(
    (row) => row.status !== "COMPLETADA" && row.status !== "CANCELADA",
  );
  const assemblyHref =
    pendingAssemblyOrders.length === 1
      ? `/production/orders/${pendingAssemblyOrders[0].id}`
      : `/production/requests/${order.id}#ensambles`;
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
    preparedForDeliveryAt: order.preparedForDeliveryAt,
    hasCompletedDirectPick,
    hasCompletedConfiguredAssembly,
  });
  const canPrepareForDelivery =
    canOperateDirectPick &&
    orderStatus === "CONFIRMADA" &&
    Boolean(order.assignedToUserId && order.pulledAt) &&
    hasCompletedDirectPick &&
    hasCompletedConfiguredAssembly &&
    !order.preparedForDeliveryAt &&
    !order.deliveredToCustomerAt;
  const flowNarrative = getSalesOrderFlowNarrative({
    orderId: order.id,
    roles: sessionCtx.roles,
    status: orderStatus,
    assignedToUserId: order.assignedToUserId,
    preparedForDeliveryAt: order.preparedForDeliveryAt,
    deliveredToCustomerAt: order.deliveredToCustomerAt,
    pulledAt: order.pulledAt,
    latestPickStatus: latestPickList?.status ?? null,
    hasProductLines: productLines.length > 0,
    hasAssemblyLines: configuredLines.length > 0,
    hasCompletedConfiguredAssembly,
    assemblyHref,
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
    preparedForDeliveryAt: order.preparedForDeliveryAt,
    preparedForDeliveryLocationLabel: order.preparedForDeliveryLocation
      ? `${order.preparedForDeliveryLocation.code} — ${order.preparedForDeliveryLocation.name}`
      : null,
    deliveredAt: order.deliveredToCustomerAt,
    cancelledAt: order.cancelledAt,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <p className="font-mono text-sm text-[var(--accent)]">{order.code}</p>
          <h1 className="text-3xl font-semibold text-[var(--text-primary)]">
            {isOperatorView ? "Pedido operativo" : "Pedido comercial"}
          </h1>
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

      <section className="glass-card space-y-4 text-sm text-[var(--text-secondary)]" data-testid="request-work-summary">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Estado del pedido</h2>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[var(--text-muted)]">Etapa actual:</span>
                <Badge variant={flowNarrative.flowBadgeVariant}>{flowNarrative.flowStageLabel}</Badge>
              </div>
              <p>Compromiso: {formatDate(order.dueDate)} · Responsable: {order.assignedToUser?.name ?? order.assignedToUser?.email ?? "Sin asignar"}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/production/requests" className={buttonStyles({ variant: "secondary" })}>
                ← Pedidos
              </Link>
            </div>
          </div>

          <div className="op-next-action">
            <p className="op-label">{flowNarrative.flowStage === "entregado" || flowNarrative.flowStage === "cancelado" ? "Pedido finalizado" : "Siguiente paso"}</p>
            <p className="mt-1 font-semibold text-[var(--text-primary)]">
              {flowNarrative.nextRecommendedAction.blockedReason ? (
                flowNarrative.nextRecommendedAction.label
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
                {takeEligibility.canTakeOrder ? (
                  <form action={takeRequest}>
                    <input type="hidden" name="orderId" value={order.id} />
                    <button type="submit" className="btn-secondary">{takeEligibility.takeActionLabel ?? "Tomar pedido"}</button>
                  </form>
                ) : null}
                {deliveredEligibility.canMarkDelivered ? (
                  <form action={markDelivered}>
                    <input type="hidden" name="orderId" value={order.id} />
                    <button type="submit" className="btn-primary">Entregado al cliente</button>
                  </form>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">Este rol puede revisar el pedido, pero no ejecutar acciones de escritura.</p>
            )}
          </div>
          {canPrepareForDelivery ? (
            <form action={markPreparedForDelivery} className="rounded-lg border border-[var(--status-success-border)] bg-[var(--status-success-bg)] p-4" data-testid="prepare-for-delivery-form">
              <input type="hidden" name="orderId" value={order.id} />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <label className="min-w-56 flex-1 text-sm font-medium text-[var(--text-primary)]">
                  Área de entrega *
                  <select name="preparedLocationId" required className="mt-1 block w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                    <option value="">Selecciona dónde quedó separado</option>
                    {deliveryLocations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.code} — {location.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="min-w-56 flex-1 text-sm font-medium text-[var(--text-primary)]">
                  Nota (opcional)
                  <input name="notes" maxLength={500} placeholder="Ej. esperando recolección del cliente" className="mt-1 block w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" />
                </label>
                <button type="submit" className="btn-primary" disabled={deliveryLocations.length === 0}>
                  Preparar para entrega
                </button>
              </div>
              <p className="mt-2 text-xs text-[var(--text-secondary)]">
                Registra el lugar físico donde quedó separado. Ventas podrá continuar sólo después de este paso.
              </p>
              {deliveryLocations.length === 0 ? (
                <p className="mt-1 text-xs text-[var(--status-warning-text)]">No hay un área de entrega activa configurada para este almacén.</p>
              ) : null}
            </form>
          ) : null}
          {order.preparedForDeliveryAt ? (
            <div className="rounded-lg border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-4 py-3 text-sm text-[var(--text-secondary)]" data-testid="prepared-for-delivery-summary">
              <p className="font-semibold text-[var(--status-success-text)]">Preparado para entrega</p>
              <p className="mt-1">
                Área: {order.preparedForDeliveryLocation ? `${order.preparedForDeliveryLocation.code} — ${order.preparedForDeliveryLocation.name}` : "Sin área registrada"}
                {" · "}Preparó: {order.preparedForDeliveryByUser?.name ?? order.preparedForDeliveryByUser?.email ?? "Usuario operativo"}
                {" · "}{formatDateTime(order.preparedForDeliveryAt)}
              </p>
              {order.preparedForDeliveryNotes ? <p className="mt-1 text-xs">{order.preparedForDeliveryNotes}</p> : null}
            </div>
          ) : null}
          {canManageAssignments && order.status === "CONFIRMADA" && !order.pulledAt && !order.deliveredToCustomerAt ? (
            <form action={assignRequest} className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-subtle)] p-3" data-testid="manager-assign-order">
              <input type="hidden" name="orderId" value={order.id} />
              <div className="flex flex-wrap items-end gap-3">
                <label className="min-w-56 flex-1 text-sm font-medium text-[var(--text-primary)]">
                  {order.assignedToUserId ? "Responsable asignado" : "Asignar vendedor"}
                  <select name="assigneeUserId" defaultValue={order.assignedToUserId ?? ""} className="mt-1 block w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" required>
                    <option value="" disabled>Selecciona un ejecutivo</option>
                    {salesExecutives.map((user) => <option key={user.id} value={user.id}>{user.name ?? user.email} · {user.email}</option>)}
                  </select>
                </label>
                <button type="submit" className="btn-secondary">{order.assignedToUserId ? "Reasignar antes de toma" : "Asignar vendedor"}</button>
              </div>
              <p className="mt-2 text-xs text-[var(--text-muted)]">El vendedor verá el pedido en su cola y deberá aceptarlo antes de continuar.</p>
            </form>
          ) : null}
          {(order.notes || latestPickList || (canRenderWriteActions && order.status !== "CANCELADA")) ? (
            <details className="border-t border-[var(--border-soft)] pt-3">
              <summary className="cursor-pointer text-sm font-medium text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Ver información y acciones adicionales</summary>
              <div className="mt-3 space-y-3">
                {order.notes ? <p><span className="font-medium text-[var(--text-primary)]">Notas:</span> {order.notes}</p> : null}
                {latestPickList ? <p>Último surtido: <span className="font-mono text-[var(--accent)]">{latestPickList.code}</span> · {summarizePickListStatus(latestPickList.status)} · {latestPickList.targetLocation.code} - {latestPickList.targetLocation.name}</p> : null}
                {canRenderWriteActions && order.status !== "CANCELADA" ? (
                  <form action={cancelRequest}><input type="hidden" name="orderId" value={order.id} /><button type="submit" className="btn-secondary border-[var(--danger-soft)] bg-[var(--danger-soft)] text-[var(--danger-text)] hover:bg-[var(--danger-soft-hover)]">Cancelar pedido</button></form>
                ) : null}
              </div>
            </details>
          ) : null}
      </section>

      {(productLines.length > 0 || configuredLines.length > 0) ? (
        <section className="glass-card space-y-4" data-testid="request-work-board">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Trabajo de este pedido</h2>
            <p className="text-sm text-[var(--text-muted)]">
              Cada renglón se atiende en su propia operación. Completa todos antes de entregar el pedido.
            </p>
          </div>

          <div className="space-y-3">
            {productLines.length > 0 ? (
              <article className="flex flex-col gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)] p-4 sm:flex-row sm:items-center sm:justify-between" data-testid="request-work-direct-pick">
                <div className="min-w-0">
                  <p className="font-semibold text-[var(--text-primary)]">Productos directos</p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    {productLines.length.toLocaleString("es-MX")} {productLines.length === 1 ? "producto" : "productos"} para surtir y separar para entrega.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant={hasCompletedDirectPick ? "success" : latestPickList?.status === "DRAFT" ? "warning" : "accent"}>
                    {hasCompletedDirectPick
                      ? "Surtido completado"
                      : latestPickList?.status === "DRAFT"
                        ? "Por liberar"
                        : summarizePickListStatus(latestPickList?.status ?? "DRAFT")}
                  </Badge>
                  {canOperateDirectPick ? (
                    <Link href={`/production/fulfillment/${order.id}`} className={buttonStyles({ variant: hasCompletedDirectPick ? "secondary" : "primary", size: "sm" })}>
                      {hasCompletedDirectPick ? "Ver surtido" : "Surtir productos"}
                    </Link>
                  ) : null}
                </div>
              </article>
            ) : null}

            {configuredLines.map((line: any, index: number) => {
              const linkedProduction = linkedProductionByLine.get(line.id);
              const isCompleted = linkedProduction?.status === "COMPLETADA";
              const isCancelled = linkedProduction?.status === "CANCELADA";

              return (
                <article key={line.id} className="flex flex-col gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)] p-4 sm:flex-row sm:items-center sm:justify-between" data-testid={`request-work-assembly-${index + 1}`}>
                  <div className="min-w-0">
                    <p className="font-semibold text-[var(--text-primary)]">Ensamble {index + 1}</p>
                    <p className="mt-1 truncate text-sm text-[var(--text-secondary)]">
                      {line.assemblyConfiguration?.entryFittingProduct.sku} + {line.assemblyConfiguration?.hoseProduct.sku} + {line.assemblyConfiguration?.exitFittingProduct.sku}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge variant={isCompleted ? "success" : isCancelled ? "danger" : linkedProduction ? "warning" : "neutral"}>
                      {linkedProduction ? summarizeProductionStatus(linkedProduction.status) : "Pendiente de generar"}
                    </Badge>
                    {canOperateDirectPick && linkedProduction && !isCancelled ? (
                      <Link href={`/production/orders/${linkedProduction.id}`} className={buttonStyles({ variant: isCompleted ? "secondary" : "primary", size: "sm" })}>
                        {isCompleted ? "Ver ensamble" : "Continuar ensamble"}
                      </Link>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
        <details className="glass-card space-y-3">
          <summary className="cursor-pointer text-lg font-semibold text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Seguimiento del pedido</summary>
          <ul className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
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
        </details>

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
            <p className="text-sm text-[var(--text-muted)]">Líneas con surtido directo hacia el área de entrega, sin pasar por WIP.</p>
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

      <section id="ensambles" className="glass-card space-y-4">
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
