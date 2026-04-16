import Link from "next/link";
import { redirect } from "next/navigation";
import { pageGuard } from "@/components/rbac/PageGuard";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

type ActionState = { ok?: string; error?: string };

async function importCsv(formData: FormData) {
  "use server";

  const file = formData.get("file");
  const dryRun = formData.get("dryRun") === "on";

  if (!file || !(file instanceof File) || file.size === 0) {
    redirect(`/catalog/import?error=${encodeURIComponent("Selecciona un archivo CSV")}`);
  }

  const maxBytes = 25 * 1024 * 1024;
  if (file.size > maxBytes) {
    redirect(`/catalog/import?error=${encodeURIComponent("El archivo excede 25 MB")}`);
  }

  const ext = path.extname(file.name || "").toLowerCase();
  if (ext !== ".csv" && file.type !== "text/csv") {
    redirect(`/catalog/import?error=${encodeURIComponent("El archivo debe ser CSV")}`);
  }

  const { importProductsFromCsv } = (await import("../../../../scripts/data/import-products-from-csv.cjs")) as {
    importProductsFromCsv: (input: {
      filePath: string;
      dryRun: boolean;
      prismaClient: typeof prisma;
    }) => Promise<{ rows?: number; skus?: number } | null>;
  };

  const tmpDir = path.join(os.tmpdir(), "wms-imports");
  await fs.mkdir(tmpDir, { recursive: true });
  const safeName = (file.name || "import").replace(/[^A-Za-z0-9._-]/g, "_");
  const filePath = path.join(tmpDir, `${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeName}`);
  const bytes = Buffer.from(await file.arrayBuffer());

  await fs.writeFile(filePath, bytes);

  let stats: { rows?: number; skus?: number } | null = null;
  try {
    const result = await importProductsFromCsv({ filePath, dryRun, prismaClient: prisma });
    stats = result ?? null;
    await prisma.importLog.create({
      data: {
        fileName: file.name || "import.csv",
        fileSize: file.size,
        rows: stats?.rows ?? null,
        skus: stats?.skus ?? null,
        dryRun,
        status: dryRun ? "VALIDATED" : "IMPORTED",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo importar el CSV";
    await prisma.importLog.create({
      data: {
        fileName: file.name || "import.csv",
        fileSize: file.size,
        rows: stats?.rows ?? null,
        skus: stats?.skus ?? null,
        dryRun,
        status: "FAILED",
        error: message,
      },
    });
    redirect(`/catalog/import?error=${encodeURIComponent(message)}`);
  } finally {
    try {
      await fs.unlink(filePath);
    } catch {
      // ignore cleanup errors
    }
  }

  redirect(`/catalog/import?ok=1${dryRun ? "&dry=1" : ""}`);
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  IMPORTED: { label: "Importado", color: "text-emerald-400" },
  VALIDATED: { label: "Validado (dry-run)", color: "text-blue-400" },
  FAILED: { label: "Error", color: "text-red-400" },
};

export default async function CatalogImportPage({
  searchParams,
}: {
  searchParams: Promise<ActionState & { dry?: string }>;
}) {
  await pageGuard("catalog.edit");
  const sp = await searchParams;

  const recentImports = await prisma.importLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Importar CSV</h1>
          <p className="text-slate-400 mt-1">Carga masiva de artículos y stock inicial.</p>
        </div>
        <Link href="/catalog" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">
          ← Catálogo
        </Link>
      </div>

      {sp.error && <div className="glass-card border border-red-500/30 text-red-200">{sp.error}</div>}
      {sp.ok && (
        <div className="glass-card border border-green-500/30 text-green-200">
          {sp.dry ? "Validación completada (sin guardar)." : "Importación completada."}
        </div>
      )}

      <form action={importCsv} className="glass-card space-y-6">
        <label className="space-y-1">
          <span className="text-sm text-slate-400">Archivo CSV *</span>
          <input
            name="file"
            type="file"
            accept=".csv,text/csv"
            required
            className="w-full px-4 py-3 glass rounded-lg"
          />
          <p className="text-xs text-slate-500">Formato según `docs/reference/import-products-csv.md`. Máx. 25 MB.</p>
        </label>

        <label className="flex items-center gap-3">
          <input type="checkbox" name="dryRun" className="w-5 h-5" />
          <span className="text-sm text-slate-300">Solo validar (dry-run)</span>
        </label>

        <div className="flex items-center justify-end gap-3">
          <Link href="/catalog/import/sample" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">
            Descargar plantilla
          </Link>
          <Link href="/catalog" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">
            Cancelar
          </Link>
          <button type="submit" className="btn-primary">Importar</button>
        </div>
      </form>

      {recentImports.length > 0 && (
        <div className="glass-card">
          <h2 className="text-lg font-bold mb-4 border-b border-white/10 pb-2">Historial de importaciones</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 border-b border-white/10">
                  <th className="text-left py-2">Fecha</th>
                  <th className="text-left py-2">Archivo</th>
                  <th className="text-right py-2">Filas</th>
                  <th className="text-right py-2">SKUs</th>
                  <th className="text-left py-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {recentImports.map((log) => {
                  const s = STATUS_LABELS[log.status] ?? { label: log.status, color: "text-slate-400" };
                  return (
                    <tr key={log.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-2 text-slate-400 whitespace-nowrap">
                        {log.createdAt.toLocaleString("es-MX")}
                      </td>
                      <td className="py-2 text-slate-300 truncate max-w-[180px]">{log.fileName}</td>
                      <td className="py-2 text-right text-slate-300">{log.rows ?? "--"}</td>
                      <td className="py-2 text-right text-slate-300">{log.skus ?? "--"}</td>
                      <td className="py-2">
                        <span className={`text-xs font-bold ${s.color}`}>{s.label}</span>
                        {log.error && (
                          <p className="text-xs text-red-400 mt-0.5 truncate max-w-[200px]" title={log.error}>
                            {log.error}
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
