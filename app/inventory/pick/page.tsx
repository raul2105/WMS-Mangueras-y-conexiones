import prisma from "@/lib/prisma";
import { InventoryService, InventoryServiceError } from "@/lib/inventory-service";
import Link from "next/link";
import { redirect } from "next/navigation";
import InventoryCodeField from "@/components/InventoryCodeField";
import { firstErrorMessage, pickStockSchema } from "@/lib/schemas/wms";
import { createAuditLogSafe } from "@/lib/audit-log";
import { formatEquivalentSuggestion, getEquivalentProducts } from "@/lib/product-equivalences";
import { resolveProductInput } from "@/lib/product-search";

export const dynamic = "force-dynamic";

async function pickStock(formData: FormData) {
  "use server";

  const code = String(formData.get("code") ?? "").trim();
  const locationCode = String(formData.get("location") ?? "").trim();
  const reference = String(formData.get("reference") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const qtyRaw = String(formData.get("quantity") ?? "").trim();
  const parsed = pickStockSchema.safeParse({
    code,
    locationCode,
    reference: reference ?? undefined,
    notes: notes ?? undefined,
    quantityRaw: qtyRaw,
  });

  if (!parsed.success) {
    redirect(`/inventory/pick?error=${encodeURIComponent(firstErrorMessage(parsed.error))}`);
  }

  const quantity = parsed.data.quantityRaw;

  const { product, suggestions } = await resolveProductInput(prisma, code, {
    select: {
      id: true,
      sku: true,
      referenceCode: true,
      name: true,
      brand: true,
      description: true,
      type: true,
      subcategory: true,
      category: { select: { name: true } },
      inventory: { select: { quantity: true, available: true } },
      technicalAttributes: { take: 8, select: { keyNormalized: true, valueNormalized: true } },
    },
  });

  if (!product) {
    const hint = suggestions.length > 0
      ? `Coincidencias: ${suggestions.slice(0, 3).map((row) => row.sku).join(", ")}`
      : "Producto no encontrado (SKU/Referencia)";
    redirect(`/inventory/pick?error=${encodeURIComponent(hint)}`);
  }

  // Find location by code if provided
  const location = await prisma.location.findUnique({
    where: { code: locationCode },
    select: { id: true, code: true, warehouseId: true },
  });

  if (locationCode && !location) {
    redirect(`/inventory/pick?error=${encodeURIComponent(`Ubicación no encontrada: ${locationCode}`)}`);
  }

  if (!location) {
    redirect(`/inventory/pick?error=${encodeURIComponent("Ubicación no encontrada")}`);
  }

  const service = new InventoryService(prisma);

  try {
    await service.pickStock(product.id, location.id, quantity, reference, {
      notes,
      actor: "system",
      source: "inventory/pick",
    });

    await createAuditLogSafe({
      entityType: "INVENTORY_MOVEMENT",
      entityId: `${product.id}:${location.id}`,
      action: "PICK_FORM_SUBMIT",
      after: { quantity, reference, locationCode },
      source: "inventory/pick",
      actor: "system",
    });
  } catch (error) {
    if (error instanceof InventoryServiceError) {
      const messages: Record<string, string> = {
        INSUFFICIENT_AVAILABLE: "Stock disponible insuficiente en esa ubicación",
        INVENTORY_NOT_FOUND: "No hay inventario registrado en esa ubicación para ese producto",
        RESERVED_EXCEEDS_QUANTITY: "No se puede despachar: la cantidad reservada supera el stock resultante",
        INVALID_QTY: "Cantidad inválida",
      };
      const msg = messages[error.code] ?? `Error: ${error.message}`;

      if (error.code === "INSUFFICIENT_AVAILABLE" || error.code === "INVENTORY_NOT_FOUND") {
        const equivalents = await getEquivalentProducts(product.id, { warehouseId: location.warehouseId, limit: 1 });
        if (equivalents.length > 0) {
          const suggestion = formatEquivalentSuggestion(product, equivalents[0]);
          redirect(
            `/inventory/pick?error=${encodeURIComponent(msg)}&suggestion=${encodeURIComponent(suggestion)}&suggestedCode=${encodeURIComponent(equivalents[0].sku)}`
          );
        }

        const registeredEquivalents = await getEquivalentProducts(product.id, { limit: 1, inStockOnly: false });
        if (registeredEquivalents.length > 0) {
          const fallback = `No hay sustituto con stock disponible, pero existe equivalencia registrada para ${product.sku}. Revisa el detalle del producto para consultar contratipos.`;
          redirect(`/inventory/pick?error=${encodeURIComponent(msg)}&suggestion=${encodeURIComponent(fallback)}`);
        }
      }

      redirect(`/inventory/pick?error=${encodeURIComponent(msg)}`);
    }
    throw error;
  }

  redirect(`/inventory/pick?ok=1`);
}

export default async function PickPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; suggestion?: string; suggestedCode?: string }>;
}) {
  const sp = await searchParams;
  const [locations, products, recentReferences] = await Promise.all([
    prisma.location.findMany({
      where: { isActive: true },
      orderBy: [{ warehouse: { code: "asc" } }, { code: "asc" }],
      select: {
        code: true,
        name: true,
        warehouse: { select: { code: true } },
      },
    }),
    prisma.product.findMany({
      orderBy: { updatedAt: "desc" },
      take: 250,
      select: { sku: true, referenceCode: true, name: true, brand: true },
    }),
    prisma.inventoryMovement.findMany({
      where: { reference: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { reference: true },
    }),
  ]);

  const codeSuggestions = products.flatMap((p) => [p.sku, p.referenceCode ?? "", p.name, p.brand ?? ""]).filter(Boolean);
  const referenceSuggestions = Array.from(
    new Set(recentReferences.map((row) => row.reference?.trim() ?? "").filter(Boolean))
  );

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
      {sp.suggestion && (
        <div className="glass-card border border-amber-500/30 text-amber-100 space-y-2">
          <p>{sp.suggestion}</p>
          {sp.suggestedCode && <p className="text-xs text-amber-200/80">Prueba el codigo sugerido en el campo SKU o Referencia: {sp.suggestedCode}</p>}
        </div>
      )}
      {sp.ok && <div className="glass-card border border-green-500/30 text-green-200">Salida registrada.</div>}

      <form action={pickStock} className="glass-card space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InventoryCodeField
            name="code"
            label="SKU o Referencia *"
            placeholder="CON-R1AT-04"
            required
            suggestions={codeSuggestions}
            showDetails
          />

          <label className="space-y-1">
            <span className="text-sm text-slate-400">Cantidad *</span>
            <input name="quantity" required inputMode="decimal" className="w-full px-4 py-3 glass rounded-lg" placeholder="2" />
          </label>

          <label className="space-y-1">
            <span className="text-sm text-slate-400">Ubicación *</span>
            <select name="location" required className="w-full px-4 py-3 glass rounded-lg">
              <option value="">Selecciona una ubicación</option>
              {locations.map((location) => (
                <option key={location.code} value={location.code}>
                  {location.code} - {location.name} ({location.warehouse.code})
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-1">Obligatorio para garantizar integridad de inventario.</p>
          </label>

          <label className="space-y-1">
            <span className="text-sm text-slate-400">Referencia pedido/OT</span>
            <input
              name="reference"
              list={referenceSuggestions.length > 0 ? "pick-reference-options" : undefined}
              className="w-full px-4 py-3 glass rounded-lg"
              placeholder="Pedido/OT"
            />
            {referenceSuggestions.length > 0 && (
              <datalist id="pick-reference-options">
                {referenceSuggestions.map((reference) => (
                  <option key={reference} value={reference} />
                ))}
              </datalist>
            )}
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
