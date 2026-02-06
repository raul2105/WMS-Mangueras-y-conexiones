import prisma from "@/lib/prisma";
import Link from "next/link";
import { redirect } from "next/navigation";
import ProductionOrderItemForm from "@/components/ProductionOrderItemForm";

export const dynamic = "force-dynamic";

async function updateOrder(formData: FormData) {
  "use server";

  const id = String(formData.get("id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  const customerName = String(formData.get("customerName") ?? "").trim() || null;
  const priorityRaw = String(formData.get("priority") ?? "").trim();
  const priority = priorityRaw ? Number(priorityRaw) : 3;
  const dueDateRaw = String(formData.get("dueDate") ?? "").trim();
  const dueDate = dueDateRaw ? new Date(dueDateRaw) : null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!id) {
    redirect("/production/orders");
  }

  if (!Number.isFinite(priority) || priority < 1 || priority > 5) {
    redirect(`/production/orders/${id}?error=${encodeURIComponent("Prioridad invalida (1-5)")}`);
  }

  await prisma.$transaction(async (tx) => {
    const order = await tx.productionOrder.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!order) {
      redirect("/production/orders");
    }

    if (status === "EN_PROCESO" && order.status !== "EN_PROCESO") {
      for (const item of order.items) {
        const inv = await tx.inventory.findUnique({
          where: { productId_locationId: { productId: item.productId, locationId: item.locationId } },
        });

        if (!inv || inv.available < item.quantity) {
          redirect(`/production/orders/${id}?error=${encodeURIComponent("Inventario insuficiente para reservar")}`);
        }

        const newReserved = inv.reserved + item.quantity;
        await tx.inventory.update({
          where: { id: inv.id },
          data: {
            reserved: newReserved,
            available: inv.quantity - newReserved,
          },
        });
      }
    }

    if (status === "COMPLETADA" && order.status !== "COMPLETADA") {
      for (const item of order.items) {
        const inv = await tx.inventory.findUnique({
          where: { productId_locationId: { productId: item.productId, locationId: item.locationId } },
        });

        if (!inv || inv.quantity < item.quantity || inv.reserved < item.quantity) {
          redirect(`/production/orders/${id}?error=${encodeURIComponent("Inventario insuficiente para consumir")}`);
        }

        const newQty = inv.quantity - item.quantity;
        const newReserved = inv.reserved - item.quantity;
        await tx.inventory.update({
          where: { id: inv.id },
          data: {
            quantity: newQty,
            reserved: newReserved,
            available: newQty - newReserved,
          },
        });

        await tx.inventoryMovement.create({
          data: {
            productId: item.productId,
            locationId: item.locationId,
            type: "OUT",
            quantity: item.quantity,
            reference: order.code,
            notes: "Consumo ensamble",
          },
        });
      }
    }

    if (status === "CANCELADA" && order.status !== "CANCELADA") {
      for (const item of order.items) {
        const inv = await tx.inventory.findUnique({
          where: { productId_locationId: { productId: item.productId, locationId: item.locationId } },
        });

        if (!inv) {
          continue;
        }

        const releaseQty = Math.min(inv.reserved, item.quantity);
        if (releaseQty <= 0) {
          continue;
        }

        const newReserved = inv.reserved - releaseQty;
        await tx.inventory.update({
          where: { id: inv.id },
          data: {
            reserved: newReserved,
            available: inv.quantity - newReserved,
          },
        });
      }
    }

    await tx.productionOrder.update({
      where: { id },
      data: {
        status: status as any,
        customerName,
        priority,
        dueDate,
        notes,
      },
    });
  });

  redirect(`/production/orders/${id}?ok=1`);
}

async function deleteOrder(formData: FormData) {
  "use server";

  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    redirect("/production/orders");
  }

  await prisma.productionOrder.delete({ where: { id } });
  redirect("/production/orders");
}

async function addItem(formData: FormData) {
  "use server";

  const orderId = String(formData.get("orderId") ?? "").trim();
  const productId = String(formData.get("productId") ?? "").trim();
  const locationId = String(formData.get("locationId") ?? "").trim();
  const quantityRaw = String(formData.get("quantity") ?? "").trim();
  const quantity = quantityRaw ? Number(quantityRaw.replace(",", ".")) : NaN;

  if (!orderId || !productId || !locationId || !Number.isFinite(quantity) || quantity <= 0) {
    redirect(`/production/orders/${orderId}?error=${encodeURIComponent("Datos invalidos del item")}`);
  }

  await prisma.$transaction(async (tx) => {
    const order = await tx.productionOrder.findUnique({
      where: { id: orderId },
      select: { id: true, warehouseId: true },
    });

    if (!order) {
      redirect("/production/orders");
    }

    const location = await tx.location.findUnique({
      where: { id: locationId },
      select: { id: true, warehouseId: true },
    });

    if (!location || location.warehouseId !== order.warehouseId) {
      redirect(`/production/orders/${orderId}?error=${encodeURIComponent("Ubicacion invalida")}`);
    }

    const inventory = await tx.inventory.findUnique({
      where: { productId_locationId: { productId, locationId } },
      select: { available: true },
    });

    if (!inventory || inventory.available <= 0) {
      redirect(`/production/orders/${orderId}?error=${encodeURIComponent("Sin stock disponible en la ubicacion")}`);
    }

    if (quantity > inventory.available) {
      redirect(`/production/orders/${orderId}?error=${encodeURIComponent("Cantidad supera disponible")}`);
    }

    await tx.productionOrderItem.upsert({
      where: {
        orderId_productId_locationId: { orderId, productId, locationId },
      },
      create: { orderId, productId, locationId, quantity },
      update: { quantity: { increment: quantity } },
    });
  });

  redirect(`/production/orders/${orderId}`);
}

