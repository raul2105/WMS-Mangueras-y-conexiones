import prisma from "@/lib/prisma";
import { InventoryService, InventoryServiceError } from "@/lib/inventory-service";
import Link from "next/link";
import { redirect } from "next/navigation";
import InventoryCodeField from "@/components/InventoryCodeField";
import { firstErrorMessage, transferStockSchema } from "@/lib/schemas/wms";
import { createAuditLogSafe } from "@/lib/audit-log";
import { resolveProductInput } from "@/lib/product-search";

export const dynamic = "force-dynamic";

async function transferStock(formData: FormData) {
  "use server";

  const code = String(formData.get("code") ?? "").trim();
  const fromLocationCode = String(formData.get("fromLocation") ?? "").trim();
  const toLocationCode = String(formData.get("toLocation") ?? "").trim();
  const qtyRaw = String(formData.get("quantity") ?? "").trim();
  const reference = String(formData.get("reference") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const parsed = transferStockSchema.safeParse({
    code,
    fromLocationCode,
    toLocationCode,
    quantityRaw: qtyRaw,
    reference: reference ?? undefined,
    notes: notes ?? undefined,
  });

  if (!parsed.success) {
    redirect(`/inventory/transfer?error=${encodeURIComponent(firstErrorMessage(parsed.error))}`);
  }

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
    redirect(`/inventory/transfer?error=${encodeURIComponent(hint)}`);
  }

  const [fromLocation, toLocation] = await Promise.all([
    prisma.location.findUnique({ where: { code: fromLocationCode }, select: { id: true, code: true } }),
    prisma.location.findUnique({ where: { code: toLocationCode }, select: { id: true, code: true } }),
  ]);

  if (!fromLocation || !toLocation) {
    redirect(`/inventory/transfer?error=${encodeURIComponent("Ubicacion origen/destino invalida")}`);
  }

  const service = new InventoryService(prisma);

  try {
    await service.transferStock(product.id, fromLocation.id, toLocation.id, parsed.data.quantityRaw, reference, {
      notes,
      fromLocationCode,
      toLocationCode,
      actor: "system",
      source: "inventory/transfer",
    });

    await createAuditLogSafe({
      entityType: "INVENTORY_MOVEMENT",
      entityId: `${product.id}:${fromLocation.id}->${toLocation.id}`,
      action: "TRANSFER_FORM_SUBMIT",
      after: { quantity: parsed.data.quantityRaw, fromLocationCode, toLocationCode, reference },
      source: "inventory/transfer",
      actor: "system",
    });
  } catch (error) {
    if (error instanceof InventoryServiceError) {
      const messages: Record<string, string> = {
        INSUFFICIENT_AVAILABLE: "Stock disponible insuficiente en la ubicación origen",
        INVENTORY_NOT_FOUND: "No hay inventario en la ubicación origen para ese producto",
        INVALID_TRANSFER: "La ubicación origen y destino no pueden ser la misma",
        INVALID_QTY: "Cantidad inválida",
      };
      const msg = messages[error.code] ?? `Error: ${error.message}`;
      redirect(`/inventory/transfer?error=${encodeURIComponent(msg)}`);
    }
    throw error;
  }

  redirect("/inventory/transfer?ok=1");
}

export default async function TransferPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
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
          <h1 className="text-3xl font-bold">Transferencia Interna</h1>
          <p className="text-slate-400 mt-1">Mueve stock entre ubicaciones de forma atomica.</p>
        </div>
        <Link href="/inventory" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">← Inventario</Link>
      </div>

      {sp.error && <div className="glass-card border border-red-500/30 text-red-200">{sp.error}</div>}
      {sp.ok && <div className="glass-card border border-green-500/30 text-green-200">Transferencia registrada.</div>}

      <form action={transferStock} className="glass-card space-y-6">
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
            <input name="quantity" required inputMode="decimal" className="w-full px-4 py-3 glass rounded-lg" placeholder="5" />
          </label>

          <label className="space-y-1">
            <span className="text-sm text-slate-400">Ubicacion origen *</span>
            <select name="fromLocation" required className="w-full px-4 py-3 glass rounded-lg">
              <option value="">Selecciona ubicación origen</option>
              {locations.map((location) => (
                <option key={`from-${location.code}`} value={location.code}>
                  {location.code} - {location.name} ({location.warehouse.code})
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-sm text-slate-400">Ubicacion destino *</span>
            <select name="toLocation" required className="w-full px-4 py-3 glass rounded-lg">
              <option value="">Selecciona ubicación destino</option>
              {locations.map((location) => (
                <option key={`to-${location.code}`} value={location.code}>
                  {location.code} - {location.name} ({location.warehouse.code})
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-sm text-slate-400">Referencia</span>
            <input
              name="reference"
              list={referenceSuggestions.length > 0 ? "transfer-reference-options" : undefined}
              className="w-full px-4 py-3 glass rounded-lg"
              placeholder="TRF-0001"
            />
            {referenceSuggestions.length > 0 && (
              <datalist id="transfer-reference-options">
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
          <button type="submit" className="btn-primary">Registrar transferencia</button>
        </div>
      </form>
    </div>
  );
}
