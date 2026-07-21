import prisma from "@/lib/prisma";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session-context";
import { InventoryServiceError } from "@/lib/inventory-service";
import { cancelAssemblyWorkOrder, closeAssemblyWorkOrderConsume } from "@/lib/assembly/work-order-service";
import { confirmAssemblyPickTasksBatch, releaseAssemblyPickList } from "@/lib/assembly/picking-service";
import { addGenericOrderItem, removeGenericOrderItem, transitionGenericOrderStatus, updateGenericOrderItemQty } from "@/lib/production/generic-order-service";
import { productionOrderItemSchema } from "@/lib/schemas/wms";
import { Table, TableRow, TableWrap, Td, Th } from "@/components/ui/table";
import { buttonStyles } from "@/components/ui/button";
import { isSystemAdmin } from "@/lib/rbac/permissions";

export const dynamic = "force-dynamic";

async function requireAssemblyExecutePermission(orderId: string) {
  try {
    await (await import("@/lib/rbac")).requirePermission("production.execute");
  } catch {
    redirect(`/production/orders/${orderId}?error=${encodeURIComponent("No tienes permisos para operar ensamble")}`);
  }
}

async function requireProductionExecutePermission(orderId: string) {
  try {
    await (await import("@/lib/rbac")).requirePermission("production.execute");
  } catch {
    redirect(`/production/orders/${orderId}?error=${encodeURIComponent("No tienes permisos para operar la orden")}`);
  }
}

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
  await requireAssemblyExecutePermission(orderId);

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
  if (!orderId) redirect("/production");
  await requireAssemblyExecutePermission(orderId);

  const operatorName = String(formData.get("operatorName") ?? "").trim();
  const taskIds = formData
    .getAll("taskIds")
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (!orderId || !operatorName) {
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

  let processedCount = 0;
  let labelCount = 0;
  let autoClosed = false;

  try {
    if (taskIds.length > 0) {
      const result = await confirmAssemblyPickTasksBatch(prisma, {
        productionOrderId: orderId,
        operatorName,
        tasks,
      });
      processedCount = result.processedCount;
      labelCount = result.labelJobIds.length;
    }

    const orderState = await prisma.productionOrder.findUnique({
      where: { id: orderId },
      select: {
        status: true,
        assemblyWorkOrder: {
          select: {
            pickStatus: true,
            wipStatus: true,
            consumptionStatus: true,
          },
        },
      },
    });

    const canAutoClose =
      Boolean(orderState?.assemblyWorkOrder) &&
      orderState?.status !== "COMPLETADA" &&
      orderState?.status !== "CANCELADA" &&
      orderState?.assemblyWorkOrder?.pickStatus === "COMPLETED" &&
      orderState?.assemblyWorkOrder?.wipStatus !== "NOT_IN_WIP" &&
      orderState?.assemblyWorkOrder?.consumptionStatus !== "CONSUMED";

    if (canAutoClose) {
      await closeAssemblyWorkOrderConsume(prisma, orderId, operatorName);
      autoClosed = true;
    }
  } catch (error) {
    const message = error instanceof InventoryServiceError
      ? error.code === "PICKLIST_NOT_RELEASED"
        ? "No se puede surtir: primero debes liberar el surtido"
        : error.message
      : "Ocurrio un error inesperado al confirmar surtido";
    redirect(`/production/orders/${orderId}?error=${encodeURIComponent(message)}`);
  }

  if (autoClosed) {
    const message = processedCount > 0
      ? `Surtido confirmado (${processedCount} tareas, ${labelCount} etiquetas) y orden cerrada/consumida`
      : "Orden cerrada y consumida";
    redirect(`/production/orders/${orderId}?ok=${encodeURIComponent(message)}`);
  }

  if (processedCount > 0) {
    const message = `Surtido confirmado (${processedCount} tareas, ${labelCount} etiquetas). Orden abierta: faltan tareas o cierre final.`;
    redirect(`/production/orders/${orderId}?ok=${encodeURIComponent(message)}`);
  }

  redirect(`/production/orders/${orderId}?error=${encodeURIComponent("No hay tareas pendientes para confirmar ni condiciones para cierre")}`);
}

