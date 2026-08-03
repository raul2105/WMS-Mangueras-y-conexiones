import Link from "next/link";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { pageGuard } from "@/components/rbac/PageGuard";
import { buttonStyles } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { InventoryServiceError } from "@/lib/inventory-service";
import { getSessionContext } from "@/lib/auth/session-context";
import { resolveAuthenticatedActor } from "@/lib/auth/authenticated-actor";
import { assignSalesRequestPickTasks, claimSalesRequestPickTasks, confirmSalesRequestPickTasksBatch, releaseSalesRequestPickList } from "@/lib/sales/request-service";
import { summarizePickListStatus } from "@/lib/sales/internal-orders";
import { startPerf } from "@/lib/perf";
import { getRequestId } from "@/lib/request-meta";
import {
  firstErrorMessage,
  salesOrderPickConfirmSchema,
  salesOrderPickListTransitionSchema,
} from "@/lib/schemas/wms";
import { z } from "zod";

export const dynamic = "force-dynamic";

const directPickTaskConfirmSchema = z.object({
  taskId: z.string().trim().min(1, "Tarea es obligatoria"),
  pickedQty: z.number().finite().min(0, "Cantidad surtida invalida").nullable(),
      shortReason: z.string().trim().nullable(),
      scanRef: z.string().trim().nullable(),
});

function isNextRedirectError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof (error as { digest?: unknown }).digest === "string" &&
      (error as { digest: string }).digest.startsWith("NEXT_REDIRECT"),
  );
}

async function releaseDirectPick(formData: FormData) {
  "use server";
  const perf = startPerf("action.production.fulfillment.release_direct_pick");
  const requestId = await getRequestId();
  await (await import("@/lib/rbac")).requirePermission("production.execute");

  const parsed = salesOrderPickListTransitionSchema.safeParse({
    orderId: String(formData.get("orderId") ?? "").trim(),
  });
  if (!parsed.success) redirect("/production");
  const { orderId } = parsed.data;

  try {
    const servicePerf = startPerf("action.production.fulfillment.release_direct_pick.service");
    await releaseSalesRequestPickList(prisma, orderId);
    servicePerf.end({ requestId, orderId });
    perf.end({ requestId, orderId, ok: true });
  } catch (error) {
    perf.end({ requestId, orderId, ok: false });
    if (isNextRedirectError(error)) throw error;
    const message =
      error instanceof InventoryServiceError
        ? error.message
        : "Ocurrio un error inesperado al liberar el surtido directo";
    redirect(`/production/fulfillment/${orderId}?error=${encodeURIComponent(message)}`);
  }

  redirect(`/production/fulfillment/${orderId}?ok=${encodeURIComponent("Surtido directo liberado")}`);
}

async function claimDirectPickTasks(formData: FormData) {
  "use server";
  const orderId = String(formData.get("orderId") ?? "").trim();
  const taskIds = formData.getAll("claimTaskIds").map((value) => String(value).trim()).filter(Boolean);
  const sessionCtx = await getSessionContext();
  await (await import("@/lib/rbac")).requirePermission("production.execute");
  if (!orderId || !sessionCtx.user?.id) redirect("/production");

  try {
    const result = await claimSalesRequestPickTasks(prisma, {
      orderId,
      taskIds,
      claimedByUserId: sessionCtx.user.id,
    });
    redirect(`/production/fulfillment/${orderId}?ok=${encodeURIComponent(`Tareas tomadas (${result.claimedCount})`)}`);
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    const message = error instanceof InventoryServiceError ? error.message : "No fue posible tomar las tareas";
    redirect(`/production/fulfillment/${orderId}?error=${encodeURIComponent(message)}`);
  }
}

async function assignDirectPickTasks(formData: FormData) {
  "use server";
  const orderId = String(formData.get("orderId") ?? "").trim();
  const taskIds = formData.getAll("assignTaskIds").map((value) => String(value).trim()).filter(Boolean);
  const assigneeUserId = String(formData.get("assigneeUserId") ?? "").trim();
  const sessionCtx = await getSessionContext();
  await (await import("@/lib/rbac")).requirePermission("production.execute");
  if (!sessionCtx.user?.id || (!sessionCtx.roles.includes("MANAGER") && !sessionCtx.roles.includes("SYSTEM_ADMIN"))) {
    redirect(`/production/fulfillment/${orderId}?error=${encodeURIComponent("Solo un manager puede asignar tareas de almacén")}`);
  }
  if (!orderId || !assigneeUserId) redirect("/production");

  try {
    const result = await assignSalesRequestPickTasks(prisma, {
      orderId,
      taskIds,
      assignedToUserId: assigneeUserId,
      assignedByUserId: sessionCtx.user.id,
    });
    redirect(`/production/fulfillment/${orderId}?ok=${encodeURIComponent(`Tareas asignadas (${result.assignedCount})`)}`);
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    const message = error instanceof InventoryServiceError ? error.message : "No fue posible asignar las tareas";
    redirect(`/production/fulfillment/${orderId}?error=${encodeURIComponent(message)}`);
  }
}

