import Link from "next/link";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { pageGuard } from "@/components/rbac/PageGuard";
import { PageHeader } from "@/components/ui/page-header";
import { buttonStyles } from "@/components/ui/button";

export const dynamic = "force-dynamic";

type SearchParams = {
  blocked?: string;
  status?: string;
};

function isTruthy(value: string | undefined) {
  return value === "1" || value === "true" || value === "yes";
}

export default async function ProductionFulfillmentIndexPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await pageGuard("production.execute");
  const sp = await searchParams;

  if (isTruthy(sp.blocked)) {
    redirect("/production/requests?queue=assembly_blocked");
  }

  if (sp.status?.trim().toLowerCase() === "active") {
    redirect("/production?ops=assembly_open");
  }

  const [blockedCount, activeAssemblyCount, activePickCount] = await Promise.all([
    prisma.salesInternalOrder.count({
      where: {
        status: "CONFIRMADA",
        deliveredToCustomerAt: null,
        lines: { some: { lineKind: "CONFIGURED_ASSEMBLY" } },
      },
    }),
    prisma.productionOrder.count({
      where: { status: { in: ["BORRADOR", "ABIERTA", "EN_PROCESO"] } },
    }),
    prisma.salesInternalOrder.count({
      where: {
        status: { not: "CANCELADA" },
        pickLists: {
          some: {
            status: { in: ["DRAFT", "RELEASED", "IN_PROGRESS", "PARTIAL"] },
          },
        },
      },
    }),
  ]);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="Fulfillment"
        description="Compatibilidad de rutas heredadas para surtido directo y ensambles abiertos."
        actions={
          <>
            <Link href="/production/requests" className={buttonStyles({ variant: "secondary" })}>
              Ver pedidos
            </Link>
            <Link href="/production" className={buttonStyles({ variant: "secondary" })}>
              Ver ensambles
            </Link>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Link href="/production/requests?queue=assembly_blocked" className="glass-card block space-y-2 hover:bg-white/5">
          <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Bloqueos activos</p>
          <p className="text-3xl font-bold text-white">{blockedCount.toLocaleString("es-MX")}</p>
          <p className="text-sm text-slate-300">
            Abre la cola operativa con pedidos bloqueados por ensamble pendiente.
          </p>
        </Link>

        <Link href="/production?ops=assembly_open" className="glass-card block space-y-2 hover:bg-white/5">
          <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Ensambles activos</p>
          <p className="text-3xl font-bold text-white">{activeAssemblyCount.toLocaleString("es-MX")}</p>
          <p className="text-sm text-slate-300">
            Revisa órdenes de ensamble abiertas o en proceso desde el flujo canónico.
          </p>
        </Link>

        <Link href="/production/requests" className="glass-card block space-y-2 hover:bg-white/5">
          <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Surtidos directos activos</p>
          <p className="text-3xl font-bold text-white">{activePickCount.toLocaleString("es-MX")}</p>
          <p className="text-sm text-slate-300">
            Continúa el surtido directo desde el cockpit de pedidos compartido.
          </p>
        </Link>
      </div>

      <div className="glass-card space-y-3">
        <h2 className="text-lg font-semibold text-white">Rutas heredadas soportadas</h2>
        <p className="text-sm text-slate-400">
          Esta vista mantiene activos los enlaces históricos usados por dashboards o marcadores antiguos.
        </p>
        <ul className="space-y-2 text-sm text-slate-300">
          <li>
            <code>/production/fulfillment?blocked=true</code> redirige a la cola canónica de bloqueos:
            {" "}
            <code>/production/requests?queue=assembly_blocked</code>
          </li>
          <li>
            <code>/production/fulfillment?status=active</code> redirige a la vista canónica de ensambles abiertos:
            {" "}
            <code>/production?ops=assembly_open</code>
          </li>
        </ul>
      </div>
    </div>
  );
}
