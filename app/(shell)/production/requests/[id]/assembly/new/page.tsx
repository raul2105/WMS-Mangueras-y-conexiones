import Link from "next/link";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { previewAssemblyAvailability } from "@/lib/assembly/availability-service";
import { getProductSearchSelection } from "@/lib/product-search";
import AssemblyConfiguratorForm from "@/components/AssemblyConfiguratorForm";
import { buttonStyles } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { Badge } from "@/components/ui/badge";
import { addSalesRequestAssemblyLine } from "@/lib/sales/request-service";
import { requireSalesWriteAccess } from "@/lib/rbac/sales";
import { pageGuard } from "@/components/rbac/PageGuard";
import { firstErrorMessage, salesInternalOrderAssemblyLineCreateSchema } from "@/lib/schemas/wms";

export const dynamic = "force-dynamic";

function isNextRedirectError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof (error as { digest?: unknown }).digest === "string" &&
      (error as { digest: string }).digest.startsWith("NEXT_REDIRECT"),
  );
}

function parseDecimal(value: string | undefined) {
  if (!value) return null;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "--";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleDateString("es-MX");
}

async function createConfiguredAssembly(formData: FormData) {
  "use server";
  await requireSalesWriteAccess();

  const orderId = String(formData.get("orderId") ?? "").trim();
  const parsed = salesInternalOrderAssemblyLineCreateSchema.safeParse({
    orderId,
    warehouseId: String(formData.get("warehouseId") ?? "").trim(),
    entryFittingProductId: String(formData.get("entryFittingProductId") ?? "").trim(),
    hoseProductId: String(formData.get("hoseProductId") ?? "").trim(),
    exitFittingProductId: String(formData.get("exitFittingProductId") ?? "").trim(),
    hoseLengthRaw: String(formData.get("hoseLength") ?? "").trim(),
    assemblyQuantityRaw: String(formData.get("assemblyQuantity") ?? "").trim(),
    sourceDocumentRef: String(formData.get("sourceDocumentRef") ?? "").trim() || undefined,
    notes: String(formData.get("notes") ?? "").trim() || undefined,
  });
  if (!parsed.success) {
    redirect(`/production/requests/${orderId}/assembly/new?error=${encodeURIComponent(firstErrorMessage(parsed.error))}`);
  }

  try {
    await addSalesRequestAssemblyLine(prisma, {
      orderId: parsed.data.orderId,
      warehouseId: parsed.data.warehouseId,
      entryFittingProductId: parsed.data.entryFittingProductId,
      hoseProductId: parsed.data.hoseProductId,
      exitFittingProductId: parsed.data.exitFittingProductId,
      hoseLength: parsed.data.hoseLengthRaw,
      assemblyQuantity: parsed.data.assemblyQuantityRaw,
      sourceDocumentRef: parsed.data.sourceDocumentRef ?? null,
      notes: parsed.data.notes ?? null,
    });
    redirect(`/production/requests/${orderId}?ok=${encodeURIComponent("Ensamble configurado agregado al pedido")}`);
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    const message = error instanceof Error ? error.message : "No se pudo agregar el ensamble configurado";
    redirect(`/production/requests/${orderId}/assembly/new?error=${encodeURIComponent(message)}`);
  }
}

export default async function NewRequestAssemblyLinePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await pageGuard("sales.view");
  const { id } = await params;
  const sp = await searchParams;

  const order = await prisma.salesInternalOrder.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      code: true,
      warehouseId: true,
      customerName: true,
      dueDate: true,
      notes: true,
      warehouse: { select: { id: true, code: true, name: true } },
    },
  });

  if (!order) {
    redirect(`/production/requests?error=${encodeURIComponent("No se encontro el pedido de surtido")}`);
  }

  if (order.status !== "BORRADOR") {
    redirect(`/production/requests/${id}?error=${encodeURIComponent("El ensamble configurado solo se permite cuando el pedido esta en BORRADOR")}`);
  }

  const values = {
    warehouseId: order.warehouseId ?? "",
    entryFittingProductId: String(sp.entryFittingProductId ?? ""),
    hoseProductId: String(sp.hoseProductId ?? ""),
    exitFittingProductId: String(sp.exitFittingProductId ?? ""),
    hoseLength: String(sp.hoseLength ?? ""),
    assemblyQuantity: String(sp.assemblyQuantity ?? ""),
    sourceDocumentRef: String(sp.sourceDocumentRef ?? order.code),
    notes: String(sp.notes ?? ""),
  };

  const [entryFittingSelection, hoseSelection, exitFittingSelection] = await Promise.all([
    getProductSearchSelection(prisma, values.entryFittingProductId, { type: "FITTING", warehouseId: values.warehouseId || undefined }),
    getProductSearchSelection(prisma, values.hoseProductId, { type: "HOSE", warehouseId: values.warehouseId || undefined }),
    getProductSearchSelection(prisma, values.exitFittingProductId, { type: "FITTING", warehouseId: values.warehouseId || undefined }),
  ]);

  const inputReady = Boolean(
    values.warehouseId &&
      values.entryFittingProductId &&
      values.hoseProductId &&
      values.exitFittingProductId &&
      parseDecimal(values.hoseLength) &&
      parseDecimal(values.assemblyQuantity)
  );

  let preview: Awaited<ReturnType<typeof previewAssemblyAvailability>> | null = null;
  if (inputReady) {
    try {
      preview = await previewAssemblyAvailability(prisma, {
        warehouseId: values.warehouseId,
        entryFittingProductId: values.entryFittingProductId,
        hoseProductId: values.hoseProductId,
        exitFittingProductId: values.exitFittingProductId,
        hoseLength: parseDecimal(values.hoseLength) ?? 0,
        assemblyQuantity: parseDecimal(values.assemblyQuantity) ?? 0,
        sourceDocumentRef: values.sourceDocumentRef || null,
        notes: values.notes || null,
      });
    } catch {
      preview = null;
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="Agregar ensamble configurado"
        description="Configura el ensamble exacto y lígalo al pedido sin depender de un SKU ensamblado."
        actions={
          <Link href={`/production/requests/${order.id}`} className={buttonStyles({ variant: "secondary" })}>
            ← Volver al pedido
          </Link>
        }
      />

      {sp.error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{sp.error}</div>
      ) : null}

      <SectionCard title="Pedido">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-mono text-sm text-cyan-300">{order.code}</p>
            <p className="text-sm text-slate-300">{order.customerName ?? "--"} · {order.warehouse?.code} - {order.warehouse?.name}</p>
            <p className="text-xs text-slate-500">Entrega: {formatDate(order.dueDate)}</p>
          </div>
          <Badge variant="warning" size="md">BORRADOR</Badge>
        </div>
      </SectionCard>

      <AssemblyConfiguratorForm
        warehouses={order.warehouse ? [order.warehouse] : []}
        initialValues={values}
        initialSelections={{
          entryFitting: entryFittingSelection,
          hose: hoseSelection,
          exitFitting: exitFittingSelection,
        }}
        hiddenFields={[{ name: "orderId", value: order.id }]}
        warehouseLocked
        title="1) Configurar ensamble exacto"
        notesLabel="Notas técnicas"
      />

      <SectionCard title="2) Disponibilidad real por ubicación">
        {!preview ? (
          <p className="text-slate-400">Configura los 3 componentes, longitud y cantidad para generar la previsualización.</p>
        ) : (
          <>
            <div className={`rounded-lg border px-4 py-3 text-sm ${preview.exact
              ? "border-[color-mix(in_oklab,var(--success)_35%,var(--border-default))] bg-[var(--success-soft)] text-[var(--success)]"
              : "border-[color-mix(in_oklab,var(--danger)_35%,var(--border-default))] bg-[var(--danger-soft)] text-[var(--danger)]"}`}>
              {preview.exact
                ? "Disponible exacto: puedes agregar la línea configurada."
                : "Stock insuficiente: no se permite crear la línea configurada con faltantes."}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400">
                    <th className="py-3 text-left">Componente</th>
                    <th className="py-3 text-left">Ubicación</th>
                    <th className="py-3 text-right">Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.allocations.map((allocation, index) => (
                    <tr key={`${allocation.role}-${allocation.locationId}-${index}`} className="border-b border-white/5">
                      <td className="py-3">{allocation.role}</td>
                      <td className="py-3">{allocation.locationCode} - {allocation.locationName}</td>
                      <td className="py-3 text-right">{allocation.requestedQty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.shortages.length > 0 ? (
              <div className="space-y-1">
                {preview.shortages.map((shortage) => (
                  <p key={shortage.role} className="text-sm text-[var(--danger)]">
                    {shortage.role}: requerido {shortage.requiredQty}, faltante {shortage.shortQty}
                  </p>
                ))}
              </div>
            ) : null}
          </>
        )}
      </SectionCard>

      <SectionCard title="3) Confirmar línea configurada">
        <form action={createConfiguredAssembly} className="space-y-4">
          <input type="hidden" name="orderId" value={order.id} />
          <input type="hidden" name="warehouseId" value={values.warehouseId} />
          <input type="hidden" name="entryFittingProductId" value={values.entryFittingProductId} />
          <input type="hidden" name="hoseProductId" value={values.hoseProductId} />
          <input type="hidden" name="exitFittingProductId" value={values.exitFittingProductId} />
          <input type="hidden" name="hoseLength" value={values.hoseLength} />
          <input type="hidden" name="assemblyQuantity" value={values.assemblyQuantity} />
          <input type="hidden" name="sourceDocumentRef" value={values.sourceDocumentRef} />
          <input type="hidden" name="notes" value={values.notes} />
          <p className="text-sm text-slate-400">
            La confirmación crea la línea configurada, genera la orden exacta ligada y aparta inventario para el ensamble.
          </p>
          <div className="flex justify-end">
            <button type="submit" className={buttonStyles({ className: !preview?.exact ? "opacity-50" : "" })} disabled={!preview?.exact}>
              Agregar al pedido
            </button>
          </div>
        </form>
      </SectionCard>
    </div>
  );
}