async function cancelAssemblyOrder(formData: FormData) {
  "use server";
  const orderId = String(formData.get("orderId") ?? "").trim();
  if (!orderId) redirect("/production");
  await requireAssemblyExecutePermission(orderId);
  try {
    await cancelAssemblyWorkOrder(prisma, orderId);
  } catch (error) {
    const message = error instanceof InventoryServiceError
      ? error.message
      : "Ocurrio un error inesperado al cancelar la orden";
    redirect(`/production/orders/${orderId}?error=${encodeURIComponent(message)}`);
  }

  const { emitSyncEventSafe } = await import("@/lib/sync/sync-events");
  await emitSyncEventSafe({
    entityType: "ORDER",
    entityId: orderId,
    action: "UPDATE",
    payload: { orderId, type: "PRODUCTION_ORDER", status: "CANCELADA" },
  });

  redirect(`/production/orders/${orderId}?ok=${encodeURIComponent("Orden cancelada y reservas liberadas")}`);
}

async function addGenericItem(formData: FormData) {
  "use server";
  const orderId = String(formData.get("orderId") ?? "").trim();
  if (!orderId) redirect("/production");
  await requireProductionExecutePermission(orderId);

  const parsed = productionOrderItemSchema.safeParse({
    orderId,
    productId: String(formData.get("productId") ?? "").trim(),
    locationId: String(formData.get("locationId") ?? "").trim(),
    quantityRaw: String(formData.get("quantityRaw") ?? "").trim(),
  });

  if (!parsed.success) {
    redirect(`/production/orders/${orderId}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Datos inválidos")}`);
  }

  try {
    await addGenericOrderItem(prisma, {
      orderId: parsed.data.orderId,
      productId: parsed.data.productId,
      locationId: parsed.data.locationId,
      quantity: parsed.data.quantityRaw,
    });
  } catch (error) {
    const message = error instanceof InventoryServiceError
      ? error.message
      : "Error inesperado al agregar material";
    redirect(`/production/orders/${orderId}?error=${encodeURIComponent(message)}`);
  }

  redirect(`/production/orders/${orderId}?ok=${encodeURIComponent("Línea agregada/actualizada")}`);
}

async function updateGenericItem(formData: FormData) {
  "use server";
  const orderId = String(formData.get("orderId") ?? "").trim();
  if (!orderId) redirect("/production");
  await requireProductionExecutePermission(orderId);

  const itemId = String(formData.get("itemId") ?? "").trim();
  const quantityRaw = String(formData.get("quantityRaw") ?? "").trim();
  const quantity = Number(quantityRaw.replace(",", "."));
  if (!itemId || !Number.isFinite(quantity) || quantity <= 0) {
    redirect(`/production/orders/${orderId}?error=${encodeURIComponent("Cantidad inválida para edición")}`);
  }

  try {
    await updateGenericOrderItemQty(prisma, { orderId, itemId, quantity });
  } catch (error) {
    const message = error instanceof InventoryServiceError
      ? error.message
      : "Error inesperado al editar línea";
    redirect(`/production/orders/${orderId}?error=${encodeURIComponent(message)}`);
  }

  redirect(`/production/orders/${orderId}?ok=${encodeURIComponent("Línea actualizada")}`);
}

async function removeGenericItem(formData: FormData) {
  "use server";
  const orderId = String(formData.get("orderId") ?? "").trim();
  if (!orderId) redirect("/production");
  await requireProductionExecutePermission(orderId);

  const itemId = String(formData.get("itemId") ?? "").trim();
  if (!itemId) {
    redirect(`/production/orders/${orderId}?error=${encodeURIComponent("Línea inválida")}`);
  }

  try {
    await removeGenericOrderItem(prisma, { orderId, itemId });
  } catch (error) {
    const message = error instanceof InventoryServiceError
      ? error.message
      : "Error inesperado al eliminar línea";
    redirect(`/production/orders/${orderId}?error=${encodeURIComponent(message)}`);
  }

  redirect(`/production/orders/${orderId}?ok=${encodeURIComponent("Línea eliminada")}`);
}

