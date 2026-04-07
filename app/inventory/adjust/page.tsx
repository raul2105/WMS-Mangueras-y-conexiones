import prisma from "@/lib/prisma";
import { InventoryService, InventoryServiceError } from "@/lib/inventory-service";
import Link from "next/link";
import { redirect } from "next/navigation";
import InventoryCodeField from "@/components/InventoryCodeField";
import { firstErrorMessage, inventoryAdjustmentSchema } from "@/lib/schemas/wms";
import { createAuditLogSafeWithDb } from "@/lib/audit-log";
import { resolveProductInput } from "@/lib/product-search";
import { createMovementTraceAndLabelJob } from "@/lib/labeling-service";
import { buttonStyles } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { Select } from "@/components/ui/select";
import { pageGuard } from "@/components/rbac/PageGuard";

export const dynamic = "force-dynamic";

async function adjustStock(formData: FormData) {
  "use server";
  await (await import("@/lib/rbac")).requirePermission("inventory.adjust");

  const code = String(formData.get("code") ?? "").trim();
  const locationCode = String(formData.get("location") ?? "").trim();
  const operatorName = String(formData.get("operatorName") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const deltaRaw = String(formData.get("delta") ?? "").trim();

  const parsed = inventoryAdjustmentSchema.safeParse({
    code,
    locationCode,
    operatorName,
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
  let createdJobId: string | null = null;

  try {
    createdJobId = await prisma.$transaction(async (tx) => {
      const result = await service.adjustStock(product.id, location.id, parsed.data.deltaRaw, reason, {
        tx,
        operatorName,
        actor: operatorName,
        source: "inventory/adjust",
      });
      if (!result.movementId) {
        throw new Error("Movement ID missing after adjustment");
      }
      const { job } = await createMovementTraceAndLabelJob(tx, {
        movementId: result.movementId,
        labelType: "ADJUSTMENT",
        sourceEntityType: "INVENTORY_MOVEMENT",
        sourceEntityId: result.movementId,
        operatorName,
      });

      await createAuditLogSafeWithDb({
        entityType: "INVENTORY_MOVEMENT",
        entityId: `${product.id}:${location.id}`,
        action: "ADJUST_FORM_SUBMIT",
        after: { delta: parsed.data.deltaRaw, reason },
        source: "inventory/adjust",
        actor: operatorName,
      }, tx);

      return job.id;
    }, { timeout: 20000 });
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
    redirect(`/inventory/adjust?error=${encodeURIComponent("Ocurrio un error inesperado al registrar el ajuste")}`);
  }

  if (!createdJobId) {
    redirect("/inventory/adjust?error=No%20se%20pudo%20generar%20etiqueta");
  }
  redirect(`/labels/jobs/${createdJobId}?next=${encodeURIComponent("/inventory/adjust?ok=1")}`);
}

export default async function AdjustPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await pageGuard("inventory.adjust");
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
      <PageHeader
        title="Ajuste de Inventario"
        description="Registra ajustes positivos o negativos con motivo obligatorio."
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
          Ajuste registrado.
        </div>
      )}

      <SectionCard title="Formulario de ajuste" description="Define cantidad de ajuste, ubicación y motivo de operación.">
      <form action={adjustStock} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InventoryCodeField
            name="code"
            label="SKU o Referencia *"
            placeholder="CON-R1AT-04"
            required
            suggestions={codeSuggestions}
            showDetails
          />

          <Input name="delta" required inputMode="decimal" label="Ajuste (+/-) *" placeholder="-2 o 5" />

          <Select name="location" required label="Ubicación *" placeholder="Selecciona una ubicación">
              <option value="">Selecciona una ubicación</option>
              {locations.map((location) => (
                <option key={location.code} value={location.code}>
                  {location.code} - {location.name} ({location.warehouse.code})
                </option>
              ))}
          </Select>

          <Input name="operatorName" required label="Operador *" placeholder="Nombre del operador" />

          <Select name="reason" required label="Motivo *" rootClassName="md:col-span-2" placeholder="Selecciona un motivo">
              <option value="">Selecciona un motivo</option>
              <option value="CONTEO_CICLICO">Conteo cíclico</option>
              <option value="MERMA_DANIO">Merma o daño</option>
              <option value="ERROR_CAPTURA">Corrección por error de captura</option>
              <option value="REUBICACION">Reubicación sin transferencia</option>
              <option value="AJUSTE_AUTORIZADO">Ajuste autorizado por supervisor</option>
          </Select>
        </div>

        <div className="flex items-center justify-end gap-3">
          <Link href="/inventory" className={buttonStyles({ variant: "secondary" })}>Cancelar</Link>
          <button type="submit" className={buttonStyles()}>Registrar ajuste</button>
        </div>
      </form>
      </SectionCard>
    </div>
  );
}
