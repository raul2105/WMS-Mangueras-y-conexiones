import Link from "next/link";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { createAssemblyWorkOrderExact } from "@/lib/assembly/work-order-service";
import { previewAssemblyAvailability } from "@/lib/assembly/availability-service";
import { InventoryServiceError } from "@/lib/inventory-service";
import { getProductSearchSelection } from "@/lib/product-search";
import { assemblyConfigSchema, firstErrorMessage } from "@/lib/schemas/wms";
import AssemblyConfiguratorForm from "@/components/AssemblyConfiguratorForm";

export const dynamic = "force-dynamic";

function parseDecimal(value: string | undefined) {
  if (!value) return null;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

async function createAssemblyOrder(formData: FormData) {
  "use server";

  const warehouseId = String(formData.get("warehouseId") ?? "").trim();
  const entryFittingProductId = String(formData.get("entryFittingProductId") ?? "").trim();
  const hoseProductId = String(formData.get("hoseProductId") ?? "").trim();
  const exitFittingProductId = String(formData.get("exitFittingProductId") ?? "").trim();
  const hoseLengthRaw = String(formData.get("hoseLength") ?? "").trim();
  const assemblyQuantityRaw = String(formData.get("assemblyQuantity") ?? "").trim();
  const sourceDocumentRef = String(formData.get("sourceDocumentRef") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  const parsed = assemblyConfigSchema.safeParse({
    warehouseId,
    entryFittingProductId,
    hoseProductId,
    exitFittingProductId,
    hoseLengthRaw,
    assemblyQuantityRaw,
    sourceDocumentRef: sourceDocumentRef || undefined,
    notes: notes || undefined,
  });
  if (!parsed.success) {
    redirect(`/production/orders/new?error=${encodeURIComponent(firstErrorMessage(parsed.error))}`);
  }

  const payload = {
    warehouseId,
    entryFittingProductId,
    hoseProductId,
    exitFittingProductId,
    hoseLength: parsed.data.hoseLengthRaw,
    assemblyQuantity: parsed.data.assemblyQuantityRaw,
    sourceDocumentRef: sourceDocumentRef || null,
    notes: notes || null,
  };

  try {
    const result = await createAssemblyWorkOrderExact(prisma, payload);
    redirect(`/production/orders/${result.orderId}?ok=${encodeURIComponent("Orden de ensamble creada con reserva exacta")}`);
  } catch (error) {
    const message = error instanceof InventoryServiceError ? error.message : "No se pudo crear la orden";
    redirect(`/production/orders/new?error=${encodeURIComponent(message)}`);
  }
}

export default async function NewAssemblyOrderPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;

  const values = {
    warehouseId: String(sp.warehouseId ?? ""),
    entryFittingProductId: String(sp.entryFittingProductId ?? ""),
    hoseProductId: String(sp.hoseProductId ?? ""),
    exitFittingProductId: String(sp.exitFittingProductId ?? ""),
    hoseLength: String(sp.hoseLength ?? ""),
    assemblyQuantity: String(sp.assemblyQuantity ?? ""),
    sourceDocumentRef: String(sp.sourceDocumentRef ?? ""),
    notes: String(sp.notes ?? ""),
  };

  const [warehouses, entryFittingSelection, hoseSelection, exitFittingSelection] = await Promise.all([
    prisma.warehouse.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true },
    }),
    getProductSearchSelection(prisma, values.entryFittingProductId, {
      type: "FITTING",
      warehouseId: values.warehouseId || undefined,
    }),
    getProductSearchSelection(prisma, values.hoseProductId, {
      type: "HOSE",
      warehouseId: values.warehouseId || undefined,
    }),
    getProductSearchSelection(prisma, values.exitFittingProductId, {
      type: "FITTING",
      warehouseId: values.warehouseId || undefined,
    }),
  ]);

  const inputReady = Boolean(
    values.warehouseId &&
      values.entryFittingProductId &&
      values.hoseProductId &&
      values.exitFittingProductId &&
      parseDecimal(values.hoseLength) &&
      parseDecimal(values.assemblyQuantity)
  );

  let preview:
    | Awaited<ReturnType<typeof previewAssemblyAvailability>>
    | null = null;
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
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Configurador de Ensamble 3 Piezas</h1>
          <p className="text-slate-400 mt-1">Política activa: la orden solo se crea con stock exacto.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/production/orders/new/generic" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">
            Nueva genérica
          </Link>
          <Link href="/production/orders" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">
            ← Ordenes
          </Link>
        </div>
      </div>

      {sp.error && <div className="glass-card border border-red-500/30 text-red-200">{sp.error}</div>}

      <AssemblyConfiguratorForm
        warehouses={warehouses}
        initialValues={values}
        initialSelections={{
          entryFitting: entryFittingSelection,
          hose: hoseSelection,
          exitFitting: exitFittingSelection,
        }}
      />

      <div className="glass-card space-y-4">
        <h2 className="text-lg font-semibold">2) Disponibilidad real por ubicación</h2>
        {!preview && <p className="text-slate-400">Configura los 3 componentes, longitud y cantidad para generar previsualización.</p>}
        {preview && (
          <>
            <div className={`rounded-lg border px-4 py-3 ${preview.exact ? "border-green-500/30 text-green-200" : "border-red-500/30 text-red-200"}`}>
              {preview.exact
                ? "Disponible exacto: ya puedes crear la orden."
                : "Stock insuficiente: no se permite crear la orden con faltantes."}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 border-b border-white/10">
                  <th className="text-left py-2">Componente</th>
                  <th className="text-left py-2">Ubicación</th>
                  <th className="text-right py-2">Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {preview.allocations.map((allocation, index) => (
                  <tr key={`${allocation.role}-${allocation.locationId}-${index}`} className="border-b border-white/5">
                    <td className="py-2 text-slate-300">{allocation.role}</td>
                    <td className="py-2 text-slate-400">{allocation.locationCode} - {allocation.locationName}</td>
                    <td className="py-2 text-right text-slate-300">{allocation.requestedQty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.shortages.length > 0 && (
              <div className="space-y-1">
                {preview.shortages.map((shortage) => (
                  <p key={shortage.role} className="text-sm text-red-300">
                    {shortage.role}: requerido {shortage.requiredQty}, faltante {shortage.shortQty}
                  </p>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <form action={createAssemblyOrder} className="glass-card space-y-4">
        <h2 className="text-lg font-semibold">3) Crear orden de ensamble exacta</h2>
        <input type="hidden" name="warehouseId" value={values.warehouseId} />
        <input type="hidden" name="entryFittingProductId" value={values.entryFittingProductId} />
        <input type="hidden" name="hoseProductId" value={values.hoseProductId} />
        <input type="hidden" name="exitFittingProductId" value={values.exitFittingProductId} />
        <input type="hidden" name="hoseLength" value={values.hoseLength} />
        <input type="hidden" name="assemblyQuantity" value={values.assemblyQuantity} />
        <input type="hidden" name="sourceDocumentRef" value={values.sourceDocumentRef} />
        <input type="hidden" name="notes" value={values.notes} />
        <p className="text-slate-400 text-sm">
          La creación aparta inventario y genera lista de surtido con ubicación exacta.
        </p>
        <div className="flex justify-end">
          <button type="submit" className="btn-primary disabled:opacity-50" disabled={!preview?.exact}>
            Crear orden exacta
          </button>
        </div>
      </form>
    </div>
  );
}
