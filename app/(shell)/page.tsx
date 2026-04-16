import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import prisma from "@/lib/prisma";
import { getSessionContext } from "@/lib/auth/session-context";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatCard } from "@/components/ui/stat-card";
import { ArrowDownIcon, ArrowUpIcon, BoxIcon, DashboardIcon, InventoryIcon, SwapIcon, WarehouseIcon } from "@/components/ui/icons";
import { ROLE_HOME } from "@/lib/rbac/route-access-map";
import type { RoleCode } from "@/lib/rbac/permissions";
import { startPerf } from "@/lib/perf";
import { getRequestId } from "@/lib/request-meta";

export const dynamic = "force-dynamic";

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  IN: "Entrada",
  OUT: "Salida",
  TRANSFER: "Traslado",
  ADJUSTMENT: "Ajuste",
};

const MOVEMENT_TYPE_COLORS: Record<string, string> = {
  IN: "success",
  OUT: "danger",
  TRANSFER: "accent",
  ADJUSTMENT: "warning",
};

const loadDashboardSnapshot = unstable_cache(
  async (todayIso: string) => {
    const today = new Date(todayIso);
    return Promise.all([
      prisma.product.count(),
      prisma.productionOrder.count({ where: { status: { in: ["ABIERTA", "EN_PROCESO"] } } }),
      prisma.inventoryMovement.count({ where: { createdAt: { gte: today } } }),
      prisma.inventoryMovement.findMany({
        take: 8,
        orderBy: { createdAt: "desc" },
        include: { product: { select: { sku: true, name: true } } },
      }),
      prisma.inventory.aggregate({ _sum: { quantity: true, available: true } }),
      prisma.purchaseOrder.count({ where: { status: { in: ["CONFIRMADA", "EN_TRANSITO", "PARCIAL"] } } }),
    ]);
  },
  ["dashboard-snapshot-v1"],
  { revalidate: 30, tags: ["dashboard:summary"] },
);

export default async function Home() {
  const perf = startPerf("page.dashboard");
  const requestId = await getRequestId();
  const sessionCtx = await getSessionContext();
  const roles = sessionCtx.roles;
  const primaryRole = (roles[0] as RoleCode) ?? "MANAGER";
  const home = ROLE_HOME[primaryRole] ?? "/";

  if (home !== "/") {
    perf.end({ requestId, redirected: true, home });
    redirect(home);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [totalProducts, openOrders, todayMovements, recentMovements, inventoryTotals, openPurchaseOrders] =
    await loadDashboardSnapshot(today.toISOString());

  const totalStock = inventoryTotals._sum.quantity ?? 0;
  const totalAvailable = inventoryTotals._sum.available ?? 0;
  perf.end({
    requestId,
    redirected: false,
    totalProducts,
    openOrders,
    todayMovements,
    openPurchaseOrders,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard Operativo"
        description="Vista ejecutiva de inventario, ensamble y abastecimiento."
        actions={
          <>
            <Link href="/inventory/kardex" prefetch={false} className={buttonStyles({ variant: "secondary" })}>
              Ver kardex
            </Link>
            <Link href="/purchasing/orders/new" prefetch={false} className={buttonStyles()}>
              Nueva OC
            </Link>
          </>
        }
      />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Productos" value={totalProducts.toLocaleString("es-MX")} icon={<BoxIcon className="h-5 w-5" />} />
        <StatCard label="Stock total" value={totalStock.toLocaleString("es-MX")} tone="success" icon={<InventoryIcon className="h-5 w-5" />} />
        <StatCard label="Disponible" value={totalAvailable.toLocaleString("es-MX")} tone="info" icon={<DashboardIcon className="h-5 w-5" />} />
        <StatCard label="Ensamble abierto" value={openOrders.toLocaleString("es-MX")} tone="warning" icon={<WarehouseIcon className="h-5 w-5" />} />
        <StatCard label="OCs en transito" value={openPurchaseOrders.toLocaleString("es-MX")} tone="info" icon={<DashboardIcon className="h-5 w-5" />} />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Actividad reciente</CardTitle>
              <CardDescription>Movimientos del dia: {todayMovements.toLocaleString("es-MX")}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentMovements.length === 0 ? (
              <EmptyState
                compact
                title="Sin movimientos registrados"
                description="Todavia no hay eventos de inventario para mostrar en esta fecha."
              />
            ) : (
              recentMovements.map((mv) => (
                <div key={mv.id} className="surface grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 rounded-lg px-3 py-2">
                  <Badge variant={MOVEMENT_TYPE_COLORS[mv.type] as "success" | "danger" | "accent" | "warning"}>
                    {MOVEMENT_TYPE_LABELS[mv.type] ?? mv.type}
                  </Badge>
                  <div className="min-w-0">
                    <p className="truncate text-sm text-[var(--text-primary)]">{mv.product.name}</p>
                    <p className="truncate text-xs font-mono text-[var(--text-muted)]">{mv.product.sku}</p>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] whitespace-nowrap">
                    {mv.createdAt.toLocaleString("es-MX", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}
                  </p>
                  <p className="w-12 text-right text-sm font-semibold text-[var(--text-primary)]">
                    {mv.type === "OUT" ? "-" : mv.type === "ADJUSTMENT" && mv.quantity < 0 ? "" : "+"}
                    {mv.quantity}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <SectionCard title="Acciones rapidas">
          <div className="grid gap-2">
            <Link href="/inventory/receive" prefetch={false} className={buttonStyles({ variant: "secondary", className: "justify-start gap-2" })}>
              <ArrowDownIcon className="h-4 w-4" /> Recibir stock
            </Link>
            <Link href="/inventory/pick" prefetch={false} className={buttonStyles({ variant: "secondary", className: "justify-start gap-2" })}>
              <ArrowUpIcon className="h-4 w-4" /> Despachar
            </Link>
            <Link href="/inventory/transfer" prefetch={false} className={buttonStyles({ variant: "secondary", className: "justify-start gap-2" })}>
              <SwapIcon className="h-4 w-4" /> Transferir
            </Link>
            <Link href="/warehouse" prefetch={false} className={buttonStyles({ variant: "secondary", className: "justify-start gap-2" })}>
              <WarehouseIcon className="h-4 w-4" /> Almacenes
            </Link>
          </div>
        </SectionCard>
      </section>
    </div>
  );
}
