import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/ui/section-card";
import { Table, TableEmptyRow, TableRow, TableWrap, Td, Th } from "@/components/ui/table";
import type { FulfillmentQueueRow } from "@/lib/dashboard/fulfillment-dashboard";

type Props = {
  rows: FulfillmentQueueRow[];
};

function riskVariant(level: FulfillmentQueueRow["riskLevel"]) {
  if (level === "ALTO") return "danger" as const;
  if (level === "MEDIO") return "warning" as const;
  return "success" as const;
}

export function FulfillmentPriorityQueue({ rows }: Props) {
  return (
    <SectionCard
      title="Pedidos por atender"
      description="Pedidos confirmados priorizados por riesgo, vencimiento y actividad operativa."
      actions={
        <Link href="/production/requests" prefetch={false} className="text-sm text-[var(--accent)] hover:underline">
          Ver todos
        </Link>
      }
    >
      <TableWrap dense className="p-0">
        <Table className="min-w-[1080px]">
          <thead>
            <tr>
              <Th>Pedido</Th>
              <Th>Cliente</Th>
              <Th>Almacén</Th>
              <Th>Compromiso</Th>
              <Th>Estado pedido</Th>
              <Th>Estado pick</Th>
              <Th>Req. ensamble</Th>
              <Th>Últ. act.</Th>
              <Th>Riesgo</Th>
              <Th>Acción</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <TableEmptyRow colSpan={10}>No hay pedidos por atender.</TableEmptyRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.orderId}>
                  <Td>
                    <Link href={`/production/requests/${row.orderId}`} className="font-mono text-[var(--accent)] hover:underline" prefetch={false}>
                      {row.orderCode}
                    </Link>
                    <p className="mt-1">
                      <Badge variant={row.flowBadgeVariant}>{row.flowStageLabel}</Badge>
                    </p>
                  </Td>
                  <Td>{row.customerName}</Td>
                  <Td>{row.warehouseName}</Td>
                  <Td>{row.dueDate ? row.dueDate.toLocaleDateString("es-MX") : "--"}</Td>
                  <Td>{row.orderStatus}</Td>
                  <Td>{row.pickStatus}</Td>
                  <Td>{row.requiresAssembly ? "Sí" : "No"}</Td>
                  <Td>{row.lastUpdatedAt.toLocaleString("es-MX", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}</Td>
                  <Td>
                    <div className="space-y-1">
                      <Badge variant={riskVariant(row.riskLevel)}>{row.riskLevel}</Badge>
                      <p className="text-xs text-[var(--text-muted)]">{row.blockingCauseLabel}</p>
                    </div>
                  </Td>
                  <Td>
                    <Link href={row.actionHref} prefetch={false} className="text-[var(--accent)] hover:underline">
                      {row.actionLabel}
                    </Link>
                  </Td>
                </TableRow>
              ))
            )}
          </tbody>
        </Table>
      </TableWrap>
    </SectionCard>
  );
}
