import Link from "next/link";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { supplierCreateSchema, firstErrorMessage } from "@/lib/schemas/wms";
import { createAuditLogSafe } from "@/lib/audit-log";
import { Button, buttonStyles } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { Textarea } from "@/components/ui/textarea";
import { pageGuard } from "@/components/rbac/PageGuard";

async function createSupplier(formData: FormData) {
  "use server";
  await (await import("@/lib/rbac")).requirePermission("purchasing.manage");

  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  const taxId = String(formData.get("taxId") ?? "").trim() || undefined;
  const email = String(formData.get("email") ?? "").trim() || undefined;
  const phone = String(formData.get("phone") ?? "").trim() || undefined;
  const address = String(formData.get("address") ?? "").trim() || undefined;

  const parsed = supplierCreateSchema.safeParse({ code, name, taxId, email, phone, address });
  if (!parsed.success) {
    redirect(`/purchasing/suppliers/new?error=${encodeURIComponent(firstErrorMessage(parsed.error))}`);
  }

  const existing = await prisma.supplier.findUnique({ where: { code: parsed.data.code } });
  if (existing) {
    redirect(`/purchasing/suppliers/new?error=${encodeURIComponent(`Ya existe un proveedor con código ${parsed.data.code}`)}`);
  }

  const supplier = await prisma.supplier.create({
    data: {
      code: parsed.data.code,
      name: parsed.data.name,
      taxId: parsed.data.taxId ?? null,
      email: parsed.data.email || null,
      phone: parsed.data.phone ?? null,
      address: parsed.data.address ?? null,
    },
    select: { id: true },
  });

  await createAuditLogSafe({
    entityType: "SUPPLIER",
    entityId: supplier.id,
    action: "CREATE",
    after: JSON.stringify({ code: parsed.data.code, name: parsed.data.name }),
    source: "purchasing/suppliers/new",
  });

  redirect("/purchasing/suppliers");
}

export default async function NewSupplierPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await pageGuard("purchasing.manage");
  const sp = await searchParams;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <PageHeader
        title="Nuevo Proveedor"
        description="Captura datos fiscales y de contacto para abastecimiento."
        actions={
          <Link href="/purchasing/suppliers" className={buttonStyles({ variant: "secondary" })}>
            Proveedores
          </Link>
        }
      />

      {sp.error && (
        <section className="surface border-[var(--danger)]/40 bg-[var(--danger-soft)] p-4 text-sm text-[var(--danger)]">{sp.error}</section>
      )}

      <form action={createSupplier}>
        <SectionCard
          title="Datos del proveedor"
          footer={
            <>
              <Link href="/purchasing/suppliers" className={buttonStyles({ variant: "secondary" })}>
                Cancelar
              </Link>
              <Button type="submit">Guardar Proveedor</Button>
            </>
          }
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              name="code"
              required
              maxLength={20}
              label="Codigo"
              placeholder="PROV-001"
              inputClassName="font-mono uppercase"
              hint="Solo mayusculas, numeros y guiones."
            />

            <Input
              name="name"
              required
              maxLength={200}
              label="Nombre"
              placeholder="Distribuidora Ejemplo S.A."
            />

            <Input name="taxId" maxLength={20} label="RFC" placeholder="EJMP010101AAA" inputClassName="font-mono" />

            <Input name="email" type="email" maxLength={200} label="Email" placeholder="contacto@proveedor.com" />

            <Input name="phone" maxLength={20} label="Telefono" placeholder="+52 55 1234 5678" />
          </div>

          <Textarea
            name="address"
            rows={2}
            maxLength={500}
            label="Direccion"
            placeholder="Calle, Numero, Colonia, CP, Ciudad"
            textareaClassName="resize-none"
          />
        </SectionCard>
      </form>
    </div>
  );
}
