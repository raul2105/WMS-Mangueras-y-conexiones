import Link from "next/link";
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function TraceDetailPage({
  params,
}: {
  params: Promise<{ traceId: string }>;
}) {
  const { traceId } = await params;
  const trace = await prisma.traceRecord.findUnique({
    where: { traceId },
    include: {
      product: { select: { sku: true, name: true } },
      warehouse: { select: { code: true, name: true } },
      location: { select: { code: true, name: true } },
      originMovement: true,
      labelPrintJobs: {
        orderBy: { createdAt: "desc" },
        take: 25,
        include: { labelTemplate: { select: { name: true, code: true } } },
      },
    },
  });
  if (!trace) notFound();

  const movements = await prisma.inventoryMovement.findMany({
    where: { traceId: trace.traceId },
    orderBy: { createdAt: "asc" },
    include: {
      location: { select: { code: true } },
      product: { select: { sku: true, name: true } },
    },
  });

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Trace {trace.traceId}</h1>
          <p className="text-slate-400">{trace.labelType} · {trace.sourceEntityType}</p>
        </div>
        <Link href="/trace" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">
          Buscar otro
        </Link>
      </div>

      <div className="glass-card grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <div><span className="text-slate-400">Producto:</span> {trace.product?.sku ?? "--"} {trace.product?.name ?? ""}</div>
        <div><span className="text-slate-400">Cantidad:</span> {trace.quantity ?? "--"} {trace.unitLabel ?? ""}</div>
        <div><span className="text-slate-400">Almacen:</span> {trace.warehouse?.code ?? "--"}</div>
        <div><span className="text-slate-400">Ubicación:</span> {trace.location?.code ?? "--"}</div>
        <div><span className="text-slate-400">Operador:</span> {trace.operatorName ?? "--"}</div>
        <div><span className="text-slate-400">Referencia:</span> {trace.reference ?? "--"}</div>
        <div><span className="text-slate-400">Documento:</span> {trace.sourceDocumentType ?? "--"} {trace.sourceDocumentId ?? ""}</div>
        <div><span className="text-slate-400">Creado:</span> {new Date(trace.createdAt).toLocaleString("es-MX")}</div>
      </div>

      <div className="glass-card">
        <h2 className="text-lg font-bold mb-3">Historial operativo</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-400 border-b border-white/10">
              <th className="text-left py-2">Fecha</th>
              <th className="text-left py-2">Tipo</th>
              <th className="text-left py-2">Ubicación</th>
              <th className="text-right py-2">Cantidad</th>
              <th className="text-left py-2">Documento</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((movement) => (
              <tr key={movement.id} className="border-b border-white/5">
                <td className="py-2">{new Date(movement.createdAt).toLocaleString("es-MX")}</td>
                <td className="py-2">{movement.type}</td>
                <td className="py-2">{movement.location?.code ?? movement.fromLocationCode ?? "--"}</td>
                <td className="py-2 text-right">{movement.quantity}</td>
                <td className="py-2">{movement.documentType ?? "--"} {movement.documentId ?? ""}</td>
              </tr>
            ))}
            {movements.length === 0 && (
              <tr><td colSpan={5} className="py-4 text-slate-500 text-center">Sin movimientos vinculados.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="glass-card">
        <h2 className="text-lg font-bold mb-3">Impresiones</h2>
        <div className="space-y-2">
          {trace.labelPrintJobs.map((job) => (
            <div key={job.id} className="flex items-center justify-between text-sm border border-white/10 rounded-lg px-3 py-2">
              <span>{job.labelTemplate.name} · {new Date(job.createdAt).toLocaleString("es-MX")} · {job.status}</span>
              <Link href={`/labels/jobs/${job.id}`} className="text-cyan-300 hover:underline">Abrir</Link>
            </div>
          ))}
          {trace.labelPrintJobs.length === 0 && <p className="text-slate-500 text-sm">Sin impresiones.</p>}
        </div>
      </div>
    </div>
  );
}

