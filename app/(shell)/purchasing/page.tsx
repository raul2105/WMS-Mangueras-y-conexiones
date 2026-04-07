import Link from "next/link";
import prisma from "@/lib/prisma";
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
  const [
    totalSuppliers,
    statusCounts,
    recentOrders,
  ] = await Promise.all([
    prisma.supplier.count({ where: { isActive: true } }),
    prisma.purchaseOrder.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.purchaseOrder.findMany({
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
        title="Compras"
        description="Gestion de proveedores, ordenes de compra y seguimiento de recepciones."
        meta={`${openCount.toLocaleString("es-MX")} OCs activas`}
        actions={
          <>
            <Link href="/purchasing/orders" className={buttonStyles({ variant: "secondary" })}>
              Ver ordenes
            </Link>
            <Link href="/purchasing/orders/new" className={buttonStyles()}>
              Nueva OC
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="OCs activas"
          value={openCount.toLocaleString("es-MX")}
          tone="accent"
          icon={<PurchasingIcon className="h-5 w-5" />}
        />
        <StatCard
          label="En transito"
          value={(countsByStatus["EN_TRANSITO"] ?? 0).toLocaleString("es-MX")}
          tone="warning"
          icon={<InventoryIcon className="h-5 w-5" />}
        />
        <StatCard
          label="Borradores"
          value={(countsByStatus["BORRADOR"] ?? 0).toLocaleString("es-MX")}
          icon={<BoxIcon className="h-5 w-5" />}
        />
        <StatCard
          label="Proveedores"
          value={totalSuppliers.toLocaleString("es-MX")}
          tone="success"
          icon={<WarehouseIcon className="h-5 w-5" />}
        />
      </div>

      <SectionCard title="Accesos rapidos" description="Navega a las vistas operativas principales de Compras.">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Link href="/purchasing/orders" className="surface rounded-[var(--radius-lg)] p-4 transition-colors hover:border-[var(--border-strong)]">
            <p className="text-sm font-semibold text-[var(--text-primary)]">Ordenes de compra</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Crear, confirmar, recibir y cerrar ordenes.</p>
          </Link>
          <Link href="/purchasing/suppliers" className="surface rounded-[var(--radius-lg)] p-4 transition-colors hover:border-[var(--border-strong)]">
            <p className="text-sm font-semibold text-[var(--text-primary)]">Proveedores</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Gestion del catalogo de proveedores y precios.</p>
          </Link>
        </div>
      </SectionCard>

      <SectionCard
        title="Ordenes recientes"
        description="Ultimas ordenes creadas en el modulo de compras."
        actions={
          <Link href="/purchasing/orders" className={buttonStyles({ variant: "ghost", size: "sm" })}>
            Ver todas
          </Link>
        }
      >
        {recentOrders.length === 0 ? (
          <EmptyState compact title="Sin ordenes recientes" description="No hay ordenes de compra registradas aun." />
        ) : (
          <TableWrap striped>
            <Table>
              <thead>
                <tr>
                  <Th>Folio</Th>
                  <Th>Proveedor</Th>
                  <Th>Estado</Th>
                  <Th className="text-right">Lineas</Th>
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
