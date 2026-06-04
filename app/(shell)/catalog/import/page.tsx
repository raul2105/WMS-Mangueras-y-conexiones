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

      <section className="glass-card space-y-4 border border-white/10">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-white">Plantilla oficial única</h2>
            <p className="text-sm text-slate-400">
              Usa siempre el mismo CSV oficial para importar artículos de producto al catálogo.
            </p>
          </div>
          <Link href="/catalog/import/sample" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">
            Descargar plantilla oficial
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Campos requeridos</h3>
            <p className="text-sm text-slate-400">
              <code className="rounded bg-white/10 px-1.5 py-0.5 text-slate-200">sku</code>,{" "}
              <code className="rounded bg-white/10 px-1.5 py-0.5 text-slate-200">name</code> y{" "}
              <code className="rounded bg-white/10 px-1.5 py-0.5 text-slate-200">type</code>.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Campos opcionales</h3>
            <p className="text-sm text-slate-400">
              <code className="rounded bg-white/10 px-1.5 py-0.5 text-slate-200">description</code>,{" "}
              <code className="rounded bg-white/10 px-1.5 py-0.5 text-slate-200">brand</code>,{" "}
              <code className="rounded bg-white/10 px-1.5 py-0.5 text-slate-200">unitLabel</code>,{" "}
              <code className="rounded bg-white/10 px-1.5 py-0.5 text-slate-200">base_cost</code>,{" "}
              <code className="rounded bg-white/10 px-1.5 py-0.5 text-slate-200">price</code>,{" "}
              <code className="rounded bg-white/10 px-1.5 py-0.5 text-slate-200">category</code>,{" "}
              <code className="rounded bg-white/10 px-1.5 py-0.5 text-slate-200">subcategory</code>,{" "}
              <code className="rounded bg-white/10 px-1.5 py-0.5 text-slate-200">quantity</code>,{" "}
              <code className="rounded bg-white/10 px-1.5 py-0.5 text-slate-200">location</code>,{" "}
              <code className="rounded bg-white/10 px-1.5 py-0.5 text-slate-200">attributes</code>,{" "}
              <code className="rounded bg-white/10 px-1.5 py-0.5 text-slate-200">referenceCode</code>,{" "}
              <code className="rounded bg-white/10 px-1.5 py-0.5 text-slate-200">imageUrl</code>.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Reglas clave</h3>
            <ul className="space-y-1 text-sm text-slate-400">
              <li>
                Tipos permitidos: <code className="rounded bg-white/10 px-1.5 py-0.5 text-slate-200">HOSE</code>,{" "}
                <code className="rounded bg-white/10 px-1.5 py-0.5 text-slate-200">FITTING</code>,{" "}
                <code className="rounded bg-white/10 px-1.5 py-0.5 text-slate-200">ASSEMBLY</code>.
              </li>
              <li>
                Ejemplos de <code className="rounded bg-white/10 px-1.5 py-0.5 text-slate-200">unitLabel</code>:{" "}
                <code className="rounded bg-white/10 px-1.5 py-0.5 text-slate-200">metro</code>,{" "}
                <code className="rounded bg-white/10 px-1.5 py-0.5 text-slate-200">pieza</code>,{" "}
                <code className="rounded bg-white/10 px-1.5 py-0.5 text-slate-200">kit</code>.
              </li>
              <li>
                <code className="rounded bg-white/10 px-1.5 py-0.5 text-slate-200">base_cost</code>,{" "}
                <code className="rounded bg-white/10 px-1.5 py-0.5 text-slate-200">price</code> y{" "}
                <code className="rounded bg-white/10 px-1.5 py-0.5 text-slate-200">quantity</code> deben ser números
                no negativos, sin moneda, comas ni unidades.
              </li>
              <li>
                <code className="rounded bg-white/10 px-1.5 py-0.5 text-slate-200">location</code> es obligatoria
                cuando <code className="rounded bg-white/10 px-1.5 py-0.5 text-slate-200">quantity</code> es mayor que
                0 y la ubicación ya debe existir.
              </li>
            </ul>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Validación operativa</h3>
            <ul className="space-y-1 text-sm text-slate-400">
              <li>
                <code className="rounded bg-white/10 px-1.5 py-0.5 text-slate-200">attributes</code> debe ser un
                objeto JSON válido.
              </li>
              <li>
                <code className="rounded bg-white/10 px-1.5 py-0.5 text-slate-200">referenceCode</code> debe ser
                único o quedar alineado al mismo <code className="rounded bg-white/10 px-1.5 py-0.5 text-slate-200">sku</code>.
              </li>
              <li>
                <code className="rounded bg-white/10 px-1.5 py-0.5 text-slate-200">quantity = 0</code> puede dejar{" "}
                <code className="rounded bg-white/10 px-1.5 py-0.5 text-slate-200">location</code> vacío si el
                importador se mantiene en el camino estricto actual.
              </li>
              <li>Ejecuta primero la validación o dry-run antes de importar cambios reales.</li>
            </ul>
          </div>
        </div>
      </section>

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
          <p className="text-xs text-slate-500">
            Usa la plantilla oficial única <code className="text-slate-300">data/products.sample.csv</code>. Máx.
            25 MB.
          </p>
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
