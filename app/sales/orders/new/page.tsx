import Link from "next/link";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createAuditLogSafe } from "@/lib/audit-log";
import { buildProductSearchWhere } from "@/lib/product-search";
import { requireSalesWriteAccess } from "@/lib/rbac/sales";
import { pageGuard } from "@/components/rbac/PageGuard";
import { PageHeader } from "@/components/ui/page-header";
import { getNextSalesInternalOrderCode } from "@/lib/sales/internal-orders";
import { firstErrorMessage, parseDueDate, salesInternalOrderCreateSchema, salesInternalOrderLineSchema } from "@/lib/schemas/wms";

export const dynamic = "force-dynamic";

const EMPTY_LINE_COUNT = 6;

async function resolveProduct(input: string) {
  const normalized = input.trim();
  if (!normalized) return null;

  const exact = await prisma.product.findFirst({
    where: {
      OR: [
        { sku: normalized.toUpperCase() },
        { referenceCode: normalized.toUpperCase() },
        { name: normalized },
      ],
    },
    select: { id: true, sku: true, name: true },
  });
  if (exact) return exact;

  const candidates = await prisma.product.findMany({
    where: buildProductSearchWhere(normalized),
    orderBy: { updatedAt: "desc" },
    take: 2,
    select: { id: true, sku: true, name: true },
  });

  return candidates.length === 1 ? candidates[0] : null;
}

