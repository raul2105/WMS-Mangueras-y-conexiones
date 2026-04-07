import prisma from "@/lib/prisma";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { InventoryServiceError } from "@/lib/inventory-service";
import { cancelAssemblyWorkOrder, closeAssemblyWorkOrderConsume } from "@/lib/assembly/work-order-service";
import { confirmAssemblyPickTasksBatch, releaseAssemblyPickList } from "@/lib/assembly/picking-service";
import { assemblyConsumeSchema, firstErrorMessage } from "@/lib/schemas/wms";
import { Table, TableRow, TableWrap, Td, Th } from "@/components/ui/table";
import { buttonStyles } from "@/components/ui/button";
import { isSystemAdmin } from "@/lib/rbac/permissions";

export const dynamic = "force-dynamic";

function formatDateLabel(value: Date | string | null | undefined) {
  if (!value) return "--";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleDateString("es-MX");
}

async function releaseAssemblyPick(formData: FormData) {
  "use server";
  const orderId = String(formData.get("orderId") ?? "").trim();
  if (!orderId) redirect("/production");
  try {
    await releaseAssemblyPickList(prisma, orderId);
  } catch (error) {
    const message = error instanceof InventoryServiceError
      ? error.message
      : "Ocurrio un error inesperado al liberar surtido";
    redirect(`/production/orders/${orderId}?error=${encodeURIComponent(message)}`);
  }

  redirect(`/production/orders/${orderId}?ok=${encodeURIComponent("Lista de surtido liberada")}`);
}

async function confirmAssemblyBatch(formData: FormData) {
  "use server";
  const orderId = String(formData.get("orderId") ?? "").trim();
  const operatorName = String(formData.get("operatorName") ?? "").trim();
  const taskIds = formData
    .getAll("taskIds")
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (!orderId || !operatorName || taskIds.length === 0) {
    redirect(`/production/orders/${orderId}?error=${encodeURIComponent("Datos de surtido invalidos")}`);
  }

  const tasks = taskIds.map((taskId) => {
    const pickedRaw = String(formData.get(`pickedQty__${taskId}`) ?? "").trim();
    const shortReason = String(formData.get(`shortReason__${taskId}`) ?? "").trim() || null;
    const pickedQty = pickedRaw === "" ? null : Number(pickedRaw);
    if (pickedQty !== null && (!Number.isFinite(pickedQty) || pickedQty < 0)) {
      redirect(`/production/orders/${orderId}?error=${encodeURIComponent("Cantidad surtida invalida")}`);
    }
    return { taskId, pickedQty, shortReason };
  });

  let result: Awaited<ReturnType<typeof confirmAssemblyPickTasksBatch>>;
  try {
    result = await confirmAssemblyPickTasksBatch(prisma, {
      productionOrderId: orderId,
      operatorName,
      tasks,
    });
  } catch (error) {
    const message = error instanceof InventoryServiceError
      ? error.message
      : "Ocurrio un error inesperado al confirmar surtido";
    redirect(`/production/orders/${orderId}?error=${encodeURIComponent(message)}`);
  }

  const message = `Surtido confirmado (${result.processedCount} tareas, ${result.labelJobIds.length} etiquetas)`;
  redirect(`/production/orders/${orderId}?ok=${encodeURIComponent(message)}`);
}

async function consumeAssemblyOrder(formData: FormData) {
  "use server";
  const parsed = assemblyConsumeSchema.safeParse({
    orderId: String(formData.get("orderId") ?? "").trim(),
    operatorName: String(formData.get("operatorName") ?? "").trim(),
  });
  if (!parsed.success) {
    const orderId = String(formData.get("orderId") ?? "").trim();
    const target = orderId ? `/production/orders/${orderId}` : "/production";
    redirect(`${target}?error=${encodeURIComponent(firstErrorMessage(parsed.error))}`);
  }
  const orderId = parsed.data.orderId;
  const operatorName = parsed.data.operatorName;
  try {
    await closeAssemblyWorkOrderConsume(prisma, orderId, operatorName);
  } catch (error) {
    const message = error instanceof InventoryServiceError
      ? error.message
      : "Ocurrio un error inesperado al cerrar la orden";
    redirect(`/production/orders/${orderId}?error=${encodeURIComponent(message)}`);
  }

  redirect(`/production/orders/${orderId}?ok=${encodeURIComponent("Orden cerrada y consumida")}`);
}

