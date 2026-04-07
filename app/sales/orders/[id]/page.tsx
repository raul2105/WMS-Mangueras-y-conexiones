import Link from "next/link";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createAuditLogSafe } from "@/lib/audit-log";
import { createAssemblyOrderDraftHeader } from "@/lib/assembly/work-order-service";
import { getEquivalentProducts } from "@/lib/product-equivalences";
import { requireSalesWriteAccess } from "@/lib/rbac/sales";
import { pageGuard } from "@/components/rbac/PageGuard";
import {
  SALES_INTERNAL_ORDER_STATUS_LABELS,
  SALES_INTERNAL_ORDER_STATUS_STYLES,
  canGenerateProductionOrderForProductType,
  summarizeProductionStatus,
} from "@/lib/sales/internal-orders";
import { firstErrorMessage, salesGenerateProductionOrderSchema, salesInternalOrderTransitionSchema } from "@/lib/schemas/wms";

export const dynamic = "force-dynamic";

async function confirmSalesOrder(formData: FormData) {
  "use server";
  await requireSalesWriteAccess();
  const session = await auth();
  const parsed = salesInternalOrderTransitionSchema.safeParse({ orderId: String(formData.get("orderId") ?? "").trim() });
  if (!parsed.success) {
    redirect(`/sales/orders?error=${encodeURIComponent(firstErrorMessage(parsed.error))}`);
  }

  const order = await prisma.salesInternalOrder.findUnique({
    where: { id: parsed.data.orderId },
    select: { id: true, code: true, status: true },
  });
  if (!order) redirect("/sales/orders");
  if (order.status !== "BORRADOR") {
    redirect(`/sales/orders/${order.id}?error=${encodeURIComponent("Solo se pueden confirmar pedidos en borrador")}`);
  }

  await prisma.salesInternalOrder.update({
    where: { id: order.id },
    data: {
      status: "CONFIRMADA",
      confirmedAt: new Date(),
      confirmedByUserId: session?.user?.id || null,
    },
  });

  await createAuditLogSafe({
    entityType: "SALES_INTERNAL_ORDER",
    entityId: order.id,
    action: "CONFIRM",
    after: { status: "CONFIRMADA", code: order.code },
    actor: session?.user?.email ?? session?.user?.name ?? "system",
    source: "sales/orders/[id]",
  });

  redirect(`/sales/orders/${order.id}?ok=${encodeURIComponent("Pedido confirmado")}`);
}

async function cancelSalesOrder(formData: FormData) {
  "use server";
  await requireSalesWriteAccess();
  const session = await auth();
  const parsed = salesInternalOrderTransitionSchema.safeParse({ orderId: String(formData.get("orderId") ?? "").trim() });
  if (!parsed.success) {
    redirect(`/sales/orders?error=${encodeURIComponent(firstErrorMessage(parsed.error))}`);
  }

  const order = await prisma.salesInternalOrder.findUnique({
    where: { id: parsed.data.orderId },
    select: { id: true, code: true, status: true },
  });
  if (!order) redirect("/sales/orders");
  if (order.status === "CANCELADA") {
    redirect(`/sales/orders/${order.id}?error=${encodeURIComponent("El pedido ya esta cancelado")}`);
  }

  await prisma.salesInternalOrder.update({
    where: { id: order.id },
    data: {
      status: "CANCELADA",
      cancelledAt: new Date(),
      cancelledByUserId: session?.user?.id || null,
    },
  });

  await createAuditLogSafe({
    entityType: "SALES_INTERNAL_ORDER",
    entityId: order.id,
    action: "CANCEL",
    after: { status: "CANCELADA", code: order.code },
    actor: session?.user?.email ?? session?.user?.name ?? "system",
    source: "sales/orders/[id]",
  });

  redirect(`/sales/orders/${order.id}?ok=${encodeURIComponent("Pedido cancelado")}`);
}