async function createSalesInternalOrder(formData: FormData) {
  "use server";
  await requireSalesWriteAccess();

  const session = await auth();
  const customerName = String(formData.get("customerName") ?? "").trim();
  const warehouseId = String(formData.get("warehouseId") ?? "").trim();
  const dueDateRaw = String(formData.get("dueDate") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  const parsedHeader = salesInternalOrderCreateSchema.safeParse({
    customerName,
    warehouseId,
    dueDateRaw,
    notes: notes || undefined,
  });
  if (!parsedHeader.success) {
    redirect(`/sales/orders/new?error=${encodeURIComponent(firstErrorMessage(parsedHeader.error))}`);
  }

  const dueDate = parseDueDate(dueDateRaw);
  if (!dueDate) {
    redirect(`/sales/orders/new?error=${encodeURIComponent("Fecha compromiso invalida")}`);
  }

  const lineCodes = formData.getAll("lineCode").map((value) => String(value ?? "").trim());
  const lineQtys = formData.getAll("requestedQty").map((value) => String(value ?? "").trim());
  const lineNotes = formData.getAll("lineNotes").map((value) => String(value ?? "").trim());

  const rawLines = lineCodes.map((code, index) => ({
    code,
    requestedQtyRaw: lineQtys[index] ?? "",
    notes: lineNotes[index] ?? "",
  })).filter((line) => line.code || line.requestedQtyRaw || line.notes);

  if (rawLines.length === 0) {
    redirect(`/sales/orders/new?error=${encodeURIComponent("Agrega al menos una linea de producto")}`);
  }

  const resolvedLines: Array<{ productId: string; requestedQty: number; notes: string | null; sku: string; name: string }> = [];
  for (const line of rawLines) {
    const product = await resolveProduct(line.code);
    if (!product) {
      redirect(`/sales/orders/new?error=${encodeURIComponent(`No se pudo resolver el producto \"${line.code}\"`)}`);
    }

    const parsedLine = salesInternalOrderLineSchema.safeParse({
      productId: product.id,
      requestedQtyRaw: line.requestedQtyRaw,
      notes: line.notes || undefined,
    });
    if (!parsedLine.success) {
      redirect(`/sales/orders/new?error=${encodeURIComponent(firstErrorMessage(parsedLine.error))}`);
    }

    resolvedLines.push({
      productId: product.id,
      requestedQty: parsedLine.data.requestedQtyRaw,
      notes: line.notes || null,
      sku: product.sku,
      name: product.name,
    });
  }

  const code = await getNextSalesInternalOrderCode(prisma);
  const created = await prisma.salesInternalOrder.create({
    data: {
      code,
      customerName,
      warehouseId,
      dueDate,
      notes: notes || null,
      requestedByUserId: session?.user?.id || null,
      lines: {
        create: resolvedLines.map((line) => ({
          productId: line.productId,
          requestedQty: line.requestedQty,
          notes: line.notes,
        })),
      },
    },
    select: { id: true, code: true },
  });

  await createAuditLogSafe({
    entityType: "SALES_INTERNAL_ORDER",
    entityId: created.id,
    action: "CREATE",
    after: {
      code: created.code,
      customerName,
      warehouseId,
      dueDate: dueDate.toISOString(),
      lines: resolvedLines.map((line) => ({ sku: line.sku, quantity: line.requestedQty })),
    },
    actor: session?.user?.email ?? session?.user?.name ?? "system",
    source: "sales/orders/new",
  });

  redirect(`/sales/orders/${created.id}?ok=${encodeURIComponent("Pedido interno creado")}`);
}

export default async function NewSalesOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await pageGuard("sales.view");
  const sp = await searchParams;

  const [warehouses, recentCustomers, productHints] = await Promise.all([
    prisma.warehouse.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
    prisma.salesInternalOrder.findMany({
      where: { customerName: { not: null } },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: { customerName: true },
    }),
    prisma.product.findMany({
      orderBy: { updatedAt: "desc" },
      take: 200,
      select: { sku: true, referenceCode: true, name: true },
    }),
  ]);

  const customerSuggestions = Array.from(new Set(recentCustomers.map((row) => row.customerName?.trim() ?? "").filter(Boolean)));
  const lineIndexes = Array.from({ length: EMPTY_LINE_COUNT }, (_, index) => index);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nuevo pedido interno"
        description="Captura comercial de demanda sin ejecutar movimientos fisicos de almacen."
        actions={<Link href="/sales/orders" className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:text-white">← Pedidos</Link>}
      />

      {sp.error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{sp.error}</div>
      ) : null}

      <form action={createSalesInternalOrder} className="space-y-6">
        <section className="glass-card grid gap-4 md:grid-cols-2">
          <label className="space-y-1 md:col-span-2">
            <span className="text-sm text-slate-400">Cliente</span>
            <input name="customerName" list={customerSuggestions.length > 0 ? "sales-customer-options" : undefined} required className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white" placeholder="Cliente / cuenta" />
            {customerSuggestions.length > 0 ? (
              <datalist id="sales-customer-options">
                {customerSuggestions.map((customer) => <option key={customer} value={customer} />)}
              </datalist>
            ) : null}
          </label>
          <label className="space-y-1">
            <span className="text-sm text-slate-400">Almacen</span>
            <select name="warehouseId" required className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white">
              <option value="">Selecciona un almacen</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>{warehouse.code} - {warehouse.name}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-sm text-slate-400">Fecha compromiso</span>
            <input name="dueDate" type="date" required className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white" />
          </label>
          <label className="space-y-1 md:col-span-2">
            <span className="text-sm text-slate-400">Notas</span>
            <textarea name="notes" className="min-h-[96px] w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white" placeholder="Contexto comercial, prioridad o consideraciones del cliente" />
          </label>
        </section>

        <section className="glass-card space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Lineas del pedido</h2>
            <p className="text-sm text-slate-400">Ingresa SKU o referencia exacta. Si el nombre coincide de forma unica tambien se resolvera.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-slate-400">
                  <th className="py-3 text-left">Producto</th>
                  <th className="py-3 text-left">Cantidad</th>
                  <th className="py-3 text-left">Notas</th>
                </tr>
              </thead>
              <tbody>
                {lineIndexes.map((index) => (
                  <tr key={index} className="border-b border-white/5 align-top">
                    <td className="py-3 pr-3">
                      <input name="lineCode" list="sales-product-options" className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white" placeholder="SKU o referencia" />
                    </td>
                    <td className="py-3 pr-3">
                      <input name="requestedQty" type="number" min={0} step="0.01" className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white" placeholder="0" />
                    </td>
                    <td className="py-3">
                      <input name="lineNotes" className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white" placeholder="Notas de la linea" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <datalist id="sales-product-options">
              {productHints.map((product) => (
                <option key={`${product.sku}-${product.referenceCode ?? "ref"}`} value={product.sku}>{product.name}{product.referenceCode ? ` - ${product.referenceCode}` : ""}</option>
              ))}
            </datalist>
          </div>
        </section>

        <div className="flex justify-end gap-3">
          <Link href="/sales/orders" className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:text-white">Cancelar</Link>
          <button type="submit" className="btn-primary">Crear pedido</button>
        </div>
      </form>
    </div>
  );
}
