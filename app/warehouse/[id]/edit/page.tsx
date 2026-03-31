import prisma from "@/lib/prisma";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}

async function updateWarehouse(id: string, formData: FormData) {
  "use server";

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const address = String(formData.get("address") ?? "").trim() || null;
  const isActive = formData.get("isActive") === "on";

  if (!name) {
    redirect(`/warehouse/${id}/edit?error=${encodeURIComponent("El nombre es obligatorio")}`);
  }

  await prisma.warehouse.update({
    where: { id },
    data: { name, description, address, isActive },
  });

  redirect(`/warehouse/${id}`);
}

export default async function WarehouseEditPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = await searchParams;

  const warehouse = await prisma.warehouse.findUnique({ where: { id } });
  if (!warehouse) notFound();

  const updateWarehouseWithId = updateWarehouse.bind(null, id);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-400 mb-1">
            <Link href="/warehouse" className="hover:text-white">Almacenes</Link>
            <span>/</span>
            <Link href={`/warehouse/${id}`} className="hover:text-white">{warehouse.name}</Link>
            <span>/</span>
            <span className="text-white">Editar</span>
          </div>
          <h1 className="text-3xl font-bold">Editar Almacén</h1>
        </div>
        <Link href={`/warehouse/${id}`} className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">← Detalle</Link>
      </div>

      {sp.error && <div className="glass-card border border-red-500/30 text-red-200">{sp.error}</div>}

      <form action={updateWarehouseWithId} className="glass-card space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="space-y-1">
            <span className="text-sm text-slate-400">Código</span>
            <input value={warehouse.code} disabled className="w-full px-4 py-3 glass rounded-lg opacity-60 cursor-not-allowed font-mono" />
            <p className="text-xs text-slate-500">El código no se puede modificar.</p>
          </label>

          <label className="space-y-1">
            <span className="text-sm text-slate-400">Nombre *</span>
            <input name="name" required defaultValue={warehouse.name} className="w-full px-4 py-3 glass rounded-lg" />
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-sm text-slate-400">Descripción</span>
            <textarea name="description" rows={2} defaultValue={warehouse.description ?? ""} className="w-full px-4 py-3 glass rounded-lg" />
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-sm text-slate-400">Dirección</span>
            <input name="address" defaultValue={warehouse.address ?? ""} className="w-full px-4 py-3 glass rounded-lg" placeholder="Calle, colonia, ciudad" />
          </label>

          <label className="flex items-center gap-3 md:col-span-2">
            <input type="checkbox" name="isActive" defaultChecked={warehouse.isActive} className="w-5 h-5" />
            <span className="text-sm text-slate-300">Almacén activo</span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-3">
          <Link href={`/warehouse/${id}`} className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">Cancelar</Link>
          <button type="submit" className="btn-primary">Guardar cambios</button>
        </div>
      </form>
    </div>
  );
}
