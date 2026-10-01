import prisma from "@/lib/prisma";
import Link from "next/link";
import { redirect } from "next/navigation";
import { pageGuard } from "@/components/rbac/PageGuard";
import type { LocationUsageType } from "@prisma/client";
import { createAuditLogRequiredWithDb } from "@/lib/audit-log";
import { resolveAuthenticatedActor } from "@/lib/auth/authenticated-actor";
import { getSessionContext } from "@/lib/auth/session-context";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

async function createLocation(formData: FormData) {
  "use server";
  await requirePermission("location.manage");
  const actor = resolveAuthenticatedActor(await getSessionContext());
  if (!actor.actorUserId || !actor.actorName) {
    redirect(`/warehouse?error=${encodeURIComponent("Sesión inválida para registrar la ubicación")}`);
  }

  const warehouseId = String(formData.get("warehouseId") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  const zone = String(formData.get("zone") ?? "").trim() || null;
  const aisle = String(formData.get("aisle") ?? "").trim() || null;
  const rack = String(formData.get("rack") ?? "").trim() || null;
  const level = String(formData.get("level") ?? "").trim() || null;
  const capacityRaw = String(formData.get("capacity") ?? "").trim();
  const capacity = capacityRaw ? Number(capacityRaw.replace(",", ".")) : null;
  const usageTypeRaw = String(formData.get("usageType") ?? "").trim();
  const usageTypes = ["STORAGE", "RECEIVING", "SHIPPING", "STAGING", "WIP"] as const;
  const isActive = formData.get("isActive") === "on";

  if (!warehouseId || !code || !name) {
    redirect(`/warehouse/${warehouseId}/locations/new?error=${encodeURIComponent("Código, nombre y almacén son obligatorios")}`);
  }

  if (capacityRaw && (capacity === null || !Number.isFinite(capacity) || capacity < 0)) {
    redirect(`/warehouse/${warehouseId}/locations/new?error=${encodeURIComponent("Capacidad inválida")}`);
  }
  if (!(usageTypes as readonly string[]).includes(usageTypeRaw)) {
    redirect(`/warehouse/${warehouseId}/locations/new?error=${encodeURIComponent("Selecciona un uso operativo válido")}`);
  }
  if (!/^[A-Z0-9-]{1,80}$/.test(code) || name.length > 160) {
    redirect(`/warehouse/${warehouseId}/locations/new?error=${encodeURIComponent("Código o nombre inválido")}`);
  }

  const warehouse = await prisma.warehouse.findUnique({
    where: { id: warehouseId },
    select: { id: true, isActive: true },
  });

  if (!warehouse?.isActive) {
    redirect(`/warehouse/${warehouseId}/locations/new?error=${encodeURIComponent("Solo puedes crear ubicaciones en un almacén activo")}`);
  }

  const existing = await prisma.location.findUnique({
    where: { code },
    select: { id: true },
  });

  if (existing) {
    redirect(`/warehouse/${warehouseId}/locations/new?error=${encodeURIComponent(`La ubicación ${code} ya existe`)}`);
  }

  await prisma.$transaction(async (tx) => {
    const currentWarehouse = await tx.warehouse.findUnique({ where: { id: warehouse.id }, select: { id: true, isActive: true } });
    if (!currentWarehouse?.isActive) throw new Error("El almacén ya no está activo");
    const duplicate = await tx.location.findUnique({ where: { code }, select: { id: true } });
    if (duplicate) throw new Error(`La ubicación ${code} ya existe`);
    const location = await tx.location.create({
      data: {
        warehouseId: currentWarehouse.id,
        code,
        name,
        zone,
        aisle,
        rack,
        level,
        capacity,
        isActive,
        usageType: usageTypeRaw as LocationUsageType,
      },
      select: { id: true },
    });
    await createAuditLogRequiredWithDb({
      entityType: "LOCATION",
      entityId: location.id,
      action: "CREATE",
      source: "warehouse/location-create",
      before: null,
      after: { id: location.id, warehouseId: currentWarehouse.id, code, name, usageType: usageTypeRaw, zone, aisle, rack, level, capacity, isActive },
      actor: actor.actorName,
      actorUserId: actor.actorUserId,
    }, tx);
  });

  redirect(`/warehouse/${warehouseId}`);
}

export default async function NewLocationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await pageGuard("location.manage");
  const { id } = await params;
  const sp = await searchParams;

  const warehouse = await prisma.warehouse.findUnique({
    where: { id },
    select: { id: true, name: true, code: true, isActive: true },
  });

  if (!warehouse) {
    redirect(`/warehouse?error=${encodeURIComponent("Almacén no encontrado")}`);
  }
  if (!warehouse.isActive) {
    redirect(`/warehouse/${warehouse.id}?error=${encodeURIComponent("Activa el almacén antes de crear ubicaciones")}`);
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Nueva Ubicación</h1>
          <p className="text-slate-400 mt-1">
            Almacén: {warehouse.name} ({warehouse.code})
          </p>
        </div>
        <Link href={`/warehouse/${warehouse.id}`} className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">
          ← Volver
        </Link>
      </div>

      {sp.error && (
        <div className="glass-card border border-red-500/30 text-red-200">{sp.error}</div>
      )}

      <form action={createLocation} className="glass-card space-y-6">
        <input type="hidden" name="warehouseId" value={warehouse.id} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="space-y-1">
            <span className="text-sm text-slate-400">
              Código * <span className="text-xs text-slate-500">(ej: A-12-04)</span>
            </span>
            <input
              name="code"
              required
              className="w-full px-4 py-3 glass rounded-lg uppercase"
              placeholder="A-12-04"
              pattern="[A-Za-z0-9-]+"
              title="Solo letras, números y guiones"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm text-slate-400">Nombre *</span>
            <input
              name="name"
              required
              className="w-full px-4 py-3 glass rounded-lg"
              placeholder="Rack A - Nivel 4"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm text-slate-400">Uso operativo *</span>
            <select name="usageType" required defaultValue="STORAGE" className="w-full px-4 py-3 glass rounded-lg">
              <option value="STORAGE">Almacenamiento</option>
              <option value="RECEIVING">Recepción de compras</option>
              <option value="SHIPPING">Embarque</option>
              <option value="STAGING">Consolidación / staging</option>
              <option value="WIP">Trabajo en proceso (WIP)</option>
            </select>
            <span className="text-xs text-slate-500">El uso determina en qué operaciones aparece esta ubicación.</span>
          </label>

          <label className="space-y-1">
            <span className="text-sm text-slate-400">Zona</span>
            <input name="zone" className="w-full px-4 py-3 glass rounded-lg" placeholder="A" />
          </label>

          <label className="space-y-1">
            <span className="text-sm text-slate-400">Pasillo</span>
            <input name="aisle" className="w-full px-4 py-3 glass rounded-lg" placeholder="12" />
          </label>

          <label className="space-y-1">
            <span className="text-sm text-slate-400">Rack</span>
            <input name="rack" className="w-full px-4 py-3 glass rounded-lg" placeholder="04" />
          </label>

          <label className="space-y-1">
            <span className="text-sm text-slate-400">Nivel</span>
            <input name="level" className="w-full px-4 py-3 glass rounded-lg" placeholder="01" />
          </label>

          <label className="space-y-1">
            <span className="text-sm text-slate-400">Capacidad</span>
            <input
              name="capacity"
              inputMode="decimal"
              className="w-full px-4 py-3 glass rounded-lg"
              placeholder="100"
            />
          </label>

          <label className="flex items-center gap-3 md:col-span-2">
            <input type="checkbox" name="isActive" defaultChecked className="w-5 h-5" />
            <span className="text-sm text-slate-300">Ubicación activa</span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-3">
          <Link href={`/warehouse/${warehouse.id}`} className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">
            Cancelar
          </Link>
          <button type="submit" className="btn-primary">
            Crear Ubicación
          </button>
        </div>
      </form>
    </div>
  );
}
