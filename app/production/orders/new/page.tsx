import Link from "next/link";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { previewAssemblyAvailability } from "@/lib/assembly/availability-service";
import {
  configureAssemblyOrderExact,
  createAssemblyOrderDraftHeader,
} from "@/lib/assembly/work-order-service";
import { InventoryServiceError } from "@/lib/inventory-service";
import { getProductSearchSelection } from "@/lib/product-search";
import {
  assemblyConfigSchema,
  assemblyOrderHeaderSchema,
  firstErrorMessage,
  parseDueDate,
  parsePriority,
} from "@/lib/schemas/wms";
import AssemblyConfiguratorForm from "@/components/AssemblyConfiguratorForm";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { Select } from "@/components/ui/select";
import { Table, TableRow, TableWrap, Td, Th } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

export const dynamic = "force-dynamic";

function parseDecimal(value: string | undefined) {
  if (!value) return null;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function formatDateLabel(value: Date | string | null | undefined) {
  if (!value) return "--";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleDateString("es-MX");
}

async function createAssemblyDraft(formData: FormData) {
  "use server";

  const warehouseId = String(formData.get("warehouseId") ?? "").trim();
  const customerName = String(formData.get("customerName") ?? "").trim();
  const dueDateRaw = String(formData.get("dueDate") ?? "").trim();
  const priorityRaw = String(formData.get("priority") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  const parsed = assemblyOrderHeaderSchema.safeParse({
    warehouseId,
    customerName,
    dueDateRaw,
    priorityRaw,
    notes: notes || undefined,
  });
  if (!parsed.success) {
    redirect(`/production/orders/new?error=${encodeURIComponent(firstErrorMessage(parsed.error))}`);
  }

  const dueDate = parseDueDate(dueDateRaw);
  if (!dueDate) {
    redirect(`/production/orders/new?error=${encodeURIComponent("Fecha compromiso invalida")}`);
  }

  const priority = parsePriority(priorityRaw, 3);
  if (priority === null) {
    redirect(`/production/orders/new?error=${encodeURIComponent("Prioridad invalida (1-5)")}`);
  }

  let result: Awaited<ReturnType<typeof createAssemblyOrderDraftHeader>>;
  try {
    result = await createAssemblyOrderDraftHeader(prisma, {
      warehouseId,
      customerName,
      dueDate,
      priority,
      notes: notes || null,
    });
  } catch (error) {
    const message = error instanceof InventoryServiceError
      ? error.message
      : "Ocurrio un error inesperado al crear el encabezado";
    redirect(`/production/orders/new?error=${encodeURIComponent(message)}`);
  }

  redirect(
    `/production/orders/new?orderId=${encodeURIComponent(result.orderId)}&ok=${encodeURIComponent("Encabezado comercial creado")}`
  );
}

async function configureAssemblyOrder(formData: FormData) {
  "use server";

  const orderId = String(formData.get("orderId") ?? "").trim();
  const warehouseId = String(formData.get("warehouseId") ?? "").trim();
  const entryFittingProductId = String(formData.get("entryFittingProductId") ?? "").trim();
  const hoseProductId = String(formData.get("hoseProductId") ?? "").trim();
  const exitFittingProductId = String(formData.get("exitFittingProductId") ?? "").trim();
  const hoseLengthRaw = String(formData.get("hoseLength") ?? "").trim();
  const assemblyQuantityRaw = String(formData.get("assemblyQuantity") ?? "").trim();
  const sourceDocumentRef = String(formData.get("sourceDocumentRef") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!orderId) {
    redirect("/production/orders/new?error=Orden%20de%20ensamble%20invalida");
  }

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
    redirect(`/production/orders/new?orderId=${encodeURIComponent(orderId)}&error=${encodeURIComponent(firstErrorMessage(parsed.error))}`);
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

  let result: Awaited<ReturnType<typeof configureAssemblyOrderExact>>;
  try {
    result = await configureAssemblyOrderExact(prisma, orderId, payload);
  } catch (error) {
    const message = error instanceof InventoryServiceError
      ? error.message
      : "Ocurrio un error inesperado al configurar la orden";
    redirect(`/production/orders/new?orderId=${encodeURIComponent(orderId)}&error=${encodeURIComponent(message)}`);
  }

  redirect(`/production/orders/${result.orderId}?ok=${encodeURIComponent("Orden de ensamble creada con reserva exacta")}`);
}

export default async function NewAssemblyOrderPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const orderId = String(sp.orderId ?? "").trim() || null;

  const [warehouses, customers, order] = await Promise.all([
    prisma.warehouse.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true },
    }),
    prisma.productionOrder.findMany({
      where: { customerName: { not: null } },
      orderBy: { updatedAt: "desc" },
      take: 200,
      select: { customerName: true },
    }),
    orderId
      ? prisma.productionOrder.findUnique({
          where: { id: orderId },
          select: {
            id: true,
            code: true,
            kind: true,
            status: true,
            warehouseId: true,
            customerName: true,
            dueDate: true,
            priority: true,
            notes: true,
            warehouse: { select: { id: true, code: true, name: true } },
            assemblyConfiguration: { select: { id: true } },
            assemblyWorkOrder: { select: { id: true } },
          },
        })
      : Promise.resolve(null),
  ]);

  if (orderId && (!order || order.kind !== "ASSEMBLY_3PIECE")) {
    redirect("/production");
  }

  if (order?.assemblyConfiguration || order?.assemblyWorkOrder) {
    redirect(`/production/orders/${order.id}`);
  }

  const customerSuggestions = Array.from(
    new Set(customers.map((row) => row.customerName?.trim() ?? "").filter(Boolean))
  );

  const values = {
    warehouseId: order?.warehouseId ?? "",
    entryFittingProductId: String(sp.entryFittingProductId ?? ""),
    hoseProductId: String(sp.hoseProductId ?? ""),
    exitFittingProductId: String(sp.exitFittingProductId ?? ""),
    hoseLength: String(sp.hoseLength ?? ""),
    assemblyQuantity: String(sp.assemblyQuantity ?? ""),
    sourceDocumentRef: String(sp.sourceDocumentRef ?? ""),
    notes: String(sp.notes ?? ""),
  };

  const [entryFittingSelection, hoseSelection, exitFittingSelection] = await Promise.all([
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
    order &&
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
  if (order && inputReady) {
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
        title="Nueva orden de ensamble"
        description="Primero registra el encabezado comercial y despues configura el ensamble exacto."
        actions={
          <>
            <Link href="/production/orders/new/generic" className={buttonStyles({ variant: "secondary" })}>
              Nueva generica
            </Link>
            <Link href="/production" className={buttonStyles({ variant: "secondary" })}>
              Ensamble
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="surface rounded-[var(--radius-lg)] p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Paso 1</p>
          <h2 className="text-lg font-semibold mt-1">Datos comerciales</h2>
          <p className="text-sm text-slate-400 mt-1">
            {order
              ? "Encabezado creado. Cliente, fecha y prioridad quedaron ligados a la orden."
              : "Captura almacen, cliente y fecha compromiso antes de configurar materiales."}
          </p>
        </div>
        <div className="surface rounded-[var(--radius-lg)] p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Paso 2</p>
          <h2 className="text-lg font-semibold mt-1">Configuracion exacta</h2>
          <p className="text-sm text-slate-400 mt-1">
            {order
              ? "Define los 3 componentes, valida disponibilidad exacta y genera la lista de surtido."
              : "Se habilita cuando el encabezado comercial ya existe."}
          </p>
        </div>
      </div>

      {sp.error && (
        <div className="rounded-[var(--radius-lg)] border border-[color-mix(in oklab,var(--danger) 35%,var(--border-default))] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
          {sp.error}
        </div>
      )}
      {sp.ok && (
        <div className="rounded-[var(--radius-lg)] border border-[color-mix(in oklab,var(--success) 35%,var(--border-default))] bg-[var(--success-soft)] px-4 py-3 text-sm text-[var(--success)]">
          {sp.ok}
        </div>
      )}

      {!order && (
        <SectionCard title="1) Crear encabezado comercial">
        <form action={createAssemblyDraft} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select name="warehouseId" required rootClassName="md:col-span-2" label="Almacen *" placeholder="Selecciona un almacen">
                <option value="">Selecciona un almacen</option>
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name} ({warehouse.code})
                  </option>
                ))}
            </Select>

            <Input
              name="customerName"
              required
              label="Cliente *"
              list={customerSuggestions.length > 0 ? "assembly-customer-options" : undefined}
              placeholder="Cliente"
            />
              {customerSuggestions.length > 0 && (
                <datalist id="assembly-customer-options">
                  {customerSuggestions.map((customer) => (
                    <option key={customer} value={customer} />
                  ))}
                </datalist>
              )}

            <Input name="dueDate" type="date" required label="Fecha compromiso *" />

            <Input name="priority" type="number" min={1} max={5} defaultValue={3} label="Prioridad (1-5)" />

            <Textarea name="notes" label="Notas comerciales" rootClassName="md:col-span-2" />
          </div>

          <div className="flex items-center justify-end gap-3">
            <Link href="/production" className={buttonStyles({ variant: "secondary" })}>
              Cancelar
            </Link>
            <button type="submit" className={buttonStyles()}>
              Crear encabezado
            </button>
          </div>
        </form>
        </SectionCard>
      )}

      {order && (
        <>
          <SectionCard title="1) Encabezado comercial registrado" className="space-y-4" contentClassName="space-y-4" data-testid="assembly-commercial-summary">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-slate-400 mt-1">
                  Orden {order.code} en borrador, lista para configuracion tecnica.
                </p>
              </div>
              <Badge variant="warning" size="md">
                BORRADOR
              </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="space-y-1">
                <p className="text-slate-400">Almacen</p>
                <p className="text-slate-200">{order.warehouse.name} ({order.warehouse.code})</p>
              </div>
              <div className="space-y-1">
                <p className="text-slate-400">Cliente</p>
                <p className="text-slate-200">{order.customerName}</p>
              </div>
              <div className="space-y-1">
                <p className="text-slate-400">Fecha compromiso</p>
                <p className="text-slate-200">{formatDateLabel(order.dueDate)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-slate-400">Prioridad</p>
                <p className="text-slate-200">{order.priority}</p>
              </div>
              <div className="space-y-1 md:col-span-2">
                <p className="text-slate-400">Notas comerciales</p>
                <p className="text-slate-200 whitespace-pre-wrap">{order.notes ?? "--"}</p>
              </div>
            </div>
          </SectionCard>

          <AssemblyConfiguratorForm
            warehouses={[order.warehouse]}
            initialValues={values}
            initialSelections={{
              entryFitting: entryFittingSelection,
              hose: hoseSelection,
              exitFitting: exitFittingSelection,
            }}
            hiddenFields={[{ name: "orderId", value: order.id }]}
            warehouseLocked
            title="2) Configurar ensamble exacto"
            notesLabel="Notas tecnicas"
          />

          <SectionCard title="3) Disponibilidad real por ubicacion">
            {!preview && (
              <p className="text-slate-400">
                Configura los 3 componentes, longitud y cantidad para generar previsualizacion.
              </p>
            )}
            {preview && (
              <>
                <div className={`rounded-lg border px-4 py-3 text-sm ${preview.exact
                  ? "border-[color-mix(in_oklab,var(--success)_35%,var(--border-default))] bg-[var(--success-soft)] text-[var(--success)]"
                  : "border-[color-mix(in_oklab,var(--danger)_35%,var(--border-default))] bg-[var(--danger-soft)] text-[var(--danger)]"}`}>
                  {preview.exact
                    ? "Disponible exacto: ya puedes crear la orden."
                    : "Stock insuficiente: no se permite crear la orden con faltantes."}
                </div>
                <TableWrap striped>
                  <Table>
                    <thead>
                      <tr>
                        <Th>Componente</Th>
                        <Th>Ubicacion</Th>
                        <Th className="text-right">Cantidad</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.allocations.map((allocation, index) => (
                        <TableRow key={`${allocation.role}-${allocation.locationId}-${index}`}>
                          <Td>{allocation.role}</Td>
                          <Td>{allocation.locationCode} - {allocation.locationName}</Td>
                          <Td className="text-right font-semibold text-[var(--text-primary)]">{allocation.requestedQty}</Td>
                        </TableRow>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
                {preview.shortages.length > 0 && (
                  <div className="space-y-1">
                    {preview.shortages.map((shortage) => (
                      <p key={shortage.role} className="text-sm text-[var(--danger)]">
                        {shortage.role}: requerido {shortage.requiredQty}, faltante {shortage.shortQty}
                      </p>
                    ))}
                  </div>
                )}
              </>
            )}
          </SectionCard>

          <SectionCard title="4) Confirmar configuracion exacta">
          <form action={configureAssemblyOrder} className="space-y-4">
            <input type="hidden" name="orderId" value={order.id} />
            <input type="hidden" name="warehouseId" value={values.warehouseId} />
            <input type="hidden" name="entryFittingProductId" value={values.entryFittingProductId} />
            <input type="hidden" name="hoseProductId" value={values.hoseProductId} />
            <input type="hidden" name="exitFittingProductId" value={values.exitFittingProductId} />
            <input type="hidden" name="hoseLength" value={values.hoseLength} />
            <input type="hidden" name="assemblyQuantity" value={values.assemblyQuantity} />
            <input type="hidden" name="sourceDocumentRef" value={values.sourceDocumentRef} />
            <input type="hidden" name="notes" value={values.notes} />
            <p className="text-slate-400 text-sm">
              La confirmacion crea la configuracion tecnica, aparta inventario y genera la lista de surtido exacta.
            </p>
            <div className="flex justify-end">
              <button type="submit" className={buttonStyles({ className: !preview?.exact ? "opacity-50" : "" })} disabled={!preview?.exact}>
                Crear orden exacta
              </button>
            </div>
          </form>
          </SectionCard>
        </>
      )}
    </div>
  );
}
