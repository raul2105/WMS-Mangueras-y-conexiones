import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { customerUpdateSchema, firstErrorMessage } from "@/lib/schemas/wms";
import { CustomerServiceError, getCustomerById, updateCustomer } from "@/lib/customers/customer-service";
import { pageGuard } from "@/components/rbac/PageGuard";
import { getSessionContext } from "@/lib/auth/session-context";
import { Button, buttonStyles } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { Textarea } from "@/components/ui/textarea";

export const dynamic = "force-dynamic";

async function updateCustomerAction(customerId: string, formData: FormData) {
  "use server";
  await (await import("@/lib/rbac")).requirePermission("customers.manage");

  const sessionCtx = await getSessionContext();
  const name = String(formData.get("name") ?? "").trim();
  const legalName = String(formData.get("legalName") ?? "").trim() || undefined;
  const businessName = String(formData.get("businessName") ?? "").trim() || undefined;
  const taxId = String(formData.get("taxId") ?? "").trim().toUpperCase() || undefined;
  const email = String(formData.get("email") ?? "").trim().toLowerCase() || undefined;
  const phone = String(formData.get("phone") ?? "").trim() || undefined;
  const address = String(formData.get("address") ?? "").trim() || undefined;
  const isActive = formData.get("isActive") === "on";

  const parsed = customerUpdateSchema.safeParse({
    name,
    legalName,
    businessName,
    taxId,
    email,
    phone,
    address,
    isActive,
  });

  if (!parsed.success) {
    redirect(`/sales/customers/${customerId}/edit?error=${encodeURIComponent(firstErrorMessage(parsed.error))}`);
  }

  try {
    await updateCustomer(prisma, {
      id: customerId,
      name: parsed.data.name,
      legalName: parsed.data.legalName,
      businessName: parsed.data.businessName,
      taxId: parsed.data.taxId,
      email: parsed.data.email || undefined,
      phone: parsed.data.phone,
      address: parsed.data.address,
      isActive: parsed.data.isActive,
      actor: sessionCtx.user?.name ?? sessionCtx.user?.email ?? "system",
      actorUserId: sessionCtx.user?.id ?? null,
      source: "sales/customers/[id]/edit",
    });
  } catch (error) {
    if (error instanceof CustomerServiceError) {
      redirect(`/sales/customers/${customerId}/edit?error=${encodeURIComponent(error.message)}`);
    }
    const message = error instanceof Error ? error.message : "No se pudo actualizar el cliente";
    redirect(`/sales/customers/${customerId}/edit?error=${encodeURIComponent(message)}`);
  }

  redirect(`/sales/customers/${customerId}?ok=${encodeURIComponent("Cliente actualizado")}`);
}

export default async function EditCustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await pageGuard("customers.manage");
  const [{ id }, sp] = await Promise.all([params, searchParams]);

  let customer;
  try {
    customer = await getCustomerById(prisma, id);
  } catch (error) {
    if (error instanceof CustomerServiceError && error.code === "CUSTOMER_NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  const updateCustomerActionWithId = updateCustomerAction.bind(null, customer.id);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <PageHeader
        title={`Editar Cliente: ${customer.name}`}
        description="Actualiza la información comercial y fiscal del cliente."
        actions={
          <>
            <Link href={`/sales/customers/${customer.id}`} className={buttonStyles({ variant: "secondary" })}>
              Detalle
            </Link>
            <Link href="/sales/customers" className={buttonStyles({ variant: "secondary" })}>
              Clientes
            </Link>
          </>
        }
      />

      {sp.error ? (
        <section className="surface border-[var(--danger)]/40 bg-[var(--danger-soft)] p-4 text-sm text-[var(--danger)]">
          {sp.error}
        </section>
      ) : null}

      <form action={updateCustomerActionWithId}>
        <SectionCard
          title="Datos del cliente"
          footer={
            <>
              <Link href={`/sales/customers/${customer.id}`} className={buttonStyles({ variant: "secondary" })}>
                Cancelar
              </Link>
              <Button type="submit">Guardar cambios</Button>
            </>
          }
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              label="Código"
              value={customer.code}
              disabled
              inputClassName="font-mono uppercase opacity-70 cursor-not-allowed"
              hint="El código no se puede modificar."
            />

            <Input
              name="name"
              required
              maxLength={200}
              label="Nombre (identificador interno)"
              defaultValue={customer.name}
            />

            <Input name="legalName" maxLength={200} label="Razón Social" defaultValue={customer.legalName ?? ""} />

            <Input name="businessName" maxLength={200} label="Nombre Comercial" defaultValue={customer.businessName ?? ""} />

            <Input
              name="taxId"
              maxLength={20}
              label="RFC"
              defaultValue={customer.taxId ?? ""}
              inputClassName="font-mono uppercase"
              hint="Opcional. Si se captura debe tener entre 10 y 20 caracteres."
            />

            <Input name="email" type="email" maxLength={200} label="Email" defaultValue={customer.email ?? ""} />

            <Input name="phone" maxLength={20} label="Teléfono" defaultValue={customer.phone ?? ""} />
          </div>

          <Textarea
            name="address"
            rows={2}
            maxLength={500}
            label="Dirección"
            defaultValue={customer.address ?? ""}
            textareaClassName="resize-none"
          />

          <label className="mt-2 flex items-center gap-3 text-sm text-[var(--text-secondary)]">
            <input type="checkbox" name="isActive" defaultChecked={customer.isActive} className="h-4 w-4" />
            Cliente activo
          </label>
        </SectionCard>
      </form>
    </div>
  );
}
