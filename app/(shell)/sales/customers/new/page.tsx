import Link from "next/link";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { customerCreateSchema, firstErrorMessage } from "@/lib/schemas/wms";
import { createCustomer, CustomerServiceError } from "@/lib/customers/customer-service";
import { Button, buttonStyles } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { Textarea } from "@/components/ui/textarea";
import { pageGuard } from "@/components/rbac/PageGuard";
import { getSessionContext } from "@/lib/auth/session-context";

async function createCustomerAction(formData: FormData) {
  "use server";
  await (await import("@/lib/rbac")).requirePermission("customers.manage");

  const sessionCtx = await getSessionContext();
  const code = String(formData.get("code") ?? "").trim().toUpperCase() || undefined;
  const name = String(formData.get("name") ?? "").trim();
  const legalName = String(formData.get("legalName") ?? "").trim() || undefined;
  const businessName = String(formData.get("businessName") ?? "").trim() || undefined;
  const taxId = String(formData.get("taxId") ?? "").trim().toUpperCase() || undefined;
  const email = String(formData.get("email") ?? "").trim().toLowerCase() || undefined;
  const phone = String(formData.get("phone") ?? "").trim() || undefined;
  const address = String(formData.get("address") ?? "").trim() || undefined;

  const parsed = customerCreateSchema.safeParse({
    code,
    name,
    legalName,
    businessName,
    taxId,
    email,
    phone,
    address,
  });

  if (!parsed.success) {
    redirect(`/sales/customers/new?error=${encodeURIComponent(firstErrorMessage(parsed.error))}`);
  }

  try {
    await createCustomer(prisma, {
      code: parsed.data.code,
      name: parsed.data.name,
      legalName: parsed.data.legalName,
      businessName: parsed.data.businessName,
      taxId: parsed.data.taxId,
      email: parsed.data.email || undefined,
      phone: parsed.data.phone,
      address: parsed.data.address,
      actor: sessionCtx.user?.name ?? sessionCtx.user?.email ?? "system",
      actorUserId: sessionCtx.user?.id ?? null,
      source: "sales/customers/new",
    });
  } catch (error) {
    if (error instanceof CustomerServiceError) {
      redirect(`/sales/customers/new?error=${encodeURIComponent(error.message)}`);
    }
    const message = error instanceof Error ? error.message : "No se pudo crear el cliente";
    redirect(`/sales/customers/new?error=${encodeURIComponent(message)}`);
  }

  redirect(`/sales/customers?ok=${encodeURIComponent("Cliente creado")}`);
}

export default async function NewCustomerPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await pageGuard("customers.manage");
  const sp = await searchParams;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <PageHeader
        title="Nuevo Cliente"
        description="Captura datos comerciales y fiscales para su uso en pedidos de surtido."
        actions={
          <Link href="/sales/customers" className={buttonStyles({ variant: "secondary" })}>
            Clientes
          </Link>
        }
      />

      {sp.error && (
        <section className="surface border-[var(--danger)]/40 bg-[var(--danger-soft)] p-4 text-sm text-[var(--danger)]">
          {sp.error}
        </section>
      )}

      <form action={createCustomerAction}>
        <SectionCard
          title="Datos del cliente"
          footer={
            <>
              <Link href="/sales/customers" className={buttonStyles({ variant: "secondary" })}>
                Cancelar
              </Link>
              <Button type="submit">Guardar Cliente</Button>
            </>
          }
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              name="code"
              maxLength={20}
              label="Código"
              placeholder="CLI-2026-0001"
              inputClassName="font-mono uppercase"
              hint="Opcional. Si lo dejas vacío se autogenera."
            />

            <Input
              name="name"
              required
              maxLength={200}
              label="Nombre (identificador interno)"
              placeholder="Cliente Ejemplo S.A."
            />

            <Input
              name="legalName"
              maxLength={200}
              label="Razón Social"
              placeholder="Cliente Ejemplo S.A. de C.V."
            />

            <Input
              name="businessName"
              maxLength={200}
              label="Nombre Comercial"
              placeholder="Cliente Ejemplo"
            />

            <Input
              name="taxId"
              maxLength={20}
              label="RFC"
              placeholder="EJMP010101AAA"
              inputClassName="font-mono uppercase"
              hint="Opcional. Si se captura debe tener entre 10 y 20 caracteres."
            />

            <Input name="email" type="email" maxLength={200} label="Email" placeholder="contacto@cliente.com" />

            <Input name="phone" maxLength={20} label="Teléfono" placeholder="+52 55 1234 5678" />
          </div>

          <Textarea
            name="address"
            rows={2}
            maxLength={500}
            label="Dirección"
            placeholder="Calle, Número, Colonia, CP, Ciudad"
            textareaClassName="resize-none"
          />
        </SectionCard>
      </form>
    </div>
  );
}
