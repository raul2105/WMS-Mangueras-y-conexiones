import Link from "next/link";
import prisma from "@/lib/prisma";
import { pageGuard } from "@/components/rbac/PageGuard";
import { getSessionContext } from "@/lib/auth/session-context";
import { PageHeader } from "@/components/ui/page-header";
import { buttonStyles } from "@/components/ui/button";
import { ensureDefaultLabelTemplates } from "@/lib/labeling-service";

export const dynamic = "force-dynamic";

export default async function LabelsPage() {
  await pageGuard("labels.manage");
  const sessionCtx = await getSessionContext();
  const isOperatorView = sessionCtx.roles.includes("WAREHOUSE_OPERATOR") && !sessionCtx.roles.includes("MANAGER") && !sessionCtx.isSystemAdmin;
  await ensureDefaultLabelTemplates(prisma);

  const [recentJobs, templateCount] = await Promise.all([
    prisma.labelPrintJob.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true,
        status: true,
        requestedBy: true,
        createdAt: true,
        traceRecord: {
          select: {
            traceId: true,
            labelType: true,
            sourceDocumentType: true,
            sourceDocumentId: true,
            operatorName: true,
            product: { select: { sku: true, name: true } },
            location: { select: { code: true } },
          },
        },
      },
    }),
    prisma.labelTemplate.count({ where: { isActive: true } }),
  ]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageHeader
        title={isOperatorView ? "Etiquetas de trabajo" : "Etiquetas"}
        description={isOperatorView ? "Abre o reimprime etiquetas de material, recepción y surtido." : "Centro de acceso a trabajos de impresión, documentos etiquetados y trazabilidad asociada."}
        actions={
          <>
            <Link href="/inventory" className={buttonStyles({ variant: "secondary" })}>
              Inventario
            </Link>
            {!isOperatorView ? <Link href="/trace" className={buttonStyles({ variant: "secondary" })}>
              Trace
            </Link> : null}
          </>
        }
      />

      <div className={`grid gap-4 ${isOperatorView ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
        {!isOperatorView ? <div className="glass-card space-y-2">
          <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Plantillas activas</p>
          <p className="text-3xl font-bold text-white">{templateCount.toLocaleString("es-MX")}</p>
          <p className="text-sm text-slate-300">
            Plantillas disponibles para movimientos, ubicaciones y documentos.
          </p>
        </div> : null}
        <div className="glass-card space-y-2">
          <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Trabajos recientes</p>
          <p className="text-3xl font-bold text-white">{recentJobs.length.toLocaleString("es-MX")}</p>
          <p className="text-sm text-slate-300">
            Últimos trabajos de impresión listos para reimpresión o validación.
          </p>
        </div>
        <div className="glass-card space-y-2">
          <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Accesos rápidos</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/inventory/receive" className={buttonStyles({ variant: "secondary", size: "sm" })}>
              Recepciones
            </Link>
            <Link href="/inventory/pick" className={buttonStyles({ variant: "secondary", size: "sm" })}>
              Picking
            </Link>
            <Link href="/inventory/transfer" className={buttonStyles({ variant: "secondary", size: "sm" })}>
              Mover material
            </Link>
          </div>
        </div>
      </div>

      <section className="glass-card space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Trabajos recientes</h2>
          <p className="text-sm text-slate-400">{isOperatorView ? "Abre la etiqueta que necesitas imprimir o volver a imprimir." : "Revisa el último render, su operador y el documento de origen cuando exista."}</p>
        </div>

        {recentJobs.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-8 text-center text-sm text-slate-400">
            Aún no hay trabajos de impresión registrados.
          </div>
        ) : isOperatorView ? (
          <div className="grid gap-3 md:grid-cols-2">
            {recentJobs.map((job) => (
              <article key={job.id} className="rounded-lg border border-white/10 bg-white/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{job.traceRecord.labelType}</p>
                <p className="mt-1 font-medium text-white">{job.traceRecord.product?.sku ?? "Material"} · {job.traceRecord.product?.name ?? "Sin producto"}</p>
                <p className="mt-1 text-sm text-slate-300">Ubicación: {job.traceRecord.location?.code ?? "Sin ubicación"}</p>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-400">{job.status}</span>
                  <Link href={`/labels/jobs/${job.id}`} className={buttonStyles({ size: "sm" })}>Abrir etiqueta</Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-slate-400">
                  <th className="py-3 text-left">Trace</th>
                  <th className="py-3 text-left">Tipo</th>
                  <th className="py-3 text-left">Documento</th>
                  <th className="py-3 text-left">Operador</th>
                  <th className="py-3 text-left">Estado</th>
                  <th className="py-3 text-left">Creado</th>
                  <th className="py-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {recentJobs.map((job) => {
                  const documentLabel = job.traceRecord.sourceDocumentType && job.traceRecord.sourceDocumentId
                    ? `${job.traceRecord.sourceDocumentType}:${job.traceRecord.sourceDocumentId}`
                    : "--";

                  return (
                    <tr key={job.id} className="border-b border-white/5 text-slate-300 hover:bg-white/5">
                      <td className="py-3 font-mono text-cyan-300">{job.traceRecord.traceId}</td>
                      <td className="py-3">{job.traceRecord.labelType}</td>
                      <td className="py-3">{documentLabel}</td>
                      <td className="py-3">{job.requestedBy ?? job.traceRecord.operatorName ?? "--"}</td>
                      <td className="py-3">{job.status}</td>
                      <td className="py-3">{job.createdAt.toLocaleString("es-MX")}</td>
                      <td className="py-3 text-right">
                        <Link href={`/labels/jobs/${job.id}`} className="text-cyan-300 hover:text-white">
                          Abrir
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
