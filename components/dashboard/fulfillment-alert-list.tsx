import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/ui/section-card";
import type { FulfillmentAlert } from "@/lib/dashboard/fulfillment-dashboard";

type Props = {
  alerts: FulfillmentAlert[];
};

function severityVariant(level: FulfillmentAlert["severity"]) {
  if (level === "danger") return "danger" as const;
  if (level === "warning") return "warning" as const;
  return "accent" as const;
}

export function FulfillmentAlertList({ alerts }: Props) {
  return (
    <SectionCard title="Alertas accionables" description="Cada alerta abre una vista operativa filtrada para ejecutar acciones.">
      <div className="space-y-3">
        {alerts.map((alert) => (
          <div key={alert.id} className="rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-subtle)] px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-[var(--text-primary)]">{alert.title}</p>
                <p className="text-xs text-[var(--text-muted)]">{alert.description}</p>
              </div>
              <Badge variant={severityVariant(alert.severity)} size="md">
                {alert.count.toLocaleString("es-MX")}
              </Badge>
            </div>
            <div className="mt-2">
              <Link href={alert.href} prefetch={false} className="text-sm text-[var(--accent)] hover:underline">
                Ir a vista operativa
              </Link>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
