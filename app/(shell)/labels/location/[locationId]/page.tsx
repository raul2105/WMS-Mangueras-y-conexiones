import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { createLocationTraceAndLabelJob, ensureDefaultLabelTemplates } from "@/lib/labeling-service";

export const dynamic = "force-dynamic";

async function createLocationLabel(formData: FormData) {
  "use server";
  const locationId = String(formData.get("locationId") ?? "").trim();
  const operatorName = String(formData.get("operatorName") ?? "").trim();
  const reference = String(formData.get("reference") ?? "").trim() || null;
  const templateCode = String(formData.get("templateCode") ?? "").trim() || null;

  if (!locationId || !operatorName) {
    redirect(`/trace?error=Datos%20incompletos%20de%20etiqueta%20de%20ubicacion`);
  }

  const { job } = await createLocationTraceAndLabelJob(prisma, {
    locationId,
    operatorName,
    reference,
    templateCode,
  });
  redirect(`/labels/jobs/${job.id}?next=${encodeURIComponent(`/labels/location/${locationId}`)}`);
}

export default async function LocationLabelPage({
  params,
}: {
  params: Promise<{ locationId: string }>;
}) {
  const { locationId } = await params;
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    include: { warehouse: { select: { id: true, code: true, name: true } } },
  });
  if (!location) notFound();

  await ensureDefaultLabelTemplates(prisma);
  const templates = await prisma.labelTemplate.findMany({
    where: { labelType: "LOCATION", isActive: true },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    select: { code: true, name: true },
  });

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Etiqueta de ubicación</h1>
          <p className="text-slate-400">{location.warehouse.code} · {location.code}</p>
        </div>
        <Link href={`/warehouse/${location.warehouse.id}`} className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">
          Volver
        </Link>
      </div>

      <form action={createLocationLabel} className="glass-card space-y-4">
        <input type="hidden" name="locationId" value={location.id} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="space-y-1">
            <span className="text-sm text-slate-400">Plantilla</span>
            <select name="templateCode" className="w-full px-4 py-3 glass rounded-lg">
              {templates.map((template) => (
                <option key={template.code} value={template.code}>{template.name}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-sm text-slate-400">Operador *</span>
            <input
              name="operatorName"
              required
              className="w-full px-4 py-3 glass rounded-lg"
              placeholder="Nombre del operador"
            />
          </label>
          <label className="space-y-1 md:col-span-2">
            <span className="text-sm text-slate-400">Referencia</span>
            <input
              name="reference"
              className="w-full px-4 py-3 glass rounded-lg"
              placeholder="Ej. Reetiquetado de zona"
            />
          </label>
        </div>
        <button type="submit" className="btn-primary">Generar etiqueta</button>
      </form>
    </div>
  );
}