async function confirmDirectPick(formData: FormData) {
  "use server";
  const perf = startPerf("action.production.fulfillment.confirm_direct_pick");
  const requestId = await getRequestId();
  await (await import("@/lib/rbac")).requirePermission("production.execute");
  const sessionCtx = await getSessionContext();

  const orderIdRaw = String(formData.get("orderId") ?? "").trim();
  const operatorAlias = String(formData.get("operatorName") ?? "").trim();
  const actor = resolveAuthenticatedActor(sessionCtx, operatorAlias);
  if (!actor.actorName) {
    if (!orderIdRaw) redirect("/production");
    redirect(`/production/fulfillment/${orderIdRaw}?error=${encodeURIComponent("Sesion invalida para confirmar el surtido")}`);
  }
  const parsedHeader = salesOrderPickConfirmSchema.safeParse({
    orderId: orderIdRaw,
    operatorName: operatorAlias,
  });
  if (!parsedHeader.success) {
    if (!orderIdRaw) redirect("/production");
    redirect(`/production/fulfillment/${orderIdRaw}?error=${encodeURIComponent(firstErrorMessage(parsedHeader.error))}`);
  }
  const { orderId } = parsedHeader.data;

  const taskIds = formData
    .getAll("taskIds")
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (taskIds.length === 0) {
    redirect(`/production/fulfillment/${orderId}?error=${encodeURIComponent("Datos de surtido invalidos")}`);
  }

  const tasks = taskIds.map((taskId) => {
    const pickedRaw = String(formData.get(`pickedQty__${taskId}`) ?? "").trim();
    const parsedTask = directPickTaskConfirmSchema.safeParse({
      taskId,
      pickedQty: pickedRaw === "" ? null : Number(pickedRaw),
      shortReason: String(formData.get(`shortReason__${taskId}`) ?? "").trim() || null,
      scanRef: String(formData.get(`scanRef__${taskId}`) ?? "").trim() || null,
    });
    if (!parsedTask.success) {
      redirect(`/production/fulfillment/${orderId}?error=${encodeURIComponent(firstErrorMessage(parsedTask.error))}`);
    }
    return parsedTask.data;
  });

  try {
    const servicePerf = startPerf("action.production.fulfillment.confirm_direct_pick.service");
    const result = await confirmSalesRequestPickTasksBatch(prisma, {
      orderId,
      operatorName: actor.operatorName ?? actor.actorName,
      operatorUserId: actor.actorUserId,
      tasks,
    });
    servicePerf.end({ requestId, orderId, processedCount: result.processedCount });
    perf.end({ requestId, orderId, processedCount: result.processedCount, ok: true });
    redirect(`/production/fulfillment/${orderId}?ok=${encodeURIComponent(`Surtido confirmado (${result.processedCount} tareas)`)}`);
  } catch (error) {
    perf.end({ requestId, orderId, ok: false });
    if (isNextRedirectError(error)) throw error;
    const message =
      error instanceof InventoryServiceError
        ? error.message
        : "Ocurrio un error inesperado al confirmar el surtido";
    redirect(`/production/fulfillment/${orderId}?error=${encodeURIComponent(message)}`);
  }
}