async function createAssemblyDemand(formData: FormData) {
  "use server";
  await requireSalesWriteAccess();
  const session = await auth();
  const parsed = salesGenerateProductionOrderSchema.safeParse({
    orderId: String(formData.get("orderId") ?? "").trim(),
    lineId: String(formData.get("lineId") ?? "").trim(),
  });
  if (!parsed.success) {
    redirect(`/sales/orders?error=${encodeURIComponent(firstErrorMessage(parsed.error))}`);
  }

  const order = await prisma.salesInternalOrder.findUnique({
    where: { id: parsed.data.orderId },
    select: {
      id: true,
      code: true,
      customerName: true,
      dueDate: true,
      warehouseId: true,
      warehouse: { select: { code: true } },
      lines: {
        where: { id: parsed.data.lineId },
        select: {
          id: true,
          requestedQty: true,
          product: { select: { id: true, sku: true, name: true, type: true } },
        },
      },
    },
  });
  if (!order) redirect("/sales/orders");
  const line = order.lines[0];
  if (!line) {
    redirect(`/sales/orders/${parsed.data.orderId}?error=${encodeURIComponent("Linea no encontrada")}`);
  }
  if (!order.warehouseId || !order.dueDate || !order.customerName) {
    redirect(`/sales/orders/${order.id}?error=${encodeURIComponent("El pedido requiere cliente, almacen y fecha compromiso para generar ensamble")}`);
  }
  if (!canGenerateProductionOrderForProductType(line.product.type)) {
    redirect(`/sales/orders/${order.id}?error=${encodeURIComponent("Solo productos tipo ASSEMBLY pueden generar orden de ensamble")}`);
  }

  const existing = await prisma.productionOrder.findFirst({
    where: {
      sourceDocumentType: "SalesInternalOrder",
      sourceDocumentId: order.id,
      sourceDocumentLineId: line.id,
    },
    select: { id: true },
  });
  if (existing) {
    redirect(`/sales/orders/${order.id}?error=${encodeURIComponent("La linea ya tiene una orden de ensamble ligada")}`);
  }

  const result = await createAssemblyOrderDraftHeader(prisma, {
    warehouseId: order.warehouseId,
    customerName: order.customerName,
    dueDate: order.dueDate,
    priority: 3,
    notes: `Origen comercial ${order.code} - ${line.product.sku}`,
  });

  await prisma.productionOrder.update({
    where: { id: result.orderId },
    data: {
      sourceDocumentType: "SalesInternalOrder",
      sourceDocumentId: order.id,
      sourceDocumentLineId: line.id,
      notes: `Origen comercial ${order.code} / ${line.product.sku} / Cantidad ${line.requestedQty}`,
    },
  });

  await createAuditLogSafe({
    entityType: "SALES_INTERNAL_ORDER",
    entityId: order.id,
    action: "GENERATE_ASSEMBLY_ORDER",
    after: { salesOrderCode: order.code, lineId: line.id, productionOrderId: result.orderId },
    actor: session?.user?.email ?? session?.user?.name ?? "system",
    source: "sales/orders/[id]",
  });

  redirect(`/sales/orders/${order.id}?ok=${encodeURIComponent(`Orden de ensamble ${result.code} creada`)}`);
}