async function cancelAssemblyOrder(formData: FormData) {
  "use server";
  const orderId = String(formData.get("orderId") ?? "").trim();
  if (!orderId) redirect("/production");
  try {
    await cancelAssemblyWorkOrder(prisma, orderId);
  } catch (error) {
    const message = error instanceof InventoryServiceError
      ? error.message
      : "Ocurrio un error inesperado al cancelar la orden";
    redirect(`/production/orders/${orderId}?error=${encodeURIComponent(message)}`);
  }

  redirect(`/production/orders/${orderId}?ok=${encodeURIComponent("Orden cancelada y reservas liberadas")}`);
}

export default async function ProductionOrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const session = await auth();

  const order = await prisma.productionOrder.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      status: true,
      kind: true,
      customerName: true,
      priority: true,
      dueDate: true,
      notes: true,
      sourceDocumentType: true,
      sourceDocumentId: true,
      sourceDocumentLineId: true,
      warehouse: { select: { name: true, code: true } },
      items: {
        select: {
          id: true,
          quantity: true,
          product: { select: { sku: true, name: true } },
          location: { select: { code: true, name: true } },
        },
        orderBy: { createdAt: "asc" },
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
      assemblyWorkOrder: {
        select: {
          reservationStatus: true,
          pickStatus: true,
          wipStatus: true,
          consumptionStatus: true,
          wipLocation: { select: { code: true, name: true } },
          lines: {
            select: {
              id: true,
              componentRole: true,
              requiredQty: true,
              reservedQty: true,
              pickedQty: true,
              wipQty: true,
              consumedQty: true,
              shortQty: true,
              product: { select: { sku: true, name: true } },
            },
            orderBy: { createdAt: "asc" },
          },
          pickLists: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              code: true,
              status: true,
              tasks: {
                orderBy: { sequence: "asc" },
                select: {
                  id: true,
                  sequence: true,
                  reservedQty: true,
                  pickedQty: true,
                  shortQty: true,
                  status: true,
                  shortReason: true,
                  sourceLocation: { select: { code: true, name: true } },
                  assemblyWorkOrderLine: { select: { componentRole: true, product: { select: { sku: true } } } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!order) redirect("/production");

  const canViewSalesOrigin = isSystemAdmin(session?.user?.roles) || (session?.user?.permissions ?? []).includes("sales.view");

  const orderTrace = await prisma.traceRecord.findFirst({
    where: {
      sourceEntityType: "ASSEMBLY_ORDER",
      sourceEntityId: order.id,
    },
    select: {
      traceId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const lastAssemblyOperator = await prisma.inventoryMovement.findFirst({
    where: {
      documentType: "ASSEMBLY_ORDER",
      documentId: order.id,
      operatorName: { not: null },
    },
    orderBy: { createdAt: "desc" },
    select: { operatorName: true },
  });

  if (order.kind !== "ASSEMBLY_3PIECE") {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Orden {order.code}</h1>
            <p className="text-slate-400 mt-1">{order.warehouse.name} ({order.warehouse.code})</p>
          </div>
          <Link href="/production" className={buttonStyles({ variant: "secondary" })}>Ensamble</Link>
        </div>
        <div className="rounded-[var(--radius-lg)] border border-[color-mix(in oklab,var(--warning) 35%,var(--border-default))] bg-[var(--warning-soft)] px-4 py-3 text-sm text-[var(--warning)]">
          Orden genérica: la edición manual permanece en ruta de mantenimiento temporal.
        </div>
        {order.sourceDocumentType === "SalesInternalOrder" && order.sourceDocumentId ? (
          <div className="rounded-[var(--radius-lg)] border border-cyan-500/25 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
            Origen comercial: {canViewSalesOrigin ? (
              <Link href={`/sales/orders/${order.sourceDocumentId}`} className="font-mono text-cyan-300 hover:text-white">
                {order.sourceDocumentId}
              </Link>
            ) : (
              <span className="font-mono">{order.sourceDocumentId}</span>
            )}
          </div>
        ) : null}
        <table className="w-full text-sm glass-card">
          <thead>
            <tr className="text-slate-400 border-b border-white/10">
              <th className="text-left py-2">SKU</th>
              <th className="text-left py-2">Producto</th>
              <th className="text-left py-2">Ubicación</th>
              <th className="text-right py-2">Cantidad</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id} className="border-b border-white/5">
                <td className="py-2">{item.product.sku}</td>
                <td className="py-2">{item.product.name}</td>
                <td className="py-2">{item.location.code} - {item.location.name}</td>
                <td className="py-2 text-right">{item.quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (!order.assemblyConfiguration || !order.assemblyWorkOrder) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
          {order.sourceDocumentType === "SalesInternalOrder" && order.sourceDocumentId ? (
            <div className="rounded-[var(--radius-lg)] border border-cyan-500/25 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
              Origen comercial: {canViewSalesOrigin ? (
                <Link href={`/sales/orders/${order.sourceDocumentId}`} className="font-mono text-cyan-300 hover:text-white">
                  {order.sourceDocumentId}
                </Link>
              ) : (
                <span className="font-mono">{order.sourceDocumentId}</span>
              )}
            </div>
          ) : null}
            <h1 className="text-3xl font-bold">Orden {order.code}</h1>
            <p className="text-slate-400 mt-1">{order.warehouse.name} ({order.warehouse.code})</p>
          </div>
          <Link href="/production" className={buttonStyles({ variant: "secondary" })}>Ensamble</Link>
        </div>

        {sp.error && <div className="rounded-[var(--radius-lg)] border border-[color-mix(in oklab,var(--danger) 35%,var(--border-default))] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">{sp.error}</div>}
        {sp.ok && <div className="rounded-[var(--radius-lg)] border border-[color-mix(in oklab,var(--success) 35%,var(--border-default))] bg-[var(--success-soft)] px-4 py-3 text-sm text-[var(--success)]">{sp.ok}</div>}

        <div className="panel space-y-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Encabezado comercial</h2>
              <p className="text-sm text-slate-400 mt-1">
                La orden esta en borrador y todavia no tiene configuracion tecnica.
              </p>
            </div>
            <span className="px-3 py-1 rounded-full border border-[color-mix(in oklab,var(--warning) 35%,var(--border-default))] bg-[var(--warning-soft)] text-[var(--warning)] text-xs">
              PENDIENTE CONFIG
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <p className="text-slate-400">Cliente</p>
              <p className="text-slate-200">{order.customerName ?? "--"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-slate-400">Fecha compromiso</p>
              <p className="text-slate-200">{formatDateLabel(order.dueDate)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-slate-400">Prioridad</p>
              <p className="text-slate-200">{order.priority}</p>
            </div>
            <div className="space-y-1 md:col-span-2">
              <p className="text-slate-400">Notas comerciales</p>
              <p className="text-slate-200 whitespace-pre-wrap">{order.notes ?? "--"}</p>
            </div>
          </div>
        </div>

        <div className="panel space-y-4 p-5">
          <h2 className="text-xl font-semibold">Estado operativo</h2>
          <p className="text-sm text-slate-400">
            Las acciones operativas se habilitan cuando completes la configuracion exacta del ensamble.
          </p>
          <div className="flex flex-wrap gap-3">
            <button type="button" className={buttonStyles({ className: "opacity-50" })} disabled>Liberar surtido</button>
            <button type="button" className={buttonStyles({ className: "opacity-50" })} disabled>Cerrar y consumir</button>
          </div>
        </div>

        <div className="panel border-[var(--border-strong)] p-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Siguiente paso</h2>
              <p className="text-sm text-slate-400 mt-1">
                Continúa con la configuracion de productos, longitud, cantidad y previsualizacion exacta.
              </p>
            </div>
            <Link href={`/production/orders/new?orderId=${order.id}`} className={buttonStyles()}>
              Continuar configuracion
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const activePickList = order.assemblyWorkOrder.pickLists[0] ?? null;
  const isFinalOrderStatus = order.status === "COMPLETADA" || order.status === "CANCELADA";
  const hasWip = order.assemblyWorkOrder.lines.some((line) => line.wipQty > 0);
  const hasConsumed = order.assemblyWorkOrder.lines.some((line) => line.consumedQty > 0);
  const canCancel =
    !isFinalOrderStatus &&
    order.assemblyWorkOrder.pickStatus === "NOT_RELEASED" &&
    !hasWip &&
    !hasConsumed &&
    order.assemblyWorkOrder.consumptionStatus === "NOT_CONSUMED";
  const canClose =
    !isFinalOrderStatus &&
    order.assemblyWorkOrder.pickStatus === "COMPLETED" &&
    order.assemblyWorkOrder.wipStatus !== "NOT_IN_WIP" &&
    order.assemblyWorkOrder.consumptionStatus !== "CONSUMED";
  const closeOperatorDefault = lastAssemblyOperator?.operatorName ?? "";

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Orden {order.code}</h1>
          <p className="text-slate-400 mt-1">{order.warehouse.name} ({order.warehouse.code})</p>
        </div>
        <Link href="/production" className={buttonStyles({ variant: "secondary" })}>Ensamble</Link>
      </div>

      {sp.error && <div className="rounded-[var(--radius-lg)] border border-[color-mix(in oklab,var(--danger) 35%,var(--border-default))] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">{sp.error}</div>}
      {sp.ok && <div className="rounded-[var(--radius-lg)] border border-[color-mix(in oklab,var(--success) 35%,var(--border-default))] bg-[var(--success-soft)] px-4 py-3 text-sm text-[var(--success)]">{sp.ok}</div>}

      <div className="panel space-y-4 p-5">
        <h2 className="text-xl font-semibold">Encabezado comercial</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="space-y-1">
            <p className="text-slate-400">Cliente</p>
            <p className="text-slate-200">{order.customerName ?? "--"}</p>
          </div>
          <div className="space-y-1">
            <p className="text-slate-400">Fecha compromiso</p>
            <p className="text-slate-200">{formatDateLabel(order.dueDate)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-slate-400">Prioridad</p>
            <p className="text-slate-200">{order.priority}</p>
          </div>
          <div className="space-y-1 md:col-span-2">
            <p className="text-slate-400">Notas comerciales</p>
            <p className="text-slate-200 whitespace-pre-wrap">{order.notes ?? "--"}</p>
          </div>
        </div>
      </div>

      <div className="panel space-y-3 p-5">
        <h2 className="text-xl font-semibold">Configuración</h2>
        <p>{order.assemblyConfiguration.entryFittingProduct.sku} + {order.assemblyConfiguration.hoseProduct.sku} + {order.assemblyConfiguration.exitFittingProduct.sku}</p>
        <p className="text-sm text-slate-400">Longitud {order.assemblyConfiguration.hoseLength}, cantidad {order.assemblyConfiguration.assemblyQuantity}, manguera total {order.assemblyConfiguration.totalHoseRequired}</p>
        <p className="text-sm text-slate-400">Documento fuente: {order.assemblyConfiguration.sourceDocumentRef ?? "--"}</p>
        <p className="text-sm text-slate-400">Notas tecnicas: {order.assemblyConfiguration.notes ?? "--"}</p>
      </div>

      <div className="panel space-y-4 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Estado operativo</h2>
          <form action={releaseAssemblyPick}>
            <input type="hidden" name="orderId" value={order.id} />
            <button type="submit" className={buttonStyles({ className: order.assemblyWorkOrder.pickStatus !== "NOT_RELEASED" ? "opacity-50" : "" })} disabled={order.assemblyWorkOrder.pickStatus !== "NOT_RELEASED"}>Iniciar surtido</button>
          </form>
        </div>
        <p className="text-sm text-slate-400">Reserva {order.assemblyWorkOrder.reservationStatus} | Picking {order.assemblyWorkOrder.pickStatus} | WIP {order.assemblyWorkOrder.wipStatus} | Consumo {order.assemblyWorkOrder.consumptionStatus}</p>
        <p className="text-sm text-slate-400">WIP: {order.assemblyWorkOrder.wipLocation.code} - {order.assemblyWorkOrder.wipLocation.name}</p>
        <p className="text-sm text-slate-400">
          Trace de ensamble:
          {orderTrace ? (
            <>
              {" "}
              <Link href={`/trace/${encodeURIComponent(orderTrace.traceId)}`} className="font-mono text-cyan-300 hover:underline">
                {orderTrace.traceId}
              </Link>
              {" "}
              (actualizado {new Date(orderTrace.updatedAt).toLocaleString("es-MX")})
            </>
          ) : (
            " se generará al confirmar el primer surtido de la orden"
          )}
        </p>
      </div>

      <TableWrap dense striped className="glass-card p-0">
        <Table className="min-w-[880px] table-fixed">
          <thead>
            <tr>
              <Th className="w-[12rem]">Rol</Th>
              <Th className="w-[48%]">Producto</Th>
              <Th className="w-[5.5rem] text-right">Req</Th>
              <Th className="w-[6.5rem] text-right">Reservado</Th>
              <Th className="w-[5rem] text-right">WIP</Th>
              <Th className="w-[7rem] text-right">Consumido</Th>
              <Th className="w-[6rem] text-right">Faltante</Th>
            </tr>
          </thead>
          <tbody>
            {order.assemblyWorkOrder.lines.map((line) => (
              <TableRow key={line.id}>
                <Td className="align-top font-medium text-[var(--text-primary)]">{line.componentRole}</Td>
                <Td className="align-top">
                  <div className="min-w-0 space-y-1">
                    <p className="break-words font-mono text-xs text-[var(--text-muted)]">{line.product.sku}</p>
                    <p className="break-words text-sm text-[var(--text-primary)]">{line.product.name}</p>
                  </div>
                </Td>
                <Td className="align-top text-right font-semibold text-[var(--text-primary)]">{line.requiredQty}</Td>
                <Td className="align-top text-right font-semibold text-[var(--text-primary)]">{line.reservedQty}</Td>
                <Td className="align-top text-right font-semibold text-[var(--text-primary)]">{line.wipQty}</Td>
                <Td className="align-top text-right font-semibold text-[var(--text-primary)]">{line.consumedQty}</Td>
                <Td className="align-top text-right font-semibold text-[var(--text-primary)]">{line.shortQty}</Td>
              </TableRow>
            ))}
          </tbody>
        </Table>
      </TableWrap>

      {activePickList && (
        <div className="panel space-y-3 p-5">
          <h2 className="text-xl font-semibold">Picking {activePickList.code}</h2>
          <form action={confirmAssemblyBatch} className="space-y-3">
            <input type="hidden" name="orderId" value={order.id} />
            {activePickList.tasks.map((task) => {
              const pendingQty = Math.max(0, task.reservedQty - task.pickedQty);
              const isClosed = task.status === "COMPLETED" || task.status === "CANCELLED";
              return (
                <div key={task.id} className="surface rounded-lg p-4 grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
                  {!isClosed && <input type="hidden" name="taskIds" value={task.id} />}
                  <div className="md:col-span-2">
                    <p className="text-xs text-slate-400">Ubicación</p>
                    <p>{task.sequence}. {task.sourceLocation.code} - {task.sourceLocation.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Componente</p>
                    <p>{task.assemblyWorkOrderLine.componentRole} ({task.assemblyWorkOrderLine.product.sku})</p>
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
                      disabled={isClosed}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs text-slate-400">Motivo faltante</span>
                    <input
                      name={`shortReason__${task.id}`}
                      defaultValue={task.shortReason ?? ""}
                      className="w-full px-3 py-2 glass rounded-lg"
                      disabled={isClosed}
                    />
                  </label>
                  <div className="text-xs text-slate-400">
                    Estado: <span className="text-slate-200">{task.status}</span>
                    <br />
                    Pendiente: <span className="text-slate-200">{pendingQty}</span>
                    <br />
                    Faltante: <span className="text-slate-200">{task.shortQty}</span>
                  </div>
                </div>
              );
            })}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
              <label className="space-y-1">
                <span className="text-xs text-slate-400">Operador surtido</span>
                <input name="operatorName" className="w-full px-3 py-2 glass rounded-lg" required />
              </label>
              <button type="submit" className={buttonStyles()}>
                Confirmar surtido de la orden
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="flex justify-end gap-3">
        <form action={cancelAssemblyOrder}>
          <input type="hidden" name="orderId" value={order.id} />
          <button
            type="submit"
            className={buttonStyles({ variant: "danger", className: canCancel ? "" : "opacity-50" })}
            disabled={!canCancel}
            title={!canCancel ? "La cancelacion solo se permite antes de liberar surtido y sin consumo/WIP" : undefined}
          >
            Cancelar orden
          </button>
        </form>
        <form action={consumeAssemblyOrder}>
          <input type="hidden" name="orderId" value={order.id} />
          <input
            name="operatorName"
            required
            className="px-3 py-2 glass rounded-lg mr-2"
            placeholder="Operador cierre"
            defaultValue={closeOperatorDefault}
          />
          <button
            type="submit"
            className={buttonStyles({ className: canClose ? "" : "opacity-50" })}
            disabled={!canClose}
            title={!canClose ? "El cierre requiere picking completado y material en WIP" : undefined}
          >
            Cerrar y consumir
          </button>
        </form>
      </div>
      {(!canCancel || !canClose) && (
        <p className="text-xs text-[var(--text-muted)] text-right">
          Acciones finales bloqueadas: cancelar solo antes de liberar surtido; cerrar solo con picking completado y WIP disponible.
        </p>
      )}
    </div>
  );
}
