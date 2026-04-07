import Link from "next/link";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { pageGuard } from "@/components/rbac/PageGuard";
import { buttonStyles } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { InventoryServiceError } from "@/lib/inventory-service";
import { confirmSalesRequestPickTasksBatch, releaseSalesRequestPickList } from "@/lib/sales/request-service";
import { summarizePickListStatus } from "@/lib/sales/internal-orders";

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

async function releaseDirectPick(formData: FormData) {
  "use server";
  await (await import("@/lib/rbac")).requirePermission("production.execute");

  const orderId = String(formData.get("orderId") ?? "").trim();
  if (!orderId) redirect("/production");

  try {
    await releaseSalesRequestPickList(prisma, orderId);
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    const message = error instanceof InventoryServiceError
      ? error.message
      : "Ocurrio un error inesperado al liberar el surtido directo";
    redirect(`/production/fulfillment/${orderId}?error=${encodeURIComponent(message)}`);
  }

  redirect(`/production/fulfillment/${orderId}?ok=${encodeURIComponent("Surtido directo liberado")}`);
}

async function confirmDirectPick(formData: FormData) {
  "use server";
  await (await import("@/lib/rbac")).requirePermission("production.execute");

  const orderId = String(formData.get("orderId") ?? "").trim();
  const operatorName = String(formData.get("operatorName") ?? "").trim();
  const taskIds = formData
    .getAll("taskIds")
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (!orderId || !operatorName || taskIds.length === 0) {
    redirect(`/production/fulfillment/${orderId}?error=${encodeURIComponent("Datos de surtido invalidos")}`);
  }

  const tasks = taskIds.map((taskId) => {
    const pickedRaw = String(formData.get(`pickedQty__${taskId}`) ?? "").trim();
    const shortReason = String(formData.get(`shortReason__${taskId}`) ?? "").trim() || null;
    const pickedQty = pickedRaw === "" ? null : Number(pickedRaw);
    if (pickedQty !== null && (!Number.isFinite(pickedQty) || pickedQty < 0)) {
      redirect(`/production/fulfillment/${orderId}?error=${encodeURIComponent("Cantidad surtida invalida")}`);
    }
    return { taskId, pickedQty, shortReason };
  });

  try {
    const result = await confirmSalesRequestPickTasksBatch(prisma, {
      orderId,
      operatorName,
      tasks,
    });
    redirect(`/production/fulfillment/${orderId}?ok=${encodeURIComponent(`Surtido confirmado (${result.processedCount} tareas)`)}`);
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    const message = error instanceof InventoryServiceError
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

  const activePickList = order.pickLists.find((pickList) => pickList.status !== "CANCELLED") ?? null;
  const actionableTasks = activePickList?.tasks.filter((task) => !["COMPLETED", "PARTIAL", "CANCELLED"].includes(task.status)) ?? [];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Surtido directo"
        description="Operación física de productos independientes del pedido hacia staging o shipping."
        actions={
          <>
            <Link href={`/production/requests/${order.id}`} className={buttonStyles({ variant: "secondary" })}>
              Volver al pedido
            </Link>
            <Link href="/production" className={buttonStyles({ variant: "secondary" })}>
              Ensamble
            </Link>
          </>
        }
      />

      {sp.error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{sp.error}</div>
      ) : null}
      {sp.ok ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{sp.ok}</div>
      ) : null}

      <section className="glass-card grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-2 text-sm text-slate-300">
          <p className="font-mono text-cyan-300">{order.code}</p>
          <p>Cliente: {order.customerName ?? "--"}</p>
          <p>Almacen: {order.warehouse ? `${order.warehouse.code} - ${order.warehouse.name}` : "--"}</p>
          <p>Fecha compromiso: {order.dueDate ? new Date(order.dueDate).toLocaleDateString("es-MX") : "--"}</p>
          <p>Estado del pedido: {order.status}</p>
        </div>
        <div className="space-y-3">
          {!activePickList ? (
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-sm text-slate-400">
              Este pedido no tiene surtido directo generado.
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-slate-300">
              <p>
                Pick list activa: <span className="font-mono text-cyan-300">{activePickList.code}</span> · {summarizePickListStatus(activePickList.status)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Destino: {activePickList.targetLocation.code} - {activePickList.targetLocation.name}
              </p>
              <p className="text-xs text-slate-500">
                Liberada: {activePickList.releasedAt ? new Date(activePickList.releasedAt).toLocaleString("es-MX") : "--"} · Cerrada: {activePickList.completedAt ? new Date(activePickList.completedAt).toLocaleString("es-MX") : "--"}
              </p>
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
        </div>
      </section>

      {activePickList ? (
        <section className="glass-card space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Tareas de surtido</h2>
            <p className="text-sm text-slate-400">
              Confirma lo recogido desde almacenamiento hacia {activePickList.targetLocation.code}. Las tareas parciales cierran con liberacion del faltante reservado.
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
                      <p>{task.sequence}. {task.sourceLocation.code}</p>
                      <p className="text-xs text-slate-500">{task.sourceLocation.name}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Destino</p>
                      <p>{task.targetLocation.code}</p>
                      <p className="text-xs text-slate-500">{task.targetLocation.name}</p>
                    </div>
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
                <span className="text-xs text-slate-400">Operador surtido</span>
                <input
                  name="operatorName"
                  className="w-full px-3 py-2 glass rounded-lg"
                  required
                  disabled={actionableTasks.length === 0 || activePickList.status === "DRAFT"}
                />
              </label>
              <button
                type="submit"
                className={buttonStyles({ className: actionableTasks.length === 0 || activePickList.status === "DRAFT" ? "opacity-50" : "" })}
                disabled={actionableTasks.length === 0 || activePickList.status === "DRAFT"}
              >
                Confirmar surtido
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );
}