async function transitionGenericStatus(formData: FormData) {
  "use server";
  const orderId = String(formData.get("orderId") ?? "").trim();
  const targetStatus = String(formData.get("targetStatus") ?? "").trim();
  if (!orderId) redirect("/production");
  await requireProductionExecutePermission(orderId);

  const validTargets = new Set(["BORRADOR", "ABIERTA", "EN_PROCESO", "COMPLETADA", "CANCELADA"]);
  if (!validTargets.has(targetStatus)) {
    redirect(`/production/orders/${orderId}?error=${encodeURIComponent("Estado destino inválido")}`);
  }

  try {
    const result = await transitionGenericOrderStatus(prisma, {
      orderId,
      targetStatus: targetStatus as "BORRADOR" | "ABIERTA" | "EN_PROCESO" | "COMPLETADA" | "CANCELADA",
    });

    if (result.changed) {
      const { emitSyncEventSafe } = await import("@/lib/sync/sync-events");
      await emitSyncEventSafe({
        entityType: "ORDER",
        entityId: orderId,
        action: "UPDATE",
        payload: { orderId, type: "PRODUCTION_ORDER", status: result.status },
      });
    }
  } catch (error) {
    const message = error instanceof InventoryServiceError
      ? error.message
      : "Error inesperado al cambiar estado";
    redirect(`/production/orders/${orderId}?error=${encodeURIComponent(message)}`);
  }

  redirect(`/production/orders/${orderId}?ok=${encodeURIComponent(`Estado actualizado a ${targetStatus}`)}`);
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
  const sessionCtx = await getSessionContext();

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
      warehouse: { select: { id: true, name: true, code: true } },
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

  const canViewSalesOrigin = isSystemAdmin(sessionCtx.roles) || sessionCtx.permissions.includes("sales.view");

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

  let genericProducts: Array<{ id: string; sku: string; name: string }> = [];
  let genericLocations: Array<{ id: string; code: string; name: string }> = [];
  if (order.kind !== "ASSEMBLY_3PIECE") {
    [genericProducts, genericLocations] = await Promise.all([
      prisma.product.findMany({
        orderBy: [{ sku: "asc" }],
        take: 400,
        select: { id: true, sku: true, name: true },
      }),
      prisma.location.findMany({
        where: { warehouseId: order.warehouse.id, isActive: true },
        orderBy: [{ code: "asc" }],
        select: { id: true, code: true, name: true },
      }),
    ]);
  }

  if (order.kind !== "ASSEMBLY_3PIECE") {
    const canEditGeneric = order.status !== "CANCELADA" && order.status !== "COMPLETADA";
    const canCompleteGeneric = order.status === "ABIERTA" || order.status === "EN_PROCESO";
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Orden {order.code}</h1>
            <p className="text-slate-400 mt-1">{order.warehouse.name} ({order.warehouse.code})</p>
          </div>
          <Link
            href={
              order.sourceDocumentType === "SalesInternalOrder" && order.sourceDocumentId
                ? `/production/requests/${order.sourceDocumentId}`
                : "/production"
            }
            className={buttonStyles({ variant: "secondary" })}
          >
            {order.sourceDocumentType === "SalesInternalOrder" && order.sourceDocumentId
              ? "Volver al pedido"
              : "Ensambles"}
          </Link>
        </div>
        {sp.error && <div className="rounded-[var(--radius-lg)] border border-[color-mix(in oklab,var(--danger) 35%,var(--border-default))] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">{sp.error}</div>}
        {sp.ok && <div className="rounded-[var(--radius-lg)] border border-[color-mix(in oklab,var(--success) 35%,var(--border-default))] bg-[var(--success-soft)] px-4 py-3 text-sm text-[var(--success)]">{sp.ok}</div>}

        <div className="panel space-y-3 p-5">
          <h2 className="text-xl font-semibold">Estado operativo genérico</h2>
          <p className="text-sm text-slate-400">Estado actual: <span className="text-slate-200">{order.status}</span></p>
          <div className="flex flex-wrap gap-2">
            <form action={transitionGenericStatus}>
              <input type="hidden" name="orderId" value={order.id} />
              <input type="hidden" name="targetStatus" value="ABIERTA" />
              <button type="submit" className={buttonStyles({ variant: "secondary", className: order.status === "BORRADOR" ? "" : "opacity-50" })} disabled={order.status !== "BORRADOR"}>Pasar a ABIERTA</button>
            </form>
            <form action={transitionGenericStatus}>
              <input type="hidden" name="orderId" value={order.id} />
              <input type="hidden" name="targetStatus" value="EN_PROCESO" />
              <button type="submit" className={buttonStyles({ variant: "secondary", className: order.status === "BORRADOR" || order.status === "ABIERTA" ? "" : "opacity-50" })} disabled={!(order.status === "BORRADOR" || order.status === "ABIERTA")}>Pasar a EN_PROCESO</button>
            </form>
            <form action={transitionGenericStatus}>
              <input type="hidden" name="orderId" value={order.id} />
              <input type="hidden" name="targetStatus" value="ABIERTA" />
              <button type="submit" className={buttonStyles({ variant: "secondary", className: order.status === "EN_PROCESO" ? "" : "opacity-50" })} disabled={order.status !== "EN_PROCESO"}>Regresar a ABIERTA</button>
            </form>
            <form action={transitionGenericStatus}>
              <input type="hidden" name="orderId" value={order.id} />
              <input type="hidden" name="targetStatus" value="CANCELADA" />
              <button type="submit" className={buttonStyles({ variant: "danger", className: canEditGeneric ? "" : "opacity-50" })} disabled={!canEditGeneric}>Cancelar</button>
            </form>
            <form action={transitionGenericStatus}>
              <input type="hidden" name="orderId" value={order.id} />
              <input type="hidden" name="targetStatus" value="COMPLETADA" />
              <button type="submit" className={buttonStyles({ variant: "secondary", className: canCompleteGeneric ? "" : "opacity-50" })} disabled={!canCompleteGeneric}>Cerrar COMPLETADA</button>
            </form>
          </div>
          <p className="text-xs text-slate-500">Al cerrar COMPLETADA: se libera reserva y se consume inventario de cada línea en la misma transacción.</p>
        </div>

        {order.sourceDocumentType === "SalesInternalOrder" && order.sourceDocumentId ? (
          <div className="rounded-[var(--radius-lg)] border border-cyan-500/25 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
            Origen pedido: {canViewSalesOrigin ? (
              <Link href={`/production/requests/${order.sourceDocumentId}`} className="font-mono text-cyan-300 hover:text-white">
                {order.sourceDocumentId}
              </Link>
            ) : (
              <span className="font-mono">{order.sourceDocumentId}</span>
            )}
          </div>
        ) : null}

        <div className="panel space-y-3 p-5">
          <h2 className="text-xl font-semibold">Agregar material</h2>
          <form action={addGenericItem} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <input type="hidden" name="orderId" value={order.id} />
            <label className="space-y-1 md:col-span-2">
              <span className="text-xs text-slate-400">Producto</span>
              <select name="productId" className="w-full px-3 py-2 glass rounded-lg" required disabled={!canEditGeneric}>
                <option value="">Selecciona producto</option>
                {genericProducts.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.sku} - {product.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-slate-400">Ubicación</span>
              <select name="locationId" className="w-full px-3 py-2 glass rounded-lg" required disabled={!canEditGeneric}>
                <option value="">Selecciona ubicación</option>
                {genericLocations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.code} - {location.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-slate-400">Cantidad</span>
              <input name="quantityRaw" type="number" min="0.0001" step="0.0001" className="w-full px-3 py-2 glass rounded-lg" required disabled={!canEditGeneric} />
            </label>
            <div className="md:col-span-4">
              <button type="submit" className={buttonStyles({ className: canEditGeneric ? "" : "opacity-50" })} disabled={!canEditGeneric}>
                Agregar / acumular línea
              </button>
            </div>
          </form>
        </div>

        <table className="w-full text-sm glass-card">
          <thead>
            <tr className="text-slate-400 border-b border-white/10">
              <th className="text-left py-2">SKU</th>
              <th className="text-left py-2">Producto</th>
              <th className="text-left py-2">Ubicación</th>
              <th className="text-right py-2">Cantidad</th>
              <th className="text-right py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id} className="border-b border-white/5">
                <td className="py-2">{item.product.sku}</td>
                <td className="py-2">{item.product.name}</td>
                <td className="py-2">{item.location.code} - {item.location.name}</td>
                <td className="py-2 text-right">
                  <form action={updateGenericItem} className="flex items-center justify-end gap-2">
                    <input type="hidden" name="orderId" value={order.id} />
                    <input type="hidden" name="itemId" value={item.id} />
                    <input
                      name="quantityRaw"
                      type="number"
                      min="0.0001"
                      step="0.0001"
                      defaultValue={item.quantity}
                      className="w-28 px-2 py-1 glass rounded-lg text-right"
                      disabled={!canEditGeneric}
                    />
                    <button type="submit" className={buttonStyles({ variant: "secondary", className: canEditGeneric ? "" : "opacity-50" })} disabled={!canEditGeneric}>
                      Guardar
                    </button>
                  </form>
                </td>
                <td className="py-2 text-right">
                  <form action={removeGenericItem}>
                    <input type="hidden" name="orderId" value={order.id} />
                    <input type="hidden" name="itemId" value={item.id} />
                    <button type="submit" className={buttonStyles({ variant: "danger", className: canEditGeneric ? "" : "opacity-50" })} disabled={!canEditGeneric}>
                      Eliminar
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {order.items.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-slate-500">
                  Sin líneas de material.
                </td>
              </tr>
            )}
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
              Origen pedido: {canViewSalesOrigin ? (
                <Link href={`/production/requests/${order.sourceDocumentId}`} className="font-mono text-cyan-300 hover:text-white">
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
  const sourceSalesOrder =
    order.sourceDocumentType === "SalesInternalOrder" && order.sourceDocumentId
      ? await prisma.salesInternalOrder.findUnique({
          where: { id: order.sourceDocumentId },
          select: { id: true, status: true, code: true },
        })
      : null;
  const hasValidSalesSource = order.sourceDocumentType === "SalesInternalOrder" && Boolean(order.sourceDocumentId);
  const isSourceConfirmed = sourceSalesOrder?.status === "CONFIRMADA";
  const releaseBlockedReason =
    order.assemblyWorkOrder.pickStatus !== "NOT_RELEASED"
      ? "El surtido ya fue liberado o procesado"
      : !hasValidSalesSource
          ? "La orden no tiene pedido de origen vinculado"
          : !sourceSalesOrder
            ? "No se encontró el pedido de origen vinculado"
            : !isSourceConfirmed
              ? "El pedido de origen debe estar CONFIRMADA para liberar surtido"
              : null;
  const canReleaseAssemblyPick = !releaseBlockedReason;
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
  const actionableTasks = activePickList?.tasks.filter((task) => task.status !== "COMPLETED" && task.status !== "CANCELLED") ?? [];
  const canConfirmTasks = Boolean(activePickList) && activePickList.status !== "DRAFT" && actionableTasks.length > 0;
  const canUnifiedProcess = canConfirmTasks || canClose;
  const unifiedProcessBlockedReason = canUnifiedProcess
    ? null
    : activePickList?.status === "DRAFT"
      ? "No se puede surtir: primero debes liberar el surtido"
      : "No hay tareas pendientes para confirmar ni condiciones para cierre";
  const closeOperatorDefault = lastAssemblyOperator?.operatorName ?? "";

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Orden {order.code}</h1>
          <p className="text-slate-400 mt-1">{order.warehouse.name} ({order.warehouse.code})</p>
        </div>
        <Link
          href={
            order.sourceDocumentType === "SalesInternalOrder" && order.sourceDocumentId
              ? `/production/requests/${order.sourceDocumentId}`
              : "/production"
          }
          className={buttonStyles({ variant: "secondary" })}
        >
          {order.sourceDocumentType === "SalesInternalOrder" && order.sourceDocumentId
            ? "Volver al pedido"
            : "Ensambles"}
        </Link>
      </div>

      {sp.error && <div className="rounded-[var(--radius-lg)] border border-[color-mix(in oklab,var(--danger) 35%,var(--border-default))] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">{sp.error}</div>}
      {sp.ok && <div className="rounded-[var(--radius-lg)] border border-[color-mix(in oklab,var(--success) 35%,var(--border-default))] bg-[var(--success-soft)] px-4 py-3 text-sm text-[var(--success)]">{sp.ok}</div>}

      <div className="panel space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Ensamble para pedido</h2>
            <p className="mt-1 text-sm text-slate-400">Materiales y avance del ensamble ligado a este pedido.</p>
          </div>
          {order.sourceDocumentType === "SalesInternalOrder" && order.sourceDocumentId ? (
            <Link href={`/production/requests/${order.sourceDocumentId}`} className="font-mono text-sm text-cyan-300 hover:underline">
              {sourceSalesOrder?.code ?? "Ver pedido"}
            </Link>
          ) : null}
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

      <div className="panel space-y-3 p-5">
        <h2 className="text-xl font-semibold">Configuración</h2>
        <p>{order.assemblyConfiguration.entryFittingProduct.sku} + {order.assemblyConfiguration.hoseProduct.sku} + {order.assemblyConfiguration.exitFittingProduct.sku}</p>
        <p className="text-sm text-slate-400">Longitud {order.assemblyConfiguration.hoseLength}, cantidad {order.assemblyConfiguration.assemblyQuantity}, manguera total {order.assemblyConfiguration.totalHoseRequired}</p>
        <p className="text-sm text-slate-400">Documento fuente: {order.assemblyConfiguration.sourceDocumentRef ?? "--"}</p>
        <p className="text-sm text-slate-400">Notas tecnicas: {order.assemblyConfiguration.notes ?? "--"}</p>
      </div>

      <div className="panel space-y-4 p-5" data-testid="assembly-work-steps">
        <div className="op-next-action">
          <p className="op-label">Trabajo del ensamble</p>
          <p className="mt-1 font-semibold text-[var(--text-primary)]">
            {isFinalOrderStatus
              ? "Ensamble terminado. Regresa al pedido para continuar."
              : activePickList?.status === "DRAFT"
                ? "1. Libera materiales para empezar el surtido."
                : canConfirmTasks
                  ? "2. Confirma los materiales recogidos."
                  : canClose
                    ? "3. Cierra el ensamble y registra el consumo."
                    : "Revisa el bloqueo antes de continuar."}
          </p>
          {releaseBlockedReason ? <p className="mt-1 text-xs text-[var(--warning)]">{releaseBlockedReason}.</p> : null}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Materiales y surtido</h2>
            <p className="mt-1 text-sm text-slate-400">Paso 1: libera. Paso 2: recoge y confirma. Paso 3: el sistema cierra el ensamble si todo quedó completo.</p>
          </div>
          {canReleaseAssemblyPick ? (
            <form action={releaseAssemblyPick}>
              <input type="hidden" name="orderId" value={order.id} />
              <button type="submit" className={buttonStyles()}>
                Liberar materiales
              </button>
            </form>
          ) : null}
        </div>
        <details className="text-sm text-slate-400">
          <summary className="cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Ver datos de operación</summary>
          <div className="mt-3 space-y-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-subtle)] p-3">
            <p>Reserva {order.assemblyWorkOrder.reservationStatus} · Picking {order.assemblyWorkOrder.pickStatus} · WIP {order.assemblyWorkOrder.wipStatus} · Consumo {order.assemblyWorkOrder.consumptionStatus}</p>
            <p>Zona WIP: {order.assemblyWorkOrder.wipLocation.code} - {order.assemblyWorkOrder.wipLocation.name}</p>
            <p>
              Trace de ensamble: {orderTrace ? (
                <Link href={`/trace/${encodeURIComponent(orderTrace.traceId)}`} className="font-mono text-cyan-300 hover:underline">
                  {orderTrace.traceId}
                </Link>
              ) : "se generará al confirmar el primer surtido"}
            </p>
          </div>
        </details>
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
          <h2 className="text-xl font-semibold">Confirmar materiales recogidos</h2>
          <p className="text-sm text-slate-400">Paso 2 de 3: registra lo que llevaste al área de ensamble.</p>
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
                    <span className="text-xs text-slate-400">Cantidad recogida</span>
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
                <span className="text-xs text-slate-400">Operador</span>
                <input name="operatorName" className="w-full px-3 py-2 glass rounded-lg" required defaultValue={closeOperatorDefault} />
              </label>
              <button
                type="submit"
                data-testid="confirm-assembly-materials"
                className={buttonStyles({ className: canUnifiedProcess ? "" : "opacity-50" })}
                disabled={!canUnifiedProcess}
                title={unifiedProcessBlockedReason ?? undefined}
              >
                Confirmar materiales y cerrar si aplica
              </button>
            </div>
            {unifiedProcessBlockedReason ? (
              <p className="text-xs text-[var(--warning)]">{unifiedProcessBlockedReason}.</p>
            ) : null}
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
      </div>
      {!canCancel && (
        <p className="text-xs text-[var(--text-muted)] text-right">
          Acciones finales bloqueadas: cancelar solo antes de liberar surtido.
        </p>
      )}
    </div>
  );
}
