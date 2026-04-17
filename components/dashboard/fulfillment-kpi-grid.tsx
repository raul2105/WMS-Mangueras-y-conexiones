import Link from "next/link";
import { StatCard } from "@/components/ui/stat-card";
import { BoxIcon, DashboardIcon, InventoryIcon, WarehouseIcon } from "@/components/ui/icons";
import type { FulfillmentKpiSet } from "@/lib/dashboard/fulfillment-dashboard";

type Props = {
  kpis: FulfillmentKpiSet;
};

export function FulfillmentKpiGrid({ kpis }: Props) {
  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <Link href="/production/requests" prefetch={false}>
        <StatCard label="Pedidos por surtir" value={kpis.ordersToFulfill.toLocaleString("es-MX")} icon={<BoxIcon className="h-5 w-5" />} />
      </Link>
      <Link href="/production/requests?queue=overdue" prefetch={false}>
        <StatCard label="Vencidos" value={kpis.overdue.toLocaleString("es-MX")} tone="danger" icon={<DashboardIcon className="h-5 w-5" />} />
      </Link>
      <Link href="/production/requests?queue=today" prefetch={false}>
        <StatCard label="Vencen hoy" value={kpis.dueToday.toLocaleString("es-MX")} tone="warning" icon={<DashboardIcon className="h-5 w-5" />} />
      </Link>
      <Link href="/production?ops=direct_active" prefetch={false}>
        <StatCard label="Surtidos activos" value={kpis.activeDirectPicks.toLocaleString("es-MX")} tone="accent" icon={<InventoryIcon className="h-5 w-5" />} />
      </Link>
      <Link href="/production?ops=assembly_open" prefetch={false}>
        <StatCard label="Ensambles abiertos" value={kpis.openLinkedAssembly.toLocaleString("es-MX")} tone="warning" icon={<WarehouseIcon className="h-5 w-5" />} />
      </Link>
      <Link href="/purchasing/orders" prefetch={false}>
        <StatCard label="OCs en tránsito" value={kpis.relevantInboundPurchaseOrders.toLocaleString("es-MX")} tone="info" icon={<DashboardIcon className="h-5 w-5" />} />
      </Link>
    </section>
  );
}
