import prisma from "@/lib/prisma";
import { InventoryService, InventoryServiceError } from "@/lib/inventory-service";
import Link from "next/link";
import { redirect } from "next/navigation";
import InventoryCodeField from "@/components/InventoryCodeField";
import { firstErrorMessage, inventoryAdjustmentSchema } from "@/lib/schemas/wms";
import { createAuditLogSafe } from "@/lib/audit-log";
import { resolveProductInput } from "@/lib/product-search";

export const dynamic = "force-dynamic";

async function adjustStock(formData: FormData) {
  "use server";

  const code = String(formData.get("code") ?? "").trim();
  const locationCode = String(formData.get("location") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const deltaRaw = String(formData.get("delta") ?? "").trim();

  const parsed = inventoryAdjustmentSchema.safeParse({
    code,
    locationCode,
    reason,
    deltaRaw,
  });

  if (!parsed.success) {
    redirect(`/inventory/adjust?error=${encodeURIComponent(firstErrorMessage(parsed.error))}`);
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
    redirect(`/inventory/adjust?error=${encodeURIComponent(hint)}`);
  }

  const location = await prisma.location.findUnique({
    where: { code: locationCode },
    select: { id: true, code: true },
  });

  if (!location) {
    redirect(`/inventory/adjust?error=${encodeURIComponent(`Ubicación no encontrada: ${locationCode}`)}`);
  }

  const service = new InventoryService(prisma);

  try {
    await service.adjustStock(product.id, location.id, parsed.data.deltaRaw, reason);
    await createAuditLogSafe({
      entityType: "INVENTORY_MOVEMENT",
      entityId: `${product.id}:${location.id}`,
      action: "ADJUST_FORM_SUBMIT",
      after: { delta: parsed.data.deltaRaw, reason },
      source: "inventory/adjust",
      actor: "system",
    });
  } catch (error) {
    if (error instanceof InventoryServiceError) {
      const messages: Record<string, string> = {
        NEGATIVE_STOCK: "El ajuste resultaría en stock negativo",
        RESERVED_EXCEEDS_QUANTITY: "El ajuste resultaría en stock menor al reservado",
        INVALID_QTY: "Cantidad de ajuste inválida",
        INVALID_REASON: "Motivo de ajuste requerido",
      };
      const msg = messages[error.code] ?? `Error: ${error.message}`;
      redirect(`/inventory/adjust?error=${encodeURIComponent(msg)}`);
    }
    throw error;
  }

  redirect("/inventory/adjust?ok=1");
}

export default async function AdjustPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const [locations, products] = await Promise.all([
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
  ]);
  const codeSuggestions = products.flatMap((p) => [p.sku, p.referenceCode ?? "", p.name, p.brand ?? ""]).filter(Boolean);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Ajuste de Inventario</h1>
          <p className="text-slate-400 mt-1">Registra ajustes positivos o negativos con motivo obligatorio.</p>
        </div>
        <Link href="/inventory" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">← Inventario</Link>
      </div>

      {sp.error && <div className="glass-card border border-red-500/30 text-red-200">{sp.error}</div>}
      {sp.ok && <div className="glass-card border border-green-500/30 text-green-200">Ajuste registrado.</div>}

      <form action={adjustStock} className="glass-card space-y-6">
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
            <span className="text-sm text-slate-400">Ajuste (+/-) *</span>
            <input name="delta" required inputMode="decimal" className="w-full px-4 py-3 glass rounded-lg" placeholder="-2 o 5" />
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
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-sm text-slate-400">Motivo *</span>
            <select name="reason" required className="w-full px-4 py-3 glass rounded-lg">
              <option value="">Selecciona un motivo</option>
              <option value="CONTEO_CICLICO">Conteo cíclico</option>
              <option value="MERMA_DANIO">Merma o daño</option>
              <option value="ERROR_CAPTURA">Corrección por error de captura</option>
              <option value="REUBICACION">Reubicación sin transferencia</option>
              <option value="AJUSTE_AUTORIZADO">Ajuste autorizado por supervisor</option>
            </select>
          </label>
        </div>

        <div className="flex items-center justify-end gap-3">
          <Link href="/inventory" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">Cancelar</Link>
          <button type="submit" className="btn-primary">Registrar ajuste</button>
        </div>
      </form>
    </div>
  );
}