export default async function SalesOrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await pageGuard("sales.view");
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
      notes: true,
      createdAt: true,
      confirmedAt: true,
      cancelledAt: true,
      warehouse: { select: { id: true, code: true, name: true } },
      requestedByUser: { select: { name: true, email: true } },
      confirmedByUser: { select: { name: true, email: true } },
      cancelledByUser: { select: { name: true, email: true } },
      lines: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          requestedQty: true,
          notes: true,
          product: {
            select: {
              id: true,
              sku: true,
              referenceCode: true,
              name: true,
              type: true,
              brand: true,
              unitLabel: true,
              inventory: {
                where: { ...(true ? {} : {}) },
                select: {
                  quantity: true,
                  reserved: true,
                  available: true,
                  location: { select: { code: true, warehouse: { select: { id: true, code: true } } } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!order) redirect("/sales/orders");

  const [linkedProductionOrders, lineEquivalents] = await Promise.all([
    prisma.productionOrder.findMany({
      where: {
        sourceDocumentType: "SalesInternalOrder",
        sourceDocumentId: order.id,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        code: true,
        status: true,
        sourceDocumentLineId: true,
      },
    }),
    Promise.all(
      order.lines.map(async (line) => ({
        lineId: line.id,
        equivalents: await getEquivalentProducts(line.product.id, {
          warehouseId: order.warehouse?.id,
          limit: 3,
          inStockOnly: false,
        }),
      }))
    ),
  ]);

  const productionByLineId = new Map(linkedProductionOrders.filter((row) => row.sourceDocumentLineId).map((row) => [row.sourceDocumentLineId as string, row]));
  const equivalentsByLineId = new Map(lineEquivalents.map((row) => [row.lineId, row.equivalents]));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-mono text-sm text-cyan-300">{order.code}</p>
          <h1 className="text-3xl font-semibold text-white">Pedido interno</h1>
          <p className="mt-2 text-slate-400">Cliente: {order.customerName ?? "--"} · Almacen: {order.warehouse ? `${order.warehouse.code} - ${order.warehouse.name}` : "--"}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <span className={`rounded px-3 py-2 text-sm font-semibold ${SALES_INTERNAL_ORDER_STATUS_STYLES[order.status]}`}>
            {SALES_INTERNAL_ORDER_STATUS_LABELS[order.status]}
          </span>
          <Link href="/sales/orders" className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:text-white">← Pedidos</Link>
        </div>
      </div>

      {sp.ok ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{sp.ok}</div> : null}
      {sp.error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{sp.error}</div> : null}

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="glass-card space-y-3 text-sm text-slate-300">
          <h2 className="text-lg font-semibold text-white">Resumen</h2>
          <p>Solicitado por: {order.requestedByUser?.name ?? order.requestedByUser?.email ?? "--"}</p>
          <p>Fecha compromiso: {order.dueDate ? new Date(order.dueDate).toLocaleDateString("es-MX") : "--"}</p>
          <p>Creado: {new Date(order.createdAt).toLocaleString("es-MX")}</p>
          <p>Confirmado: {order.confirmedAt ? new Date(order.confirmedAt).toLocaleString("es-MX") : "--"}</p>
          <p>Cancelado: {order.cancelledAt ? new Date(order.cancelledAt).toLocaleString("es-MX") : "--"}</p>
          {order.notes ? <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-slate-300">{order.notes}</p> : null}
        </div>

        <div className="glass-card space-y-3">
          <h2 className="text-lg font-semibold text-white">Acciones</h2>
          <div className="flex flex-wrap gap-3">
            {order.status === "BORRADOR" ? (
              <form action={confirmSalesOrder}>
                <input type="hidden" name="orderId" value={order.id} />
                <button type="submit" className="btn-primary">Confirmar pedido</button>
              </form>
            ) : null}
            {order.status !== "CANCELADA" ? (
              <form action={cancelSalesOrder}>
                <input type="hidden" name="orderId" value={order.id} />
                <button type="submit" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-200 hover:border-red-400/40 hover:text-white">Cancelar pedido</button>
              </form>
            ) : null}
          </div>
          <p className="text-sm text-slate-400">Sales confirma o cancela el documento comercial. La ejecucion fisica continua en Produccion y Almacen.</p>
        </div>
      </section>

      <section className="glass-card space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Lineas y disponibilidad</h2>
          <p className="text-sm text-slate-400">Se muestra disponibilidad en el almacen del pedido y equivalencias para soportar la promesa comercial.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-slate-400">
                <th className="py-3 text-left">Producto</th>
                <th className="py-3 text-right">Solicitado</th>
                <th className="py-3 text-right">Total</th>
                <th className="py-3 text-right">Reservado</th>
                <th className="py-3 text-right">Disponible</th>
                <th className="py-3 text-left">Equivalencias</th>
                <th className="py-3 text-left">Produccion</th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((line) => {
                const filteredInventory = order.warehouse
                  ? line.product.inventory.filter((row) => row.location.warehouse.id === order.warehouse?.id)
                  : line.product.inventory;
                const total = filteredInventory.reduce((acc, row) => acc + row.quantity, 0);
                const reserved = filteredInventory.reduce((acc, row) => acc + row.reserved, 0);
                const available = filteredInventory.reduce((acc, row) => acc + row.available, 0);
                const linkedProduction = productionByLineId.get(line.id);
                const equivalents = equivalentsByLineId.get(line.id) ?? [];

                return (
                  <tr key={line.id} className="border-b border-white/5 align-top hover:bg-white/5">
                    <td className="py-3 pr-3 text-slate-300">
                      <p className="font-mono text-cyan-300">{line.product.sku}</p>
                      <p>{line.product.name}</p>
                      <p className="text-xs text-slate-500">{line.product.referenceCode ?? line.product.type}</p>
                      {line.notes ? <p className="mt-1 text-xs text-slate-500">{line.notes}</p> : null}
                    </td>
                    <td className="py-3 text-right text-slate-200">{line.requestedQty.toLocaleString("es-MX")} {line.product.unitLabel}</td>
                    <td className="py-3 text-right text-slate-200">{total.toLocaleString("es-MX")}</td>
                    <td className="py-3 text-right text-amber-300">{reserved.toLocaleString("es-MX")}</td>
                    <td className="py-3 text-right text-emerald-300">{available.toLocaleString("es-MX")}</td>
                    <td className="py-3 text-xs text-slate-400">
                      {equivalents.length === 0 ? (
                        <span>Sin equivalencias</span>
                      ) : (
                        <div className="space-y-1">
                          {equivalents.map((equivalent) => (
                            <p key={equivalent.equivalenceId}>{equivalent.sku} · {equivalent.totalAvailable} disp.</p>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-3 text-sm text-slate-300">
                      {linkedProduction ? (
                        <div className="space-y-1">
                          <Link href={`/production/orders/${linkedProduction.id}`} className="font-mono text-cyan-300 hover:text-white">{linkedProduction.code}</Link>
                          <p className="text-xs text-slate-400">{summarizeProductionStatus(linkedProduction.status)}</p>
                        </div>
                      ) : canGenerateProductionOrderForProductType(line.product.type) && order.status !== "CANCELADA" ? (
                        <form action={createAssemblyDemand} className="space-y-2">
                          <input type="hidden" name="orderId" value={order.id} />
                          <input type="hidden" name="lineId" value={line.id} />
                          <button type="submit" className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200 hover:border-cyan-400/40 hover:text-white">
                            Generar orden de ensamble
                          </button>
                        </form>
                      ) : (
                        <span className="text-xs text-slate-500">No requiere ensamble</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="glass-card space-y-3">
        <h2 className="text-lg font-semibold text-white">Ordenes de produccion vinculadas</h2>
        {linkedProductionOrders.length === 0 ? (
          <p className="text-sm text-slate-400">Todavia no hay ordenes de ensamble generadas desde este pedido.</p>
        ) : (
          <div className="space-y-2 text-sm text-slate-300">
            {linkedProductionOrders.map((row) => (
              <p key={row.id}>
                <Link href={`/production/orders/${row.id}`} className="font-mono text-cyan-300 hover:text-white">{row.code}</Link>
                <span className="ml-2 text-slate-500">{row.status}</span>
              </p>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
