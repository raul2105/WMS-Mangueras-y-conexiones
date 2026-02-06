import prisma from "@/lib/prisma";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

async function createOrder(formData: FormData) {
  "use server";

  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const status = String(formData.get("status") ?? "BORRADOR").trim();
  const warehouseId = String(formData.get("warehouseId") ?? "").trim();
  const customerName = String(formData.get("customerName") ?? "").trim() || null;
  const priorityRaw = String(formData.get("priority") ?? "").trim();
  const priority = priorityRaw ? Number(priorityRaw) : 3;
  const dueDateRaw = String(formData.get("dueDate") ?? "").trim();
  const dueDate = dueDateRaw ? new Date(dueDateRaw) : null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!code || !warehouseId) {
    redirect(`/production/orders/new?error=${encodeURIComponent("Codigo y almacen son obligatorios")}`);
  }

  if (!Number.isFinite(priority) || priority < 1 || priority > 5) {
    redirect(`/production/orders/new?error=${encodeURIComponent("Prioridad invalida (1-5)")}`);
  }

  const warehouse = await prisma.warehouse.findUnique({
    where: { id: warehouseId },
    select: { id: true },
  });

  if (!warehouse) {
    redirect(`/production/orders/new?error=${encodeURIComponent("Almacen no encontrado")}`);
  }

  const existing = await prisma.productionOrder.findUnique({
    where: { code },
    select: { id: true },
  });

  if (existing) {
    redirect(`/production/orders/new?error=${encodeURIComponent(`El codigo ${code} ya existe`)}`);
  }

  await prisma.productionOrder.create({
    data: {
      code,
      status: status as any,
      warehouseId,
      customerName,
      priority,
      dueDate,
      notes,
    },
  });

  redirect("/production/orders");
}

export default async function NewProductionOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const warehouses = await prisma.warehouse.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true },
  });

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Nueva Orden</h1>
          <p className="text-slate-400 mt-1">Registra una orden de ensamble.</p>
        </div>
        <Link href="/production/orders" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">
          ← Ordenes
        </Link>
      </div>

      {sp.error && (
        <div className="glass-card border border-red-500/30 text-red-200">{sp.error}</div>
      )}

      <form action={createOrder} className="glass-card space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="space-y-1">
            <span className="text-sm text-slate-400">Codigo *</span>
            <input
              name="code"
              required
              className="w-full px-4 py-3 glass rounded-lg uppercase"
              placeholder="ORD-0001"
              pattern="[A-Z0-9\-]+"
              title="Solo letras mayusculas, numeros y guiones"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm text-slate-400">Estado *</span>
            <select name="status" className="w-full px-4 py-3 glass rounded-lg">
              <option value="BORRADOR">BORRADOR</option>
              <option value="ABIERTA">ABIERTA</option>
              <option value="EN_PROCESO">EN PROCESO</option>
              <option value="COMPLETADA">COMPLETADA</option>
              <option value="CANCELADA">CANCELADA</option>
            </select>
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-sm text-slate-400">Almacen *</span>
            <select name="warehouseId" required className="w-full px-4 py-3 glass rounded-lg">
              <option value="">Selecciona un almacen</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name} ({warehouse.code})
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-sm text-slate-400">Cliente</span>
            <input name="customerName" className="w-full px-4 py-3 glass rounded-lg" placeholder="Cliente" />
          </label>

          <label className="space-y-1">
            <span className="text-sm text-slate-400">Prioridad (1-5)</span>
            <input
              name="priority"
              type="number"
              min={1}
              max={5}
              defaultValue={3}
              className="w-full px-4 py-3 glass rounded-lg"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm text-slate-400">Fecha entrega</span>
            <input name="dueDate" type="date" className="w-full px-4 py-3 glass rounded-lg" />
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-sm text-slate-400">Notas</span>
            <textarea name="notes" className="w-full px-4 py-3 glass rounded-lg min-h-[96px]" />
          </label>
        </div>

        <div className="flex items-center justify-end gap-3">
          <Link href="/production/orders" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">
            Cancelar
          </Link>
          <button type="submit" className="btn-primary">
            Crear Orden
          </button>
        </div>
      </form>
    </div>
  );
}
