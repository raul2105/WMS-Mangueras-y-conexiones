import prisma from "@/lib/prisma";
import Link from "next/link";
import { redirect } from "next/navigation";
import { InventoryServiceError } from "@/lib/inventory-service";
import { cancelAssemblyWorkOrder, closeAssemblyWorkOrderConsume } from "@/lib/assembly/work-order-service";
import { confirmAssemblyPickTask, releaseAssemblyPickList } from "@/lib/assembly/picking-service";
import { assemblyConsumeSchema, firstErrorMessage } from "@/lib/schemas/wms";

export const dynamic = "force-dynamic";

async function releaseAssemblyPick(formData: FormData) {
  "use server";
  const orderId = String(formData.get("orderId") ?? "").trim();
  if (!orderId) redirect("/production/orders");
  try {
    await releaseAssemblyPickList(prisma, orderId);
    redirect(`/production/orders/${orderId}?ok=${encodeURIComponent("Lista de surtido liberada")}`);
  } catch (error) {
    const message = error instanceof InventoryServiceError ? error.message : "No se pudo liberar surtido";
    redirect(`/production/orders/${orderId}?error=${encodeURIComponent(message)}`);
  }
}

async function confirmAssemblyTask(formData: FormData) {
  "use server";
  const orderId = String(formData.get("orderId") ?? "").trim();
  const taskId = String(formData.get("taskId") ?? "").trim();
  const pickedQty = Number(String(formData.get("pickedQty") ?? "").trim());
  const shortReason = String(formData.get("shortReason") ?? "").trim() || null;
  const operatorName = String(formData.get("operatorName") ?? "").trim();
  if (!orderId || !taskId || !Number.isFinite(pickedQty) || pickedQty < 0 || !operatorName) {
    redirect(`/production/orders/${orderId}?error=${encodeURIComponent("Datos de picking invalidos")}`);
  }

  try {
    const result = await confirmAssemblyPickTask(prisma, { taskId, pickedQty, shortReason, operatorName });
    if (result?.labelJobId) {
      redirect(`/labels/jobs/${result.labelJobId}?next=${encodeURIComponent(`/production/orders/${orderId}?ok=1`)}`);
    }
    redirect(`/production/orders/${orderId}?ok=${encodeURIComponent("Picking confirmado")}`);
  } catch (error) {
    const message = error instanceof InventoryServiceError ? error.message : "No se pudo confirmar picking";
    redirect(`/production/orders/${orderId}?error=${encodeURIComponent(message)}`);
  }
}

async function consumeAssemblyOrder(formData: FormData) {
  "use server";
  const parsed = assemblyConsumeSchema.safeParse({
    orderId: String(formData.get("orderId") ?? "").trim(),
    operatorName: String(formData.get("operatorName") ?? "").trim(),
  });
  if (!parsed.success) {
    const orderId = String(formData.get("orderId") ?? "").trim();
    const target = orderId ? `/production/orders/${orderId}` : "/production/orders";
    redirect(`${target}?error=${encodeURIComponent(firstErrorMessage(parsed.error))}`);
  }
  const orderId = parsed.data.orderId;
  const operatorName = parsed.data.operatorName;
  try {
    await closeAssemblyWorkOrderConsume(prisma, orderId, operatorName);
    redirect(`/production/orders/${orderId}?ok=${encodeURIComponent("Orden cerrada y consumida")}`);
  } catch (error) {
    const message = error instanceof InventoryServiceError ? error.message : "No se pudo cerrar orden";
    redirect(`/production/orders/${orderId}?error=${encodeURIComponent(message)}`);
  }
}

