import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { createReprintJob, ensureDefaultLabelTemplates, markLabelPrintJobStatus } from "@/lib/labeling-service";
import LabelPrintClientActions from "@/components/LabelPrintClientActions";

export const dynamic = "force-dynamic";

async function markPrinted(formData: FormData) {
  "use server";
  const jobId = String(formData.get("jobId") ?? "").trim();
  const next = String(formData.get("next") ?? "").trim();
  if (!jobId) return;
  await markLabelPrintJobStatus(prisma, jobId, "PRINTED");
  redirect(next || `/labels/jobs/${jobId}`);
}

async function reprintWithTemplate(formData: FormData) {
  "use server";
  const traceRecordId = String(formData.get("traceRecordId") ?? "").trim();
  const templateCode = String(formData.get("templateCode") ?? "").trim();
  const requestedBy = String(formData.get("requestedBy") ?? "").trim();
  const next = String(formData.get("next") ?? "").trim();
  if (!traceRecordId) return;
  const { job } = await createReprintJob(prisma, traceRecordId, templateCode || null, requestedBy || null);
  const query = next ? `?next=${encodeURIComponent(next)}` : "";
  redirect(`/labels/jobs/${job.id}${query}`);
}

export default async function LabelJobPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const job = await prisma.labelPrintJob.findUnique({
    where: { id },
    include: {
      traceRecord: true,
      labelTemplate: true,
    },
  });
  if (!job) notFound();

  await ensureDefaultLabelTemplates(prisma);
  const templates = await prisma.labelTemplate.findMany({
    where: { labelType: job.traceRecord.labelType, isActive: true },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    select: { code: true, name: true },
  });

  const next = sp.next?.trim() || "";
  const backHref = next || "/inventory";

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Etiqueta</h1>
          <p className="text-slate-400">Trace ID: {job.traceRecord.traceId}</p>
        </div>
        <Link href={backHref} className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">
          Volver
        </Link>
      </div>

      <div className="glass-card flex flex-wrap items-end gap-3">
        <LabelPrintClientActions />

        <a
          href={`/api/labels/jobs/${job.id}/html`}
          className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white"
        >
          Exportar HTML
        </a>

        <form action={markPrinted}>
          <input type="hidden" name="jobId" value={job.id} />
          <input type="hidden" name="next" value={`/labels/jobs/${job.id}${next ? `?next=${encodeURIComponent(next)}` : ""}`} />
          <button type="submit" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">
            Marcar impresa
          </button>
        </form>

        <form action={reprintWithTemplate} className="ml-auto flex items-end gap-2">
          <input type="hidden" name="traceRecordId" value={job.traceRecordId} />
          <input type="hidden" name="next" value={next} />
          <label className="space-y-1">
            <span className="text-xs text-slate-400">Plantilla</span>
            <select name="templateCode" defaultValue={job.labelTemplate.code} className="px-3 py-2 glass rounded-lg">
              {templates.map((template) => (
                <option key={template.code} value={template.code}>{template.name}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs text-slate-400">Operador</span>
            <input
              name="requestedBy"
              defaultValue={job.requestedBy ?? job.traceRecord.operatorName ?? ""}
              className="px-3 py-2 glass rounded-lg"
              placeholder="Nombre del operador"
            />
          </label>
          <button type="submit" className="btn-primary">Reimprimir</button>
        </form>
      </div>

      <div className="glass-card">
        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-300 mb-3">
          <span>Estado: <strong>{job.status}</strong></span>
          <span>Tipo: <strong>{job.traceRecord.labelType}</strong></span>
          <Link href={`/trace/${encodeURIComponent(job.traceRecord.traceId)}`} className="text-cyan-300 hover:underline">
            Ver Trace
          </Link>
        </div>
        <iframe
          title={`Etiqueta ${job.id}`}
          srcDoc={job.htmlSnapshot ?? "<p>Sin render HTML</p>"}
          className="w-full min-h-[720px] rounded-lg border border-white/10 bg-white"
        />
      </div>
    </div>
  );
}
