import Link from "next/link";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { supplierCreateSchema, firstErrorMessage } from "@/lib/schemas/wms";
import { createAuditLogSafe } from "@/lib/audit-log";

async function createSupplier(formData: FormData) {
  "use server";

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
  const sp = await searchParams;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/purchasing/suppliers" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">← Proveedores</Link>
        <h1 className="text-2xl font-bold">Nuevo Proveedor</h1>
      </div>

      {sp.error && (
        <div className="glass-card border border-red-500/30 text-red-200 text-sm">{sp.error}</div>
      )}

      <form action={createSupplier} className="glass-card space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="space-y-1">
            <span className="text-sm text-slate-400">Código *</span>
            <input
              name="code"
              required
              maxLength={20}
              placeholder="PROV-001"
              className="w-full px-4 py-3 glass rounded-lg font-mono uppercase"
              style={{ textTransform: "uppercase" }}
            />
            <p className="text-xs text-slate-500">Solo mayúsculas, números y guiones</p>
          </label>

          <label className="space-y-1">
            <span className="text-sm text-slate-400">Nombre *</span>
            <input
              name="name"
              required
              maxLength={200}
              placeholder="Distribuidora Ejemplo S.A."
              className="w-full px-4 py-3 glass rounded-lg"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm text-slate-400">RFC</span>
            <input
              name="taxId"
              maxLength={20}
              placeholder="EJMP010101AAA"
              className="w-full px-4 py-3 glass rounded-lg font-mono"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm text-slate-400">Email</span>
            <input
              name="email"
              type="email"
              maxLength={200}
              placeholder="contacto@proveedor.com"
              className="w-full px-4 py-3 glass rounded-lg"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm text-slate-400">Teléfono</span>
            <input
              name="phone"
              maxLength={20}
              placeholder="+52 55 1234 5678"
              className="w-full px-4 py-3 glass rounded-lg"
            />
          </label>
        </div>

        <label className="space-y-1 block">
          <span className="text-sm text-slate-400">Dirección</span>
          <textarea
            name="address"
            rows={2}
            maxLength={500}
            placeholder="Calle, Número, Colonia, CP, Ciudad"
            className="w-full px-4 py-3 glass rounded-lg resize-none"
          />
        </label>

        <div className="flex justify-end gap-3 pt-2 border-t border-white/10">
          <Link href="/purchasing/suppliers" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">
            Cancelar
          </Link>
          <button type="submit" className="btn-primary">Guardar Proveedor</button>
        </div>
      </form>
    </div>
  );
}
