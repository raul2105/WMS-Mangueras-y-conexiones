import prisma from "@/lib/prisma";
import { InventoryService, InventoryServiceError } from "@/lib/inventory-service";
import Link from "next/link";
import { redirect } from "next/navigation";
import InventoryCodeField from "@/components/InventoryCodeField";
import { firstErrorMessage, pickStockSchema } from "@/lib/schemas/wms";
import { createAuditLogSafeWithDb } from "@/lib/audit-log";
import { formatEquivalentSuggestion, getEquivalentProducts } from "@/lib/product-equivalences";
import { resolveProductInput } from "@/lib/product-search";
import { createMovementTraceAndLabelJob } from "@/lib/labeling-service";
import { buttonStyles } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { pageGuard } from "@/components/rbac/PageGuard";

export const dynamic = "force-dynamic";

async function pickStock(formData: FormData) {
  "use server";
  await (await import("@/lib/rbac")).requirePermission("inventory.pick");

  const code = String(formData.get("code") ?? "").trim();
  const locationCode = String(formData.get("location") ?? "").trim();
  const operatorName = String(formData.get("operatorName") ?? "").trim();
  const reference = String(formData.get("reference") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const qtyRaw = String(formData.get("quantity") ?? "").trim();
  const parsed = pickStockSchema.safeParse({
    code,
    locationCode,
    operatorName,
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
  let createdJobId: string | null = null;

  try {
    createdJobId = await prisma.$transaction(async (tx) => {
      const result = await service.pickStock(product.id, location.id, quantity, reference, {
        tx,
        notes,
        actor: operatorName,
        operatorName,
        source: "inventory/pick",
      });
      if (!result.movementId) {
        throw new Error("Movement ID missing after pick");
      }
      const { job } = await createMovementTraceAndLabelJob(tx, {
        movementId: result.movementId,
        labelType: "PICKING",
        sourceEntityType: "INVENTORY_MOVEMENT",
        sourceEntityId: result.movementId,
        operatorName,
      });

      await createAuditLogSafeWithDb({
        entityType: "INVENTORY_MOVEMENT",
        entityId: `${product.id}:${location.id}`,
        action: "PICK_FORM_SUBMIT",
        after: { quantity, reference, locationCode },
        source: "inventory/pick",
        actor: operatorName,
      }, tx);

      return job.id;
    }, { timeout: 20000 });
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
    redirect(`/inventory/pick?error=${encodeURIComponent("Ocurrio un error inesperado al registrar la salida")}`);
  }

  if (!createdJobId) {
    redirect("/inventory/pick?error=No%20se%20pudo%20generar%20etiqueta");
  }
  redirect(`/labels/jobs/${createdJobId}?next=${encodeURIComponent("/inventory/pick?ok=1")}`);
}

export default async function PickPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; suggestion?: string; suggestedCode?: string }>;
}) {
  await pageGuard("inventory.pick");
  const sp = await searchParams;
  const locations = await prisma.location.findMany({
    where: { isActive: true },
    orderBy: [{ warehouse: { code: "asc" } }, { code: "asc" }],
    select: {
      code: true,
      name: true,
      warehouse: { select: { code: true } },
    },
  });

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <PageHeader
        title="Picking (Salida)"
        description="Resta existencias del inventario y registra el movimiento de salida."
        actions={
          <Link href="/inventory" className={buttonStyles({ variant: "secondary" })}>
            Inventario
          </Link>
        }
      />

      {sp.error && (
        <div className="rounded-[var(--radius-lg)] border border-[color-mix(in oklab,var(--danger) 35%,var(--border-default))] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
          {sp.error}
        </div>
      )}
      {sp.suggestion && (
        <div className="rounded-[var(--radius-lg)] border border-[color-mix(in oklab,var(--warning) 35%,var(--border-default))] bg-[var(--warning-soft)] px-4 py-3 text-sm text-[var(--warning)] space-y-2">
          <p>{sp.suggestion}</p>
          {sp.suggestedCode && <p className="text-xs text-[var(--text-secondary)]">Prueba el codigo sugerido en el campo SKU o Referencia: {sp.suggestedCode}</p>}
        </div>
      )}
      {sp.ok && (
        <div className="rounded-[var(--radius-lg)] border border-[color-mix(in oklab,var(--success) 35%,var(--border-default))] bg-[var(--success-soft)] px-4 py-3 text-sm text-[var(--success)]">
          Salida registrada.
        </div>
      )}

      <SectionCard title="Formulario de salida" description="Completa los datos operativos para registrar picking.">
      <form action={pickStock} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InventoryCodeField
            name="code"
            label="SKU o Referencia *"
            placeholder="CON-R1AT-04"
            required
            showDetails
          />

          <Input name="quantity" required inputMode="decimal" label="Cantidad *" placeholder="2" />

          <Select name="location" required label="Ubicación *" placeholder="Selecciona una ubicación">
              <option value="">Selecciona una ubicación</option>
              {locations.map((location) => (
                <option key={location.code} value={location.code}>
                  {location.code} - {location.name} ({location.warehouse.code})
                </option>
              ))}
          </Select>
          <p className="-mt-2 text-xs text-[var(--text-muted)] md:col-span-1">Obligatorio para garantizar integridad de inventario.</p>

          <Input name="operatorName" required label="Operador *" placeholder="Nombre del operador" />

          <Input
            name="reference"
            label="Referencia pedido/OT"
            placeholder="Pedido/OT"
          />

          <Textarea name="notes" label="Notas" rootClassName="md:col-span-2" textareaClassName="min-h-[96px]" />
        </div>

        <div className="flex items-center justify-end gap-3">
          <Link href="/inventory" className={buttonStyles({ variant: "secondary" })}>Cancelar</Link>
          <button type="submit" className={buttonStyles()}>Registrar salida</button>
        </div>
      </form>
      </SectionCard>
    </div>
  );
}
