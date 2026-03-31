import Link from "next/link";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { purchaseOrderCreateSchema, firstErrorMessage } from "@/lib/schemas/wms";
import { createAuditLogSafe } from "@/lib/audit-log";

async function createOrder(formData: FormData) {
  "use server";

  const supplierId = String(formData.get("supplierId") ?? "").trim();
  const expectedDate = String(formData.get("expectedDate") ?? "").trim() || undefined;
  const notes = String(formData.get("notes") ?? "").trim() || undefined;

  const parsed = purchaseOrderCreateSchema.safeParse({ supplierId, expectedDate, notes });
  if (!parsed.success) {
    redirect(`/purchasing/orders/new?error=${encodeURIComponent(firstErrorMessage(parsed.error))}`);
  }

  const supplier = await prisma.supplier.findUnique({ where: { id: parsed.data.supplierId } });
  if (!supplier || !supplier.isActive) {
    redirect(`/purchasing/orders/new?error=${encodeURIComponent("Proveedor no encontrado o inactivo")}`);
  }

  const count = await prisma.purchaseOrder.count();
  const year = new Date().getFullYear();
  const folio = `OC-${year}-${String(count + 1).padStart(4, "0")}`;

  const order = await prisma.purchaseOrder.create({
    data: {
      folio,
      supplierId: parsed.data.supplierId,
      expectedDate: parsed.data.expectedDate ? new Date(parsed.data.expectedDate) : null,
      notes: parsed.data.notes ?? null,
    },
    select: { id: true, folio: true },
  });

  await createAuditLogSafe({
    entityType: "PURCHASE_ORDER",
    entityId: order.id,
    action: "CREATE",
    after: JSON.stringify({ folio: order.folio, supplierId }),
    source: "purchasing/orders/new",
  });

  redirect(`/purchasing/orders/${order.id}`);
}

export default async function NewPurchaseOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;

  const suppliers = await prisma.supplier.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, code: true, name: true },
  });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/purchasing/orders" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">← Órdenes</Link>
        <h1 className="text-2xl font-bold">Nueva Orden de Compra</h1>
      </div>

      {sp.error && (
        <div className="glass-card border border-red-500/30 text-red-200 text-sm">{sp.error}</div>
      )}

      {suppliers.length === 0 && (
        <div className="glass-card border border-amber-500/30 text-amber-200 text-sm">
          No hay proveedores activos.{" "}
          <Link href="/purchasing/suppliers/new" className="underline hover:no-underline">Crear proveedor →</Link>
        </div>
      )}

      <form action={createOrder} className="glass-card space-y-5">
        <label className="space-y-1 block">
          <span className="text-sm text-slate-400">Proveedor *</span>
          <select name="supplierId" required className="w-full px-4 py-3 glass rounded-lg">
            <option value="">Seleccionar proveedor…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.code} — {s.name}</option>
            ))}
          </select>
        </label>

        <label className="space-y-1 block">
          <span className="text-sm text-slate-400">Fecha esperada de entrega</span>
          <input
            name="expectedDate"
            type="date"
            className="w-full px-4 py-3 glass rounded-lg"
            min={new Date().toISOString().slice(0, 10)}
          />
        </label>

        <label className="space-y-1 block">
          <span className="text-sm text-slate-400">Notas</span>
          <textarea
            name="notes"
            rows={3}
            maxLength={1000}
            placeholder="Instrucciones especiales, condiciones de pago…"
            className="w-full px-4 py-3 glass rounded-lg resize-none"
          />
        </label>

        <div className="flex justify-end gap-3 pt-2 border-t border-white/10">
          <Link href="/purchasing/orders" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">Cancelar</Link>
          <button type="submit" className="btn-primary" disabled={suppliers.length === 0}>
            Crear OC
          </button>
        </div>
      </form>
    </div>
  );
}
