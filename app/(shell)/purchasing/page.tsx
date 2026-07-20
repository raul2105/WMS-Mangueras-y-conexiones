import Link from "next/link";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getSessionContext } from "@/lib/auth/session-context";
import { pageGuard } from "@/components/rbac/PageGuard";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { BoxIcon, InventoryIcon, PurchasingIcon, WarehouseIcon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TableRow, TableWrap, Td, Th } from "@/components/ui/table";

export const revalidate = 30;

const STATUS_LABELS: Record<string, string> = {
  BORRADOR: "Borrador",
  CONFIRMADA: "Confirmada",
  EN_TRANSITO: "En Tránsito",
  RECIBIDA: "Recibida",
  PARCIAL: "Parcial",
  CANCELADA: "Cancelada",
};

const STATUS_COLORS: Record<string, string> = {
  BORRADOR: "neutral",
  CONFIRMADA: "accent",
  EN_TRANSITO: "warning",
  RECIBIDA: "success",
  PARCIAL: "warning",
  CANCELADA: "danger",
};

export default async function PurchasingPage() {
  await pageGuard("purchasing.view");
  const sessionCtx = await getSessionContext();
  const isOperatorView =
    sessionCtx.roles.includes("WAREHOUSE_OPERATOR") &&
    !sessionCtx.roles.includes("MANAGER") &&
    !sessionCtx.isSystemAdmin;
  const canManagePurchasing =
    sessionCtx.isSystemAdmin || sessionCtx.permissions.includes("purchasing.manage");
  const recentOrdersWhere: Prisma.PurchaseOrderWhereInput = isOperatorView
    ? { status: { in: ["CONFIRMADA", "EN_TRANSITO", "PARCIAL"] } }
    : {};
  const [
    totalSuppliers,
    statusCounts,
    recentOrders,
  ] = await Promise.all([
    prisma.supplier.count({ where: { isActive: true } }),
    prisma.purchaseOrder.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.purchaseOrder.findMany({
      where: recentOrdersWhere,
      take: 8,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        folio: true,
        status: true,
        supplier: { select: { name: true } },
        _count: { select: { lines: true } },
      },
    }),
  ]);

  const countsByStatus = Object.fromEntries(statusCounts.map((s) => [s.status, s._count._all]));
  const openCount = (countsByStatus["CONFIRMADA"] ?? 0) + (countsByStatus["EN_TRANSITO"] ?? 0) + (countsByStatus["PARCIAL"] ?? 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title={isOperatorView ? "Recepciones" : "Compras y abastecimiento"}
        description={
          isOperatorView
            ? "Registra mercancía recibida y reporta diferencias físicas."
            : "Gestiona proveedores, órdenes de compra y compromisos de abastecimiento."
        }
        meta={`${openCount.toLocaleString("es-MX")} OCs activas`}
        actions={
          <>
            <Link href={isOperatorView ? "/purchasing/orders?preset=por_recibir" : "/purchasing/orders"} className={buttonStyles({ variant: "secondary" })}>
              {isOperatorView ? "Recepciones pendientes" : "Ver órdenes"}
            </Link>
            {canManagePurchasing ? (
              <Link href="/purchasing/orders/new" className={buttonStyles()}>
                Nueva OC
              </Link>
            ) : null}
          </>
        }
      />

      <div className={`grid grid-cols-2 gap-4 ${isOperatorView ? "md:grid-cols-2" : "md:grid-cols-4"}`}>
        <StatCard
          label={isOperatorView ? "Por recibir" : "OCs activas"}
          value={(isOperatorView
            ? (countsByStatus["CONFIRMADA"] ?? 0) + (countsByStatus["EN_TRANSITO"] ?? 0)
            : openCount).toLocaleString("es-MX")}
          tone="accent"
          icon={<PurchasingIcon className="h-5 w-5" />}
        />
        <StatCard
          label={isOperatorView ? "Recepción parcial" : "En tránsito"}
          value={(isOperatorView
            ? (countsByStatus["PARCIAL"] ?? 0)
            : (countsByStatus["EN_TRANSITO"] ?? 0)).toLocaleString("es-MX")}
          tone="warning"
          icon={<InventoryIcon className="h-5 w-5" />}
        />
        {!isOperatorView ? <StatCard
          label="Borradores"
          value={(countsByStatus["BORRADOR"] ?? 0).toLocaleString("es-MX")}
          icon={<BoxIcon className="h-5 w-5" />}
        /> : null}
        {!isOperatorView ? <StatCard
          label="Proveedores"
          value={totalSuppliers.toLocaleString("es-MX")}
          tone="success"
          icon={<WarehouseIcon className="h-5 w-5" />}
        /> : null}
      </div>

      <SectionCard
        title={isOperatorView ? "Recepción física" : "Decisiones de abastecimiento"}
        description={
          isOperatorView
            ? "Abre una orden confirmada para recibir, ubicar material o reportar una diferencia."
            : "Crea y confirma OCs, consulta proveedores y vigila compromisos de compra."
        }
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Link href="/purchasing/orders" className="surface rounded-[var(--radius-lg)] p-4 transition-colors hover:border-[var(--border-strong)]">
            <p className="text-sm font-semibold text-[var(--text-primary)]">{isOperatorView ? "Recepciones pendientes" : "Órdenes de compra"}</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">{isOperatorView ? "Recibe materiales contra una OC y registra diferencias." : "Crear, confirmar, dar seguimiento y cerrar órdenes."}</p>
          </Link>
          {!isOperatorView ? (
            <Link href="/purchasing/suppliers" className="surface rounded-[var(--radius-lg)] p-4 transition-colors hover:border-[var(--border-strong)]">
              <p className="text-sm font-semibold text-[var(--text-primary)]">Proveedores</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">Gestiona proveedores, precios y tiempos de entrega.</p>
            </Link>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard
        title={isOperatorView ? "Órdenes por recibir" : "Órdenes recientes"}
        description={isOperatorView ? "Consulta solo las órdenes relevantes para recepción física." : "Últimas órdenes creadas en el módulo de compras."}
        actions={
          <Link href="/purchasing/orders" className={buttonStyles({ variant: "ghost", size: "sm" })}>
            Ver todas
          </Link>
        }
      >
        {recentOrders.length === 0 ? (
          <EmptyState compact title="Sin órdenes recientes" description="Aún no hay órdenes de compra registradas." />
        ) : (
          <TableWrap striped>
            <Table>
              <thead>
                <tr>
                  <Th>Folio</Th>
                  <Th>Proveedor</Th>
                  <Th>Estado</Th>
                  <Th className="text-right">Líneas</Th>
                  <Th className="text-right">Accion</Th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => (
                  <TableRow key={order.id}>
                    <Td className="font-mono text-xs text-[var(--text-primary)]">{order.folio}</Td>
                    <Td>{order.supplier.name}</Td>
                    <Td>
                      <Badge variant={(STATUS_COLORS[order.status] as "neutral" | "accent" | "success" | "warning" | "danger") ?? "neutral"}>
                        {STATUS_LABELS[order.status] ?? order.status}
                      </Badge>
                    </Td>
                    <Td className="text-right font-semibold text-[var(--text-primary)]">{order._count.lines}</Td>
                    <Td className="text-right">
                      <Link href={`/purchasing/orders/${order.id}`} className={buttonStyles({ variant: "ghost", size: "sm" })}>
                        Ver detalle
                      </Link>
                    </Td>
                  </TableRow>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </SectionCard>
    </div>
  );
}
