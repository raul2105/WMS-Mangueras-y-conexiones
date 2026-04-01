import Link from "next/link";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function LabelsByDocumentPage({
  params,
}: {
  params: Promise<{ documentType: string; documentId: string }>;
}) {
  const { documentType, documentId } = await params;
  const traces = await prisma.traceRecord.findMany({
    where: { sourceDocumentType: documentType, sourceDocumentId: documentId },
    orderBy: { createdAt: "desc" },
    include: {
      product: { select: { sku: true, name: true } },
      labelPrintJobs: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Etiquetas por documento</h1>
          <p className="text-slate-400">{documentType}:{documentId}</p>
        </div>
        <Link href="/inventory" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">
          Inventario
        </Link>
      </div>

      <div className="glass-card space-y-3">
        {traces.map((trace) => {
          const latestJob = trace.labelPrintJobs[0];
          return (
            <div key={trace.id} className="border border-white/10 rounded-lg p-3 flex items-center justify-between text-sm">
              <div>
                <p className="font-mono text-cyan-300">{trace.traceId}</p>
                <p>{trace.product?.sku ?? "--"} · {trace.product?.name ?? "--"}</p>
                <p className="text-slate-400">Cantidad: {trace.quantity ?? "--"} {trace.unitLabel ?? ""}</p>
              </div>
              {latestJob ? (
                <Link href={`/labels/jobs/${latestJob.id}`} className="btn-primary">Abrir etiqueta</Link>
              ) : (
                <span className="text-slate-500">Sin print job</span>
              )}
            </div>
          );
        })}
        {traces.length === 0 && (
          <p className="text-slate-500 text-sm">No hay etiquetas vinculadas a este documento.</p>
        )}
      </div>
    </div>
  );
}