async function cancelAssemblyOrder(formData: FormData) {
  "use server";
  const orderId = String(formData.get("orderId") ?? "").trim();
  if (!orderId) redirect("/production/orders");
  try {
    await cancelAssemblyWorkOrder(prisma, orderId);
    redirect(`/production/orders/${orderId}?ok=${encodeURIComponent("Orden cancelada y reservas liberadas")}`);
  } catch (error) {
    const message = error instanceof InventoryServiceError ? error.message : "No se pudo cancelar orden";
    redirect(`/production/orders/${orderId}?error=${encodeURIComponent(message)}`);
  }
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

  const order = await prisma.productionOrder.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      status: true,
      kind: true,
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
  if (!order) redirect("/production/orders");

  if (order.kind !== "ASSEMBLY_3PIECE" || !order.assemblyConfiguration || !order.assemblyWorkOrder) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Orden {order.code}</h1>
            <p className="text-slate-400 mt-1">{order.warehouse.name} ({order.warehouse.code})</p>
          </div>
          <Link href="/production/orders" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">← Ordenes</Link>
        </div>
        <div className="glass-card border border-amber-500/30 text-amber-200">
          Orden genérica: la edición manual permanece en ruta de mantenimiento temporal.
        </div>
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

  const activePickList = order.assemblyWorkOrder.pickLists[0] ?? null;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Orden {order.code}</h1>
          <p className="text-slate-400 mt-1">{order.warehouse.name} ({order.warehouse.code})</p>
        </div>
        <Link href="/production/orders" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">← Ordenes</Link>
      </div>

      {sp.error && <div className="glass-card border border-red-500/30 text-red-200">{sp.error}</div>}
      {sp.ok && <div className="glass-card border border-green-500/30 text-green-200">{sp.ok}</div>}

      <div className="glass-card space-y-3">
        <h2 className="text-xl font-semibold">Configuración</h2>
        <p>{order.assemblyConfiguration.entryFittingProduct.sku} + {order.assemblyConfiguration.hoseProduct.sku} + {order.assemblyConfiguration.exitFittingProduct.sku}</p>
        <p className="text-sm text-slate-400">Longitud {order.assemblyConfiguration.hoseLength}, cantidad {order.assemblyConfiguration.assemblyQuantity}, manguera total {order.assemblyConfiguration.totalHoseRequired}</p>
        <p className="text-sm text-slate-400">Documento fuente: {order.assemblyConfiguration.sourceDocumentRef ?? "--"}</p>
      </div>

      <div className="glass-card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Estado operativo</h2>
          <form action={releaseAssemblyPick}>
            <input type="hidden" name="orderId" value={order.id} />
            <button type="submit" className="btn-primary" disabled={order.assemblyWorkOrder.pickStatus !== "NOT_RELEASED"}>Liberar surtido</button>
          </form>
        </div>
        <p className="text-sm text-slate-400">Reserva {order.assemblyWorkOrder.reservationStatus} | Picking {order.assemblyWorkOrder.pickStatus} | WIP {order.assemblyWorkOrder.wipStatus} | Consumo {order.assemblyWorkOrder.consumptionStatus}</p>
        <p className="text-sm text-slate-400">WIP: {order.assemblyWorkOrder.wipLocation.code} - {order.assemblyWorkOrder.wipLocation.name}</p>
      </div>

      <table className="w-full text-sm glass-card">
        <thead>
          <tr className="text-slate-400 border-b border-white/10">
            <th className="text-left py-2">Rol</th>
            <th className="text-left py-2">Producto</th>
            <th className="text-right py-2">Req</th>
            <th className="text-right py-2">Reservado</th>
            <th className="text-right py-2">WIP</th>
            <th className="text-right py-2">Consumido</th>
            <th className="text-right py-2">Faltante</th>
          </tr>
        </thead>
        <tbody>
          {order.assemblyWorkOrder.lines.map((line) => (
            <tr key={line.id} className="border-b border-white/5">
              <td className="py-2">{line.componentRole}</td>
              <td className="py-2">{line.product.sku} - {line.product.name}</td>
              <td className="py-2 text-right">{line.requiredQty}</td>
              <td className="py-2 text-right">{line.reservedQty}</td>
              <td className="py-2 text-right">{line.wipQty}</td>
              <td className="py-2 text-right">{line.consumedQty}</td>
              <td className="py-2 text-right">{line.shortQty}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {activePickList && (
        <div className="glass-card space-y-3">
          <h2 className="text-xl font-semibold">Picking {activePickList.code}</h2>
          {activePickList.tasks.map((task) => {
            const pendingQty = Math.max(0, task.reservedQty - task.pickedQty);
            return (
              <form key={task.id} action={confirmAssemblyTask} className="glass rounded-lg p-4 grid grid-cols-1 md:grid-cols-7 gap-3 items-end">
                <input type="hidden" name="orderId" value={order.id} />
                <input type="hidden" name="taskId" value={task.id} />
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
                  <input name="pickedQty" type="number" min={0} max={pendingQty} step="0.0001" defaultValue={pendingQty} className="w-full px-3 py-2 glass rounded-lg" disabled={task.status === "COMPLETED" || task.status === "CANCELLED"} />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-slate-400">Motivo faltante</span>
                  <input name="shortReason" defaultValue={task.shortReason ?? ""} className="w-full px-3 py-2 glass rounded-lg" disabled={task.status === "COMPLETED" || task.status === "CANCELLED"} />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-slate-400">Operador</span>
                  <input name="operatorName" className="w-full px-3 py-2 glass rounded-lg" required disabled={task.status === "COMPLETED" || task.status === "CANCELLED"} />
                </label>
                <button type="submit" className="btn-primary" disabled={task.status === "COMPLETED" || task.status === "CANCELLED"}>Confirmar</button>
              </form>
            );
          })}
        </div>
      )}

      <div className="flex justify-end gap-3">
        <form action={cancelAssemblyOrder}>
          <input type="hidden" name="orderId" value={order.id} />
          <button type="submit" className="px-4 py-2 rounded-lg border border-red-500/40 text-red-300 hover:text-white hover:bg-red-500/20">Cancelar orden</button>
        </form>
        <form action={consumeAssemblyOrder}>
          <input type="hidden" name="orderId" value={order.id} />
          <input
            name="operatorName"
            required
            className="px-3 py-2 glass rounded-lg mr-2"
            placeholder="Operador cierre"
          />
          <button type="submit" className="btn-primary">Cerrar y consumir</button>
        </form>
      </div>
    </div>
  );
}
