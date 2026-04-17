import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session-context";
import { ROLE_HOME } from "@/lib/rbac/route-access-map";
import type { RoleCode } from "@/lib/rbac/permissions";
import { startPerf } from "@/lib/perf";
import { getRequestId } from "@/lib/request-meta";
import { buttonStyles } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { FulfillmentKpiGrid } from "@/components/dashboard/fulfillment-kpi-grid";
import { FulfillmentPriorityQueue } from "@/components/dashboard/fulfillment-priority-queue";
import { FulfillmentAlertList } from "@/components/dashboard/fulfillment-alert-list";
import { FulfillmentAnalyticsPanels } from "@/components/dashboard/fulfillment-analytics-panels";
import { getFulfillmentDashboardSnapshot } from "@/lib/dashboard/fulfillment-dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const perf = startPerf("page.dashboard.fulfillment");
  const requestId = await getRequestId();
  const sessionCtx = await getSessionContext();
  const roles = sessionCtx.roles;
  const primaryRole = (roles[0] as RoleCode) ?? "MANAGER";
  const home = ROLE_HOME[primaryRole] ?? "/";

  if (home !== "/") {
    perf.end({ requestId, redirected: true, home });
    redirect(home);
  }

  const role = primaryRole === "SYSTEM_ADMIN" ? "SYSTEM_ADMIN" : "MANAGER";
  const snapshot = await getFulfillmentDashboardSnapshot({ role, staleHours: 4 });

  perf.end({
    requestId,
    redirected: false,
    role,
    ordersToFulfill: snapshot.kpis.ordersToFulfill,
    overdue: snapshot.kpis.overdue,
  });

  const generatedAt = new Date(snapshot.generatedAt).toLocaleString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short",
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={role === "SYSTEM_ADMIN" ? "Dashboard Fulfillment Ejecutivo" : "Dashboard Fulfillment Operativo"}
        description={
          role === "SYSTEM_ADMIN"
            ? "Visión global de riesgo, backlog y bloqueos de surtido/ensamble para toma de decisiones."
            : "Pedidos por atender priorizados para ejecución diaria de surtidos y ensambles ligados."
        }
        meta={`Actualizado ${generatedAt} · Umbral sin movimiento ${snapshot.staleHours}h`}
        actions={
          <>
            <Link href="/production/requests" prefetch={false} className={buttonStyles({ variant: "secondary" })}>
              Pedidos por surtir
            </Link>
            <Link href="/production" prefetch={false} className={buttonStyles()}>
              Operación ensamble/surtido
            </Link>
          </>
        }
      />

      <FulfillmentKpiGrid kpis={snapshot.kpis} />

      {role === "SYSTEM_ADMIN" ? (
        <>
          <FulfillmentAnalyticsPanels analytics={snapshot.analytics} />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.5fr_1fr]">
            <FulfillmentPriorityQueue rows={snapshot.queue} />
            <FulfillmentAlertList alerts={snapshot.alerts} />
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.65fr_1fr]">
            <FulfillmentPriorityQueue rows={snapshot.queue} />
            <FulfillmentAlertList alerts={snapshot.alerts} />
          </div>
          <FulfillmentAnalyticsPanels analytics={snapshot.analytics} />
        </>
      )}
    </div>
  );
}
