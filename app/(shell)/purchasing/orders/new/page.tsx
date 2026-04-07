import Link from "next/link";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { purchaseOrderCreateSchema, firstErrorMessage } from "@/lib/schemas/wms";
import { createAuditLogSafe } from "@/lib/audit-log";
import { Button, buttonStyles } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { pageGuard } from "@/components/rbac/PageGuard";

async function createOrder(formData: FormData) {
  "use server";
  await (await import("@/lib/rbac")).requirePermission("purchasing.manage");

  const supplierId = String(formData.get("supplierId") ?? "").trim();
  const expectedDate = String(formData.get("expectedDate") ?? "").trim() || undefined;
  const notes = String(formData.get("notes") ?? "").trim() || undefined;

  const parsed = purchaseOrderCreateSchema.safeParse({ supplierId, expectedDate, notes });
  if (!parsed.success) {
    redirect(`/purchasing/orders/new?error=${encodeURIComponent(firstErrorMessage(parsed.error))}`);
  }

  const supplier = await prisma.supplier.findUnique({ where: { id: parsed.data.supplierId } });
  if (!supplier || !supplier.isActive) {
    redirect(`/purchasing/orders/new?error=${encodeURIComponent("Proveedor no encontrado o inactivo")}`);
  }

  const count = await prisma.purchaseOrder.count();
  const year = new Date().getFullYear();
  const folio = `OC-${year}-${String(count + 1).padStart(4, "0")}`;

  const order = await prisma.purchaseOrder.create({
    data: {
      folio,
      supplierId: parsed.data.supplierId,
      expectedDate: parsed.data.expectedDate ? new Date(parsed.data.expectedDate) : null,
      notes: parsed.data.notes ?? null,
    },
    select: { id: true, folio: true },
  });

  await createAuditLogSafe({
    entityType: "PURCHASE_ORDER",
    entityId: order.id,
    action: "CREATE",
    after: JSON.stringify({ folio: order.folio, supplierId }),
    source: "purchasing/orders/new",
  });

  redirect(`/purchasing/orders/${order.id}`);
}

export default async function NewPurchaseOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await pageGuard("purchasing.manage");
  const sp = await searchParams;

  const suppliers = await prisma.supplier.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, code: true, name: true },
  });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <PageHeader
        title="Nueva Orden de Compra"
        description="Configura proveedor, fecha compromiso y notas operativas."
        actions={
          <Link href="/purchasing/orders" className={buttonStyles({ variant: "secondary" })}>
            Ordenes
          </Link>
        }
      />

      {sp.error && (
        <section className="surface border-[var(--danger)]/40 bg-[var(--danger-soft)] p-4 text-sm text-[var(--danger)]">{sp.error}</section>
      )}

      {suppliers.length === 0 && (
        <EmptyState
          compact
          title="No hay proveedores activos"
          description="Registra un proveedor antes de generar nuevas ordenes de compra."
          actions={<Link href="/purchasing/suppliers/new" className={buttonStyles({ variant: "secondary", size: "sm" })}>Crear proveedor</Link>}
        />
      )}

      <form action={createOrder}>
        <SectionCard
          title="Datos de la orden"
          footer={
            <>
              <Link href="/purchasing/orders" className={buttonStyles({ variant: "secondary" })}>Cancelar</Link>
              <Button type="submit" disabled={suppliers.length === 0}>Crear OC</Button>
            </>
          }
        >
          <Select name="supplierId" required label="Proveedor" placeholder="Seleccionar proveedor...">
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} - {s.name}
              </option>
            ))}
          </Select>

          <Input
            name="expectedDate"
            type="date"
            label="Fecha esperada de entrega"
            min={new Date().toISOString().slice(0, 10)}
          />

          <Textarea
            name="notes"
            label="Notas"
            rows={3}
            maxLength={1000}
            placeholder="Instrucciones especiales, condiciones de pago..."
            textareaClassName="resize-none"
          />
        </SectionCard>
      </form>
    </div>
  );
}
