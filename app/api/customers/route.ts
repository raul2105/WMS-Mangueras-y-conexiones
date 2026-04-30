import prisma from "@/lib/prisma";
import { createCustomer, CustomerServiceError, searchCustomers } from "@/lib/customers/customer-service";
import { requirePermission } from "@/lib/rbac";
import { getSessionContext } from "@/lib/auth/session-context";
import { customerQuickCreateInlineSchema, firstErrorMessage } from "@/lib/schemas/wms";

export const dynamic = "force-dynamic";

function normalizeTaxId(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

export async function POST(request: Request) {
  await requirePermission("customers.manage");

  const body = await request.json().catch(() => null);
  const parsed = customerQuickCreateInlineSchema.safeParse({
    code: body?.code,
    name: body?.name,
    taxId: body?.taxId,
    email: body?.email,
  });

  if (!parsed.success) {
    return Response.json({ error: firstErrorMessage(parsed.error) }, { status: 400 });
  }

  const normalizedTaxId = normalizeTaxId(parsed.data.taxId);
  if (normalizedTaxId) {
    const existing = await searchCustomers(prisma, {
      taxId: normalizedTaxId,
      isActive: "all",
      page: 1,
      pageSize: 10,
    });
    const duplicated = existing.items.find((row) => String(row.taxId ?? "").trim().toUpperCase() === normalizedTaxId);
    if (duplicated) {
      return Response.json(
        { error: `Ya existe un cliente con ese RFC/NIF (${duplicated.code} - ${duplicated.name})` },
        { status: 409 },
      );
    }
  }

  const sessionCtx = await getSessionContext();

  try {
    const created = await createCustomer(prisma, {
      code: parsed.data.code,
      name: parsed.data.name,
      taxId: parsed.data.taxId,
      email: parsed.data.email || undefined,
      actor: sessionCtx.user?.name ?? sessionCtx.user?.email ?? "system",
      actorUserId: sessionCtx.user?.id ?? null,
      source: "production/requests/new/quick-create",
    });

    return Response.json(
      {
        id: created.id,
        code: created.code,
        name: created.name,
        taxId: created.taxId,
        email: created.email,
        isActive: created.isActive,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof CustomerServiceError) {
      const status = error.code.startsWith("DUPLICATE_") ? 409 : 400;
      const message =
        status === 409
          ? `${error.message}. Si ya existe en catálogo, búscalo y selecciónalo en el pedido.`
          : error.message;
      return Response.json({ error: message }, { status });
    }
    const message = error instanceof Error ? error.message : "No se pudo crear el cliente";
    return Response.json({ error: message }, { status: 500 });
  }
}
