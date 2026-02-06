import prisma from "@/lib/prisma";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

async function createWarehouse(formData: FormData) {
  "use server";

  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const address = String(formData.get("address") ?? "").trim() || null;
  const isActive = formData.get("isActive") === "on";

  if (!code || !name) {
    redirect(`/warehouse/new?error=${encodeURIComponent("Código y nombre son obligatorios")}`);
  }

  // Check if code already exists
  const existing = await prisma.warehouse.findUnique({
    where: { code },
    select: { id: true },
  });

  if (existing) {
    redirect(`/warehouse/new?error=${encodeURIComponent(`El código ${code} ya existe`)}`);
  }

  await prisma.warehouse.create({
    data: {
      code,
      name,
      description,
      address,
      isActive,
    },
  });

  redirect("/warehouse");
}

export default async function NewWarehousePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Nuevo Almacén</h1>
          <p className="text-slate-400 mt-1">Registra un nuevo almacén en el sistema</p>
        </div>
        <Link href="/warehouse" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">
          ← Almacenes
        </Link>
      </div>

      {sp.error && (
        <div className="glass-card border border-red-500/30 text-red-200">{sp.error}</div>
      )}

      <form action={createWarehouse} className="glass-card space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="space-y-1">
            <span className="text-sm text-slate-400">
              Código * <span className="text-xs text-slate-500">(ej: WH-01)</span>
            </span>
            <input
              name="code"
              required
              className="w-full px-4 py-3 glass rounded-lg uppercase"
              placeholder="WH-01"
              pattern="[A-Z0-9\-]+"
              title="Solo letras mayúsculas, números y guiones"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm text-slate-400">Nombre *</span>
            <input
              name="name"
              required
              className="w-full px-4 py-3 glass rounded-lg"
              placeholder="Almacén Principal"
            />
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-sm text-slate-400">Descripción</span>
            <textarea
              name="description"
              className="w-full px-4 py-3 glass rounded-lg min-h-[96px]"
              placeholder="Descripción del almacén..."
            />
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-sm text-slate-400">Dirección</span>
            <input
              name="address"
              className="w-full px-4 py-3 glass rounded-lg"
              placeholder="Av. Industrial 1234, Ciudad"
            />
          </label>

          <label className="flex items-center gap-3 md:col-span-2">
            <input type="checkbox" name="isActive" defaultChecked className="w-5 h-5" />
            <span className="text-sm text-slate-300">Almacén activo</span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-3">
          <Link href="/warehouse" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">
            Cancelar
          </Link>
          <button type="submit" className="btn-primary">
            Crear Almacén
          </button>
        </div>
      </form>
    </div>
  );
}
