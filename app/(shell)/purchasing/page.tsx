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
import { buildPurchaseOrderPresetWhere } from "@/lib/purchasing/purchase-order-presets";
import {
  comparePurchaseOrderOperationalPriority,
  getPurchaseOrderOperationalState,
} from "@/lib/purchasing/purchase-order-operational";

export const revalidate = 30;

const STATUS_LABELS: Record<string, string> = {
  BORRADOR: "Borrador",
  CONFIRMADA: "Confirmada",
  EN_TRANSITO: "En Tránsito",
  RECIBIDA: "Recibida",
  PARCIAL: "Parcial",
  CANCELADA: "Cancelada",
};

const STATUS_COLORS: Record<string, "neutral" | "accent" | "success" | "warning" | "danger"> = {
  BORRADOR: "neutral",
  CONFIRMADA: "accent",
  EN_TRANSITO: "warning",
  RECIBIDA: "success",
  PARCIAL: "warning",
  CANCELADA: "danger",
};

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "Sin fecha";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "Sin fecha" : date.toLocaleDateString("es-MX");
}

function canReceivePurchaseOrder(status: string) {
  return status === "CONFIRMADA" || status === "EN_TRANSITO" || status === "PARCIAL";
}

export default async function PurchasingPage() {
  await pageGuard("purchasing.view");
  const sessionCtx = await getSessionContext();
  const isOperatorView =
    sessionCtx.roles.includes("WAREHOUSE_OPERATOR") &&
    !sessionCtx.roles.includes("MANAGER") &&
    !sessionCtx.isSystemAdmin;
  const canManagePurchasing =
    sessionCtx.isSystemAdmin || sessionCtx.permissions.includes("purchasing.manage");
  const canReceivePurchasing =
    sessionCtx.isSystemAdmin || sessionCtx.permissions.includes("purchasing.receive");

  const priorityOrdersWhere: Prisma.PurchaseOrderWhereInput = isOperatorView
    ? { status: { in: ["CONFIRMADA", "EN_TRANSITO", "PARCIAL"] } }
    : { status: { in: ["BORRADOR", "CONFIRMADA", "EN_TRANSITO", "PARCIAL"] } };

  const [
    totalSuppliers,
    statusCounts,
    candidateOrders,
    overdueCount,
    dueTodayCount,
  ] = await Promise.all([
    prisma.supplier.count({ where: { isActive: true } }),
    prisma.purchaseOrder.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.purchaseOrder.findMany({
      where: priorityOrdersWhere,
      take: 30,
      orderBy: [{ expectedDate: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        folio: true,
        status: true,
        expectedDate: true,
        supplier: { select: { name: true } },
        lines: { select: { qtyOrdered: true, qtyReceived: true } },
      },
    }),
    prisma.purchaseOrder.count({ where: buildPurchaseOrderPresetWhere("vencidas") }),
    prisma.purchaseOrder.count({ where: buildPurchaseOrderPresetWhere("por_recibir_hoy") }),
  ]);

  const countsByStatus = Object.fromEntries(statusCounts.map((s) => [s.status, s._count._all]));
  const openCount =
    (countsByStatus["CONFIRMADA"] ?? 0) +
    (countsByStatus["EN_TRANSITO"] ?? 0) +
    (countsByStatus["PARCIAL"] ?? 0);
  const partialCount = countsByStatus["PARCIAL"] ?? 0;
  const priorityOrders = candidateOrders
    .sort((left, right) => comparePurchaseOrderOperationalPriority(left, right))
    .slice(0, 8);

  return (
    <div className="space-y-5">
      <PageHeader
        title={isOperatorView ? "Recepciones" : "Compras y abastecimiento"}
        description={
          isOperatorView
            ? "Registra mercancía recibida y reporta diferencias físicas."
            : "Prioriza vencimientos, recepciones y compromisos de abastecimiento desde una sola cola operativa."
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

      <div className={`grid grid-cols-2 gap-4 ${isOperatorView ? "md:grid-cols-2" : "md:grid-cols-3 xl:grid-cols-6"}`}>
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
          value={(isOperatorView ? partialCount : (countsByStatus["EN_TRANSITO"] ?? 0)).toLocaleString("es-MX")}
          tone="warning"
          icon={<InventoryIcon className="h-5 w-5" />}
        />
        {!isOperatorView ? (
          <StatCard
            label="Parciales"
            value={partialCount.toLocaleString("es-MX")}
            tone="warning"
            icon={<InventoryIcon className="h-5 w-5" />}
          />
        ) : null}
        {!isOperatorView ? (
          <StatCard
            label="Vencidas"
            value={overdueCount.toLocaleString("es-MX")}
            tone="warning"
            icon={<BoxIcon className="h-5 w-5" />}
          />
        ) : null}
        {!isOperatorView ? (
          <StatCard
            label="Por recibir hoy"
            value={dueTodayCount.toLocaleString("es-MX")}
            tone="accent"
            icon={<PurchasingIcon className="h-5 w-5" />}
          />
        ) : null}
        {!isOperatorView ? (
          <StatCard
            label="Proveedores"
            value={totalSuppliers.toLocaleString("es-MX")}
            tone="success"
            icon={<WarehouseIcon className="h-5 w-5" />}
          />
        ) : null}
      </div>

      <SectionCard
        title={isOperatorView ? "Recepción física" : "Alertas y accesos operativos"}
        description={
          isOperatorView
            ? "Abre una orden confirmada para recibir, ubicar material o reportar una diferencia."
            : "Entra directo a las excepciones que requieren decisión antes de revisar el historial completo."
        }
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Link href={isOperatorView ? "/purchasing/orders?preset=por_recibir" : "/purchasing/orders?preset=vencidas"} className="surface rounded-[var(--radius-lg)] p-4 transition-colors hover:border-[var(--border-strong)]">
            <p className="text-sm font-semibold text-[var(--text-primary)]">{isOperatorView ? "Recepciones pendientes" : `Vencidas (${overdueCount})`}</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">{isOperatorView ? "Recibe materiales contra una OC y registra diferencias." : "Compromisos cuya fecha esperada ya venció y siguen abiertos."}</p>
          </Link>
          <Link href="/purchasing/orders?preset=por_recibir_hoy" className="surface rounded-[var(--radius-lg)] p-4 transition-colors hover:border-[var(--border-strong)]">
            <p className="text-sm font-semibold text-[var(--text-primary)]">Por recibir hoy ({dueTodayCount})</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Recepciones que deben coordinarse durante la jornada actual.</p>
          </Link>
          {!isOperatorView ? (
            <Link href="/purchasing/orders?preset=recepcion_parcial" className="surface rounded-[var(--radius-lg)] p-4 transition-colors hover:border-[var(--border-strong)]">
              <p className="text-sm font-semibold text-[var(--text-primary)]">Recepciones parciales ({partialCount})</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">Órdenes con material pendiente por completar.</p>
            </Link>
          ) : null}
          {!isOperatorView ? (
            <Link href="/purchasing/suppliers" className="surface rounded-[var(--radius-lg)] p-4 transition-colors hover:border-[var(--border-strong)]">
              <p className="text-sm font-semibold text-[var(--text-primary)]">Proveedores</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">Consulta datos, precios y tiempos de entrega.</p>
            </Link>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard
        title={isOperatorView ? "Cola de recepción" : "Cola priorizada de compras"}
        description={
          isOperatorView
            ? "Primero aparecen vencidas, parciales y recepciones comprometidas para hoy."
            : "Ordenada por vencimiento, recepción parcial, compromiso de hoy y estado operativo."
        }
        actions={
          <Link href="/purchasing/orders" className={buttonStyles({ variant: "ghost", size: "sm" })}>
            Ver todas
          </Link>
        }
      >
        {priorityOrders.length === 0 ? (
          <EmptyState compact title="Sin trabajo pendiente" description="No hay órdenes abiertas que requieran atención." />
        ) : (
          <TableWrap striped>
            <Table>
              <thead>
                <tr>
                  <Th>Folio</Th>
                  <Th>Proveedor</Th>
                  <Th>Estado</Th>
                  <Th>Fecha esperada</Th>
                  <Th className="text-right">Recibido</Th>
                  <Th>Riesgo</Th>
                  <Th>Siguiente acción</Th>
                  <Th className="text-right">Acción</Th>
                </tr>
              </thead>
              <tbody>
                {priorityOrders.map((order) => {
                  const operational = getPurchaseOrderOperationalState(order);
                  const receiveNow = canReceivePurchasing && canReceivePurchaseOrder(order.status);
                  return (
                    <TableRow key={order.id}>
                      <Td className="font-mono text-xs text-[var(--text-primary)]">{order.folio}</Td>
                      <Td>{order.supplier.name}</Td>
                      <Td>
                        <Badge variant={STATUS_COLORS[order.status] ?? "neutral"}>
                          {STATUS_LABELS[order.status] ?? order.status}
                        </Badge>
                      </Td>
                      <Td>{formatDate(order.expectedDate)}</Td>
                      <Td className="text-right font-semibold text-[var(--text-primary)]">{operational.receivedPercent}%</Td>
                      <Td>
                        <Badge variant={operational.riskTone}>{operational.riskLabel}</Badge>
                      </Td>
                      <Td className="text-[var(--text-secondary)]">{operational.nextAction}</Td>
                      <Td className="text-right">
                        <Link
                          href={receiveNow ? `/purchasing/orders/${order.id}/receive` : `/purchasing/orders/${order.id}`}
                          className={buttonStyles({ variant: receiveNow ? "primary" : "ghost", size: "sm" })}
                        >
                          {receiveNow ? "Recibir" : order.status === "BORRADOR" ? "Completar OC" : "Abrir orden"}
                        </Link>
                      </Td>
                    </TableRow>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </SectionCard>
    </div>
  );
}
