import prisma from "@/lib/prisma";
import { InventoryService, InventoryServiceError } from "@/lib/inventory-service";
import Link from "next/link";
import { redirect } from "next/navigation";
import InventoryCodeField from "@/components/InventoryCodeField";
import { firstErrorMessage, transferStockSchema } from "@/lib/schemas/wms";
import { createAuditLogSafe } from "@/lib/audit-log";
import { resolveProductInput } from "@/lib/product-search";
import { buttonStyles } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

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
    redirect(`/inventory/transfer?error=${encodeURIComponent("Ocurrio un error inesperado al registrar la transferencia")}`);
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
      <PageHeader
        title="Transferencia Interna"
        description="Mueve stock entre ubicaciones de forma atomica."
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
      {sp.ok && (
        <div className="rounded-[var(--radius-lg)] border border-[color-mix(in oklab,var(--success) 35%,var(--border-default))] bg-[var(--success-soft)] px-4 py-3 text-sm text-[var(--success)]">
          Transferencia registrada.
        </div>
      )}

      <SectionCard title="Formulario de transferencia" description="Define origen, destino y cantidad para mover inventario.">
      <form action={transferStock} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InventoryCodeField
            name="code"
            label="SKU o Referencia *"
            placeholder="CON-R1AT-04"
            required
            suggestions={codeSuggestions}
            showDetails
          />

          <Input name="quantity" required inputMode="decimal" label="Cantidad *" placeholder="5" />

          <Select name="fromLocation" required label="Ubicacion origen *" placeholder="Selecciona ubicación origen">
              <option value="">Selecciona ubicación origen</option>
              {locations.map((location) => (
                <option key={`from-${location.code}`} value={location.code}>
                  {location.code} - {location.name} ({location.warehouse.code})
                </option>
              ))}
          </Select>

          <Select name="toLocation" required label="Ubicacion destino *" placeholder="Selecciona ubicación destino">
              <option value="">Selecciona ubicación destino</option>
              {locations.map((location) => (
                <option key={`to-${location.code}`} value={location.code}>
                  {location.code} - {location.name} ({location.warehouse.code})
                </option>
              ))}
          </Select>

          <Input
            name="reference"
            label="Referencia"
            list={referenceSuggestions.length > 0 ? "transfer-reference-options" : undefined}
            placeholder="TRF-0001"
          />
            {referenceSuggestions.length > 0 && (
              <datalist id="transfer-reference-options">
                {referenceSuggestions.map((reference) => (
                  <option key={reference} value={reference} />
                ))}
              </datalist>
            )}

          <Textarea name="notes" label="Notas" rootClassName="md:col-span-2" textareaClassName="min-h-[96px]" />
        </div>

        <div className="flex items-center justify-end gap-3">
          <Link href="/inventory" className={buttonStyles({ variant: "secondary" })}>Cancelar</Link>
          <button type="submit" className={buttonStyles()}>Registrar transferencia</button>
        </div>
      </form>
      </SectionCard>
    </div>
  );
}