export default async function ProductionFulfillmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await pageGuard("production.execute");
  const { id } = await params;
  const sp = await searchParams;
  const actor = resolveAuthenticatedActor(await getSessionContext());
  const sessionCtx = await getSessionContext();

  const order = await prisma.salesInternalOrder.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      status: true,
      customerName: true,
      dueDate: true,
      warehouse: { select: { code: true, name: true } },
      pickLists: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          code: true,
          status: true,
          releasedAt: true,
          completedAt: true,
          targetLocation: { select: { code: true, name: true } },
          tasks: {
            orderBy: { sequence: "asc" },
            select: {
              id: true,
              sequence: true,
              requestedQty: true,
              reservedQty: true,
              pickedQty: true,
              shortQty: true,
              status: true,
              assignmentMode: true,
              assignedToUserId: true,
              claimedByUserId: true,
              claimedAt: true,
              lastActivityAt: true,
              shortReason: true,
              sourceLocation: { select: { code: true, name: true } },
              targetLocation: { select: { code: true, name: true } },
              orderLine: {
                select: {
                  id: true,
                  notes: true,
                  product: {
                    select: {
                      sku: true,
                      name: true,
                      unitLabel: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!order) {
    redirect("/production");
  }

  const pendingAssemblyOrders = await prisma.productionOrder.findMany({
    where: {
      sourceDocumentType: "SalesInternalOrder",
      sourceDocumentId: order.id,
      status: { in: ["BORRADOR", "ABIERTA", "EN_PROCESO"] },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, code: true },
  });
  const assemblyContinuationHref =
    pendingAssemblyOrders.length === 1
      ? `/production/orders/${pendingAssemblyOrders[0].id}`
      : `/production/requests/${order.id}#ensambles`;

  const activePickList = order.pickLists.find((pickList) => pickList.status !== "CANCELLED") ?? null;
  const actionableTasks =
    activePickList?.tasks.filter((task) => !["COMPLETED", "PARTIAL", "CANCELLED"].includes(task.status)) ?? [];
  const managerRequiredUnassignedTasks = actionableTasks.filter(
    (task) => task.assignmentMode === "MANAGER_REQUIRED" && !task.assignedToUserId && !task.claimedByUserId,
  );
  const canAssignWarehouseTasks = sessionCtx.roles.includes("MANAGER") || sessionCtx.roles.includes("SYSTEM_ADMIN");
  const warehouseOperators = canAssignWarehouseTasks
    ? await prisma.user.findMany({
        where: {
          isActive: true,
          userRoles: { some: { role: { code: "WAREHOUSE_OPERATOR", isActive: true } } },
        },
        orderBy: [{ name: "asc" }, { email: "asc" }],
        select: { id: true, name: true, email: true },
      })
    : [];
  const unclaimedTasks = actionableTasks.filter((task) => !task.claimedByUserId);
  const tasksClaimedByOther = actionableTasks.some((task) => task.claimedByUserId && task.claimedByUserId !== actor.actorUserId);
  const allTasksClaimedByCurrent = actionableTasks.length > 0 && actionableTasks.every((task) => task.claimedByUserId === actor.actorUserId);
  // Un pedido sólo de ensamble no tiene lista de surtido directo. Esa etapa ausente
  // se considera completa para llevar al operador al trabajo pendiente real.
  const directPickCompleted = !activePickList || activePickList.status === "COMPLETED";
  const fulfillmentTitle = activePickList ? "Surtir productos" : pendingAssemblyOrders.length > 0 ? "Continuar ensamble" : "Preparar pedido";
  const fulfillmentDescription = activePickList
    ? `Pedido ${order.code}: recoge los productos directos y llévalos a ${activePickList.targetLocation.code}.`
    : pendingAssemblyOrders.length > 0
      ? `Pedido ${order.code}: este pedido no tiene producto directo; continúa con el ensamble asignado.`
      : `Pedido ${order.code}: no tiene surtido directo pendiente.`;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageHeader
        title={fulfillmentTitle}
        description={fulfillmentDescription}
        actions={
          <>
            <Link href={`/production/requests/${order.id}`} className={buttonStyles({ variant: "secondary" })}>
              Volver al pedido
            </Link>
          </>
        }
      />

      {sp.error ? (
        <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{sp.error}</div>
      ) : null}
      {sp.ok ? (
        <div role="status" aria-live="polite" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{sp.ok}</div>
      ) : null}

      <section className="op-panel grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-2 text-sm text-[var(--text-secondary)]">
          <p className="font-mono text-cyan-300">{order.code}</p>
          <p>Cliente: {order.customerName ?? "--"}</p>
          <p>Almacen: {order.warehouse ? `${order.warehouse.code} - ${order.warehouse.name}` : "--"}</p>
          <p>Fecha compromiso: {order.dueDate ? new Date(order.dueDate).toLocaleDateString("es-MX") : "--"}</p>
          <p>Estado del pedido: {order.status}</p>
        </div>
        <div className="space-y-3">
          <div className="op-next-action" data-testid="fulfillment-next-action">
            <p className="op-label">Siguiente paso</p>
            {directPickCompleted && pendingAssemblyOrders.length > 0 ? (
              <Link href={assemblyContinuationHref} className="mt-1 inline-flex font-semibold text-[var(--accent)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                {pendingAssemblyOrders.length === 1
                  ? `Continuar ensamble ${pendingAssemblyOrders[0].code}`
                  : "Continuar con los ensambles del pedido"}
              </Link>
            ) : (
              <p className="mt-1 font-semibold text-[var(--text-primary)]">
                {activePickList?.status === "DRAFT"
                  ? "Libera el surtido para empezar."
                  : directPickCompleted
                    ? "Surtido directo terminado. Vuelve al pedido para continuar."
                    : "Confirma las cantidades realmente recogidas."}
              </p>
            )}
          </div>
          {!activePickList ? (
            <div className="op-surface-muted px-4 py-6 text-sm">
              Este pedido no tiene surtido directo generado.
            </div>
          ) : (
            <div className="op-surface-muted px-4 py-4 text-sm">
              <p>
                Lista de surtido: <span className="font-mono text-cyan-300">{activePickList.code}</span> · {summarizePickListStatus(activePickList.status)}
              </p>
              <p className="mt-1 op-helper">
                Destino: {activePickList.targetLocation.code} - {activePickList.targetLocation.name}
              </p>
              <p className="op-helper">
                Liberada: {activePickList.releasedAt ? new Date(activePickList.releasedAt).toLocaleString("es-MX") : "--"} · Cerrada: {activePickList.completedAt ? new Date(activePickList.completedAt).toLocaleString("es-MX") : "--"}
              </p>
              <a href={`/api/production/requests/${order.id}/pick-list.pdf`} className="mt-3 inline-flex text-sm font-semibold text-[var(--accent)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                Descargar lista de surtido
              </a>
            </div>
          )}

          {activePickList?.status === "DRAFT" ? (
            <form action={releaseDirectPick}>
              <input type="hidden" name="orderId" value={order.id} />
              <button type="submit" className={buttonStyles()}>
                Liberar surtido directo
              </button>
            </form>
          ) : null}
          {activePickList && activePickList.status !== "DRAFT" && unclaimedTasks.length > 0 ? (
            <form action={claimDirectPickTasks} className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3">
              <input type="hidden" name="orderId" value={order.id} />
              {unclaimedTasks.map((task) => <input key={task.id} type="hidden" name="claimTaskIds" value={task.id} />)}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">Tareas sin tomar: {unclaimedTasks.length}</p>
                  <p className="text-xs text-[var(--text-secondary)]">Toma estas tareas antes de registrar cantidades físicas.</p>
                </div>
                <button type="submit" className={buttonStyles({ variant: "primary" })}>Tomar tareas</button>
              </div>
            </form>
          ) : null}
          {canAssignWarehouseTasks && managerRequiredUnassignedTasks.length > 0 ? (
            <form action={assignDirectPickTasks} className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 space-y-3">
              <input type="hidden" name="orderId" value={order.id} />
              {managerRequiredUnassignedTasks.map((task) => <input key={task.id} type="hidden" name="assignTaskIds" value={task.id} />)}
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">Asignación requerida: {managerRequiredUnassignedTasks.length} tareas</p>
                <p className="text-xs text-[var(--text-secondary)]">El manager debe asignar estas tareas a un operador antes de que pueda tomarlas.</p>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <label className="min-w-64 flex-1 space-y-1">
                  <span className="text-xs text-slate-400">Operador responsable</span>
                  <select name="assigneeUserId" required className="w-full px-3 py-2 glass rounded-lg">
                    <option value="">Selecciona un operador</option>
                    {warehouseOperators.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.email}</option>)}
                  </select>
                </label>
                <button type="submit" className={buttonStyles({ variant: "primary" })}>Asignar tareas</button>
              </div>
            </form>
          ) : null}
        </div>
      </section>

      {activePickList ? (
        <section className="op-panel space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Productos por recoger</h2>
            <p className="text-sm text-[var(--text-muted)]">
              Confirma la cantidad real que llevaste a {activePickList.targetLocation.code}. Si falta material, registra el motivo.
            </p>
          </div>

          <form action={confirmDirectPick} className="space-y-4">
            <input type="hidden" name="orderId" value={order.id} />
            <div className="space-y-3">
              {activePickList.tasks.map((task) => {
                const pendingQty = Math.max(0, task.reservedQty - task.pickedQty);
                const isClosed = ["COMPLETED", "PARTIAL", "CANCELLED"].includes(task.status);
                return (
                  <div key={task.id} className="surface rounded-lg p-4 grid grid-cols-1 gap-3 items-end md:grid-cols-7">
                    {!isClosed ? <input type="hidden" name="taskIds" value={task.id} /> : null}
                    <div className="md:col-span-2">
                      <p className="text-xs text-slate-400">Producto</p>
                      <p className="font-mono text-cyan-300">{task.orderLine.product?.sku ?? "--"}</p>
                      <p className="text-sm text-slate-300">{task.orderLine.product?.name ?? "--"}</p>
                      {task.orderLine.notes ? <p className="text-xs text-slate-500">{task.orderLine.notes}</p> : null}
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Origen</p>
                      <p>
                        {task.sequence}. {task.sourceLocation.code}
                      </p>
                      <p className="text-xs text-slate-500">{task.sourceLocation.name}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Destino</p>
                      <p>{task.targetLocation.code}</p>
                      <p className="text-xs text-slate-500">{task.targetLocation.name}</p>
                    </div>
                    <label className="space-y-1">
                      <span className="text-xs text-slate-400">Escaneo SKU / ubicación</span>
                      <input
                        name={`scanRef__${task.id}`}
                        inputMode="search"
                        autoComplete="off"
                        placeholder="Escanea SKU o ubicación"
                        className="w-full px-3 py-2 glass rounded-lg"
                        disabled={isClosed || activePickList.status === "DRAFT"}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs text-slate-400">Cantidad surtida</span>
                      <input
                        name={`pickedQty__${task.id}`}
                        type="number"
                        min={0}
                        max={pendingQty}
                        step="0.0001"
                        defaultValue={isClosed ? task.pickedQty : pendingQty}
                        className="w-full px-3 py-2 glass rounded-lg"
                        disabled={isClosed || activePickList.status === "DRAFT"}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs text-slate-400">Motivo faltante</span>
                      <input
                        name={`shortReason__${task.id}`}
                        defaultValue={task.shortReason ?? ""}
                        className="w-full px-3 py-2 glass rounded-lg"
                        disabled={isClosed || activePickList.status === "DRAFT"}
                      />
                    </label>
                    <div className="text-xs text-slate-400">
                      <span className="font-semibold text-slate-200">{task.claimedByUserId === actor.actorUserId ? "Tomada por ti" : task.claimedByUserId ? "Tomada por otro operador" : task.assignmentMode === "MANAGER_REQUIRED" && task.assignedToUserId ? "Asignada a operador" : task.assignmentMode === "MANAGER_REQUIRED" ? "Requiere asignación" : "Sin tomar"}</span>
                      <br />
                      Estado: <span className="text-slate-200">{task.status}</span>
                      <br />
                      Req: <span className="text-slate-200">{task.requestedQty}</span>
                      <br />
                      Reservado: <span className="text-slate-200">{task.reservedQty}</span>
                      <br />
                      Pendiente: <span className="text-slate-200">{pendingQty}</span>
                      <br />
                      Faltante: <span className="text-slate-200">{task.shortQty}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-1 gap-3 items-end md:grid-cols-[1fr_auto]">
              <label className="space-y-1">
                <span className="text-xs text-slate-400">Alias operativo</span>
                <input
                  name="operatorName"
                  className="w-full px-3 py-2 glass rounded-lg"
                  disabled={actionableTasks.length === 0 || activePickList.status === "DRAFT"}
                  placeholder="Alias en piso, si aplica"
                />
                <span className="block text-[11px] text-slate-500">Usuario autenticado: {actor.actorName ?? "Usuario autenticado"}</span>
              </label>
              <button
                type="submit"
                className={buttonStyles({
                  className: actionableTasks.length === 0 || activePickList.status === "DRAFT" || !allTasksClaimedByCurrent || tasksClaimedByOther ? "opacity-50" : "",
                })}
                disabled={actionableTasks.length === 0 || activePickList.status === "DRAFT" || !allTasksClaimedByCurrent || tasksClaimedByOther}
              >
                {tasksClaimedByOther ? "Tareas tomadas por otro operador" : !allTasksClaimedByCurrent ? "Toma las tareas para continuar" : "Confirmar surtido"}
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );
}
