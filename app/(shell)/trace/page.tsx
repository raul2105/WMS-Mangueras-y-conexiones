import Link from "next/link";
import { redirect } from "next/navigation";
import { pageGuard } from "@/components/rbac/PageGuard";

export const dynamic = "force-dynamic";

async function resolveTrace(formData: FormData) {
  "use server";
  const traceId = String(formData.get("traceId") ?? "").trim();
  if (!traceId) {
    redirect("/trace?error=Trace%20ID%20obligatorio");
  }
  redirect(`/trace/${encodeURIComponent(traceId)}`);
}

export default async function TraceLookupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; traceId?: string }>;
}) {
  await pageGuard("audit.view");
  const sp = await searchParams;
  if (sp.traceId?.trim()) {
    redirect(`/trace/${encodeURIComponent(sp.traceId.trim())}`);
  }
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Buscar Trace ID</h1>
        <Link href="/inventory" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">
          Inventario
        </Link>
      </div>
      {sp.error && <div className="glass-card border border-red-500/30 text-red-200">{sp.error}</div>}
      <form action={resolveTrace} className="glass-card space-y-3">
        <label className="space-y-1 block">
          <span className="text-sm text-slate-400">Trace ID</span>
          <input
            name="traceId"
            required
            className="w-full px-4 py-3 glass rounded-lg font-mono"
            placeholder="TRC-REC-20260331-ABC123"
          />
        </label>
        <button type="submit" className="btn-primary">Resolver</button>
      </form>
    </div>
  );
}
