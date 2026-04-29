import Link from "next/link";
import { redirect } from "next/navigation";
import type { SalesInternalOrderStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getSessionContext } from "@/lib/auth/session-context";
import { pageGuard } from "@/components/rbac/PageGuard";
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
  getTakeOrderEligibility,
  SALES_INTERNAL_ORDER_STATUS_LABELS,
  SALES_INTERNAL_ORDER_STATUS_STYLES,
  summarizePickListStatus,
  summarizeProductionStatus,
} from "@/lib/sales/internal-orders";
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
    await markSalesRequestDelivered(prisma, {
      orderId: parsed.data.orderId,
      deliveredByUserId: sessionCtx.user.id,
    });
    servicePerf.end({ requestId, orderId: parsed.data.orderId });
    perf.end({ requestId, orderId: parsed.data.orderId, ok: true });
    redirect(`/production/requests/${parsed.data.orderId}?ok=${encodeURIComponent("Pedido marcado como entregado al cliente")}`);
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

  const linkedProductionByLine = new Map(
    linkedProductionOrders
      .filter((row) => row.sourceDocumentLineId)
      .map((row) => [row.sourceDocumentLineId as string, row])
  );

  const canOperateDirectPick = isSystemAdmin(sessionCtx.roles) || sessionCtx.permissions.includes("production.execute");
  const canViewCustomers = sessionCtx.isSystemAdmin || sessionCtx.permissions.includes("customers.view");
  const orderStatus = order.status as SalesInternalOrderStatus;
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
    hasCompletedDirectPick,
    hasCompletedConfiguredAssembly,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-mono text-sm text-cyan-300">{order.code}</p>
          <h1 className="text-3xl font-semibold text-white">Pedido de surtido</h1>
          <p className="mt-2 text-slate-400">
            Cliente: {order.customerId && canViewCustomers ? (
              <Link href={`/sales/customers/${order.customerId}`} className="text-cyan-300 hover:text-white">
                {displayCustomer}
              </Link>
            ) : (
              displayCustomer
            )} · Almacén: {order.warehouse ? `${order.warehouse.code} - ${order.warehouse.name}` : "--"}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <span className={`rounded px-3 py-2 text-sm font-semibold ${SALES_INTERNAL_ORDER_STATUS_STYLES[orderStatus]}`}>
            {SALES_INTERNAL_ORDER_STATUS_LABELS[orderStatus]}
          </span>
          <Link href="/production/requests" className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:text-white">
            ← Pedidos
          </Link>
        </div>
      </div>

      {sp.ok ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{sp.ok}</div> : null}
      {sp.error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{sp.error}</div> : null}

      <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="glass-card space-y-3 text-sm text-slate-300">
          <h2 className="text-lg font-semibold text-white">Resumen</h2>
          <p>Solicitado por: {order.requestedByUser?.name ?? order.requestedByUser?.email ?? "--"}</p>
          <p>Asignado a: {order.assignedToUser?.name ?? order.assignedToUser?.email ?? "--"}</p>
          <p>Asignado el: {order.assignedAt ? new Date(order.assignedAt).toLocaleString("es-MX") : "--"}</p>
          <p>Tomado el: {order.pulledAt ? new Date(order.pulledAt).toLocaleString("es-MX") : "--"}</p>
          <p>Fecha compromiso: {formatDate(order.dueDate)}</p>
          <p>Creado: {new Date(order.createdAt).toLocaleString("es-MX")}</p>
          <p>Confirmado: {order.confirmedAt ? new Date(order.confirmedAt).toLocaleString("es-MX") : "--"}</p>
          <p>Cancelado: {order.cancelledAt ? new Date(order.cancelledAt).toLocaleString("es-MX") : "--"}</p>
          <p>Entregado al cliente: {order.deliveredToCustomerAt ? new Date(order.deliveredToCustomerAt).toLocaleString("es-MX") : "--"}</p>
          <p>Entrega registrada por: {order.deliveredByUser?.name ?? order.deliveredByUser?.email ?? "--"}</p>
          {order.notes ? <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-slate-300">{order.notes}</p> : null}
        </div>

        <div className="glass-card space-y-3">
          <h2 className="text-lg font-semibold text-white">Acciones</h2>
          <div className="flex flex-wrap gap-3">
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
                <button type="submit" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-200 hover:border-red-400/40 hover:text-white">
                  Cancelar pedido
                </button>
              </form>
            ) : null}
            {canRenderWriteActions ? (
              <>
                <div className="space-y-1">
                  <form action={takeRequest}>
                    <input type="hidden" name="orderId" value={order.id} />
                    <button
                      type="submit"
                      disabled={!takeEligibility.canTakeOrder}
                      className={`rounded-lg border px-4 py-2 text-sm ${
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
                <div className="space-y-1">
                  <form action={markDelivered}>
                    <input type="hidden" name="orderId" value={order.id} />
                    <button
                      type="submit"
                      disabled={!deliveredEligibility.canMarkDelivered}
                      className={`rounded-lg border px-4 py-2 text-sm ${
                        deliveredEligibility.canMarkDelivered
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:border-emerald-400/40 hover:text-white"
                          : "cursor-not-allowed border-white/10 bg-white/5 text-slate-500"
                      }`}
                    >
                      Entregado al cliente
                    </button>
                  </form>
                  {!deliveredEligibility.canMarkDelivered ? (
                    <p className="text-xs text-[var(--warning)]">{deliveredEligibility.deliveredBlockedReason}</p>
                  ) : null}
                </div>
              </>
            ) : null}
            {canOperateDirectPick && productLines.length > 0 ? (
              <Link href={`/production/fulfillment/${order.id}`} className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-200 hover:border-cyan-400/40 hover:text-white">
                Operar surtido directo
              </Link>
            ) : null}
          </div>
          <p className="text-sm text-slate-400">
            La captura y el seguimiento viven en el pedido. La operación física directa y el ensamble exacto siguen en vistas separadas.
          </p>
          {latestPickList ? (
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
              Último surtido directo: <span className="font-mono text-cyan-300">{latestPickList.code}</span> · {summarizePickListStatus(latestPickList.status)}
              <p className="mt-1 text-xs text-slate-400">
                Destino: {latestPickList.targetLocation.code} - {latestPickList.targetLocation.name}
              </p>
            </div>
          ) : null}
        </div>
      </section>

      {order.status === "BORRADOR" ? (
        <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          <div className="glass-card space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Agregar producto independiente</h2>
              <p className="text-sm text-slate-400">Reserva stock exacto en almacenamiento y recalcula el surtido directo del pedido.</p>
            </div>
            <RequestProductLineForm
              orderId={order.id}
              warehouseId={order.warehouse?.id ?? ""}
              disabled={!order.warehouse}
              action={addProductLine}
            />
          </div>

          <div className="glass-card space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Agregar ensamble configurado</h2>
              <p className="text-sm text-slate-400">Configura las 3 piezas exactas y crea la orden de ensamble ligada sin usar un SKU de ensamble.</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
              Cada línea configurada genera su orden exacta con reserva y pick list draft desde este pedido.
            </div>
            <div className="flex justify-end">
              <Link href={`/production/requests/${order.id}/assembly/new`} className="btn-primary">
                Configurar ensamble
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <section className="glass-card space-y-3">
          <h2 className="text-lg font-semibold text-white">Configuracion de ensamble</h2>
          <p className="text-sm text-slate-300">
            Este pedido esta en <strong>{SALES_INTERNAL_ORDER_STATUS_LABELS[orderStatus]}</strong>. La modalidad de ensamble configurado solo se habilita cuando el pedido esta en <strong>BORRADOR</strong>.
          </p>
          <p className="text-xs text-slate-500">
            Si necesitas editar la configuracion, crea un nuevo pedido o usa uno en estado borrador.
          </p>
        </section>
      )}

      <section className="glass-card space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Productos independientes</h2>
            <p className="text-sm text-slate-400">Líneas con surtido directo a staging sin pasar por WIP.</p>
          </div>
          {canOperateDirectPick && productLines.length > 0 ? (
            <Link href={`/production/fulfillment/${order.id}`} className="text-sm text-cyan-300 hover:text-white">
              Ver surtido directo
            </Link>
          ) : null}
        </div>

        {productLines.length === 0 ? (
          <p className="text-sm text-slate-400">Todavía no hay productos independientes en este pedido.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-slate-400">
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
                    <tr key={line.id} className="border-b border-white/5 align-top hover:bg-white/5">
                      <td className="py-3 pr-3 text-slate-300">
                        <p className="font-mono text-cyan-300">{line.product?.sku}</p>
                        <p>{line.product?.name}</p>
                        <p className="text-xs text-slate-500">{line.product?.referenceCode ?? line.product?.brand ?? "--"}</p>
                        <p className="mt-1 text-xs text-slate-500">Disponible actual: {available.toLocaleString("es-MX")}</p>
                        {line.notes ? <p className="mt-1 text-xs text-slate-500">{line.notes}</p> : null}
                      </td>
                      <td className="py-3 text-right text-slate-200">{line.requestedQty.toLocaleString("es-MX")} {line.product?.unitLabel ?? "unidad"}</td>
                      <td className="py-3 text-right text-amber-300">{reserved.toLocaleString("es-MX")}</td>
                      <td className="py-3 text-right text-emerald-300">{picked.toLocaleString("es-MX")}</td>
                      <td className="py-3 text-right text-red-300">{shortQty.toLocaleString("es-MX")}</td>
                      <td className="py-3 text-slate-300">
                        {currentPickList ? (
                          <div className="space-y-1">
                            <p>{summarizePickListStatus(currentPickList.status)}</p>
                            <p className="text-xs text-slate-500">
                              {currentPickList.code} → {currentPickList.targetLocation.code}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500">Sin surtido directo</span>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        {order.status === "BORRADOR" ? (
                          <form action={deleteLine}>
                            <input type="hidden" name="orderId" value={order.id} />
                            <input type="hidden" name="lineId" value={line.id} />
                            <button type="submit" className="text-xs text-red-300 hover:text-white">Eliminar</button>
                          </form>
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
        )}
      </section>

      <section className="glass-card space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Ensambles configurados</h2>
          <p className="text-sm text-slate-400">Líneas que generan una orden exacta ligada al pedido sin depender de un SKU `ASSEMBLY`.</p>
        </div>

        {configuredLines.length === 0 ? (
          <p className="text-sm text-slate-400">Todavía no hay ensambles configurados en este pedido.</p>
        ) : (
          <div className="space-y-4">
            {configuredLines.map((line: any) => {
              const linkedProduction = linkedProductionByLine.get(line.id);
              return (
                <div key={line.id} className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                      <p className="font-semibold text-white">
                        {line.assemblyConfiguration?.entryFittingProduct.sku} + {line.assemblyConfiguration?.hoseProduct.sku} + {line.assemblyConfiguration?.exitFittingProduct.sku}
                      </p>
                      <p>
                        Longitud: {line.assemblyConfiguration?.hoseLength ?? "--"} · Cantidad: {line.assemblyConfiguration?.assemblyQuantity ?? "--"} · Manguera total: {line.assemblyConfiguration?.totalHoseRequired ?? "--"}
                      </p>
                      <p className="text-xs text-slate-500">Documento fuente: {line.assemblyConfiguration?.sourceDocumentRef ?? "--"}</p>
                      <p className="text-xs text-slate-500">Notas técnicas: {line.assemblyConfiguration?.notes ?? line.notes ?? "--"}</p>
                    </div>
                    <div className="space-y-2 text-right">
                      {linkedProduction ? (
                        <>
                          <Link href={`/production/orders/${linkedProduction.id}`} className="font-mono text-cyan-300 hover:text-white">
                            {linkedProduction.code}
                          </Link>
                          <p className="text-xs text-slate-400">{summarizeProductionStatus(linkedProduction.status)}</p>
                          <p className="text-xs text-slate-500">Picking: {linkedProduction.assemblyWorkOrder?.pickStatus ?? "--"}</p>
                        </>
                      ) : (
                        <p className="text-xs text-slate-500">Sin orden ligada</p>
                      )}
                      {order.status === "BORRADOR" ? (
                        <form action={deleteLine}>
                          <input type="hidden" name="orderId" value={order.id} />
                          <input type="hidden" name="lineId" value={line.id} />
                          <button type="submit" className="text-xs text-red-300 hover:text-white">
                            Eliminar línea
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
