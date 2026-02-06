import prisma from "@/lib/prisma";
import Link from "next/link";
import { redirect } from "next/navigation";
import InventoryCodeField from "@/components/InventoryCodeField";

export const dynamic = "force-dynamic";

async function pickStock(formData: FormData) {
  "use server";

  const code = String(formData.get("code") ?? "").trim();
  const locationCode = String(formData.get("location") ?? "").trim() || null;
  const reference = String(formData.get("reference") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const qtyRaw = String(formData.get("quantity") ?? "").trim();
  const quantity = qtyRaw ? Number(qtyRaw.replace(",", ".")) : NaN;

  if (!code || !Number.isFinite(quantity) || quantity <= 0) {
    redirect(`/inventory/pick?error=${encodeURIComponent("Datos inválidos (código/cantidad)")}`);
  }

  const product = await prisma.product.findFirst({
    where: { OR: [{ sku: code }, { referenceCode: code }] },
    select: { id: true },
  });

  if (!product) {
    redirect(`/inventory/pick?error=${encodeURIComponent("Producto no encontrado (SKU/Referencia)")}`);
  }

  // Find location by code if provided
  const location = locationCode
    ? await prisma.location.findUnique({ where: { code: locationCode }, select: { id: true, code: true } })
    : null;

  if (locationCode && !location) {
    redirect(`/inventory/pick?error=${encodeURIComponent(`Ubicación no encontrada: ${locationCode}`)}`);
  }

  await prisma.$transaction(async (tx) => {
    const inv = await tx.inventory.findFirst({
      where: { productId: product.id, locationId: location?.id ?? null },
      select: { id: true, quantity: true, reserved: true, available: true },
    });
    const currentAvailable = inv?.available ?? 0;

    if (currentAvailable < quantity) {
      throw new Error("STOCK_INSUFFICIENT");
    }

    if (inv) {
      const newQty = inv.quantity - quantity;
      await tx.inventory.update({
        where: { id: inv.id },
        data: {
          quantity: newQty,
          available: newQty - inv.reserved, // Update available
        },
      });
    }

    await tx.inventoryMovement.create({
      data: {
        productId: product.id,
        locationId: location?.id ?? null,
        type: "OUT",
        quantity,
        reference,
        notes,
      },
    });
  }).catch((e) => {
    if (e instanceof Error && e.message === "STOCK_INSUFFICIENT") {
      redirect(`/inventory/pick?error=${encodeURIComponent("Stock insuficiente en esa ubicación")}`);
    }
    throw e;
  });

  redirect(`/inventory/pick?ok=1`);
}

export default async function PickPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const sp = await searchParams;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Picking (Salida)</h1>
          <p className="text-slate-400 mt-1">Resta existencias del inventario y guarda el movimiento.</p>
        </div>
        <Link href="/inventory" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">← Inventario</Link>
      </div>

      {sp.error && <div className="glass-card border border-red-500/30 text-red-200">{sp.error}</div>}
      {sp.ok && <div className="glass-card border border-green-500/30 text-green-200">Salida registrada.</div>}

      <form action={pickStock} className="glass-card space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InventoryCodeField
            name="code"
            label="SKU o Referencia *"
            placeholder="CON-R1AT-04"
            required
          />

          <label className="space-y-1">
            <span className="text-sm text-slate-400">Cantidad *</span>
            <input name="quantity" required inputMode="decimal" className="w-full px-4 py-3 glass rounded-lg" placeholder="2" />
          </label>

          <label className="space-y-1">
            <span className="text-sm text-slate-400">Ubicación</span>
            <input name="location" className="w-full px-4 py-3 glass rounded-lg" placeholder="A-12-04" />
            <p className="text-xs text-slate-500 mt-1">Recomendado: especifica ubicación para evitar salidas incorrectas.</p>
          </label>

          <label className="space-y-1">
            <span className="text-sm text-slate-400">Referencia pedido/OT</span>
            <input name="reference" className="w-full px-4 py-3 glass rounded-lg" placeholder="Pedido/OT" />
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-sm text-slate-400">Notas</span>
            <textarea name="notes" className="w-full px-4 py-3 glass rounded-lg min-h-[96px]" />
          </label>
        </div>

        <div className="flex items-center justify-end gap-3">
          <Link href="/inventory" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">Cancelar</Link>
          <button type="submit" className="btn-primary">Registrar salida</button>
        </div>
      </form>
    </div>
  );
}