async function removeItem(formData: FormData) {
  "use server";

  const itemId = String(formData.get("itemId") ?? "").trim();
  const orderId = String(formData.get("orderId") ?? "").trim();

  if (!itemId || !orderId) {
    redirect("/production/orders");
  }

  await prisma.productionOrderItem.delete({ where: { id: itemId } });
  redirect(`/production/orders/${orderId}`);
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
    include: {
      warehouse: { select: { id: true, name: true, code: true } },
      items: {
        include: {
          product: { select: { id: true, sku: true, name: true } },
          location: { select: { id: true, code: true, name: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!order) {
    redirect("/production/orders");
  }

  const inventoryOptions = await prisma.inventory.findMany({
    where: {
      available: { gt: 0 },
      location: { warehouseId: order.warehouse.id, isActive: true },
    },
    include: {
      product: { select: { id: true, sku: true, name: true } },
      location: { select: { id: true, code: true, name: true } },
    },
    orderBy: { location: { code: "asc" } },
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Orden {order.code}</h1>
          <p className="text-slate-400 mt-1">
            {order.warehouse.name} ({order.warehouse.code})
          </p>
        </div>
        <Link href="/production/orders" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">
          ← Ordenes
        </Link>
      </div>

      {sp.error && (
        <div className="glass-card border border-red-500/30 text-red-200">{sp.error}</div>
      )}
      {sp.ok && (
        <div className="glass-card border border-green-500/30 text-green-200">Orden actualizada.</div>
      )}

      <div className="glass-card space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="glass p-4 rounded-lg">
            <p className="text-xs text-slate-400 uppercase font-bold">Estado</p>
            <p className="text-lg text-white mt-1">{order.status.replace("_", " ")}</p>
          </div>
          <div className="glass p-4 rounded-lg">
            <p className="text-xs text-slate-400 uppercase font-bold">Prioridad</p>
            <p className="text-lg text-white mt-1">{order.priority}</p>
          </div>
          <div className="glass p-4 rounded-lg">
            <p className="text-xs text-slate-400 uppercase font-bold">Entrega</p>
            <p className="text-lg text-white mt-1">
              {order.dueDate ? new Date(order.dueDate).toLocaleDateString("es-MX") : "--"}
            </p>
          </div>
        </div>

        <form action={updateOrder} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input type="hidden" name="id" value={order.id} />

          <label className="space-y-1">
            <span className="text-sm text-slate-400">Estado</span>
            <select name="status" defaultValue={order.status} className="w-full px-4 py-3 glass rounded-lg">
              <option value="BORRADOR">BORRADOR</option>
              <option value="ABIERTA">ABIERTA</option>
              <option value="EN_PROCESO">EN PROCESO</option>
              <option value="COMPLETADA">COMPLETADA</option>
              <option value="CANCELADA">CANCELADA</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-sm text-slate-400">Cliente</span>
            <input
              name="customerName"
              defaultValue={order.customerName ?? ""}
              className="w-full px-4 py-3 glass rounded-lg"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm text-slate-400">Prioridad (1-5)</span>
            <input
              name="priority"
              type="number"
              min={1}
              max={5}
              defaultValue={order.priority}
              className="w-full px-4 py-3 glass rounded-lg"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm text-slate-400">Fecha entrega</span>
            <input
              name="dueDate"
              type="date"
              defaultValue={order.dueDate ? new Date(order.dueDate).toISOString().slice(0, 10) : ""}
              className="w-full px-4 py-3 glass rounded-lg"
            />
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-sm text-slate-400">Notas</span>
            <textarea
              name="notes"
              defaultValue={order.notes ?? ""}
              className="w-full px-4 py-3 glass rounded-lg min-h-[96px]"
            />
          </label>

          <div className="md:col-span-2 flex items-center justify-end gap-3">
            <button type="submit" className="btn-primary">
              Guardar cambios
            </button>
          </div>
        </form>
      </div>

      <div className="glass-card space-y-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-bold">Materiales</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-white/10">
                <th className="text-left py-3">SKU</th>
                <th className="text-left py-3">Producto</th>
                <th className="text-left py-3">Ubicacion</th>
                <th className="text-right py-3">Cantidad</th>
                <th className="text-right py-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id} className="border-b border-white/5">
                  <td className="py-3 font-mono text-slate-200">{item.product.sku}</td>
                  <td className="py-3 text-slate-300">{item.product.name}</td>
                  <td className="py-3 text-slate-400">
                    {item.location.code} - {item.location.name}
                  </td>
                  <td className="py-3 text-right text-slate-300">{item.quantity}</td>
                  <td className="py-3 text-right">
                    <form action={removeItem}>
                      <input type="hidden" name="itemId" value={item.id} />
                      <input type="hidden" name="orderId" value={order.id} />
                      <button type="submit" className="text-red-300 hover:text-red-200">
                        Quitar
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {order.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    Agrega materiales para reservar inventario.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <ProductionOrderItemForm
          orderId={order.id}
          action={addItem}
          inventoryOptions={inventoryOptions.map((row) => ({
            productId: row.product.id,
            productSku: row.product.sku,
            productName: row.product.name,
            locationId: row.location.id,
            locationCode: row.location.code,
            locationName: row.location.name,
            available: row.available,
          }))}
        />
      </div>

      <form action={deleteOrder} className="flex justify-end">
        <input type="hidden" name="id" value={order.id} />
        <button
          type="submit"
          className="px-4 py-2 rounded-lg border border-red-500/40 text-red-300 hover:text-white hover:bg-red-500/20"
        >
          Eliminar orden
        </button>
      </form>
    </div>
  );
}
