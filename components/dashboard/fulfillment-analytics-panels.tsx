import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/ui/section-card";
import type { FulfillmentAnalytics } from "@/lib/dashboard/fulfillment-dashboard";

type Props = {
  analytics: FulfillmentAnalytics;
};

function riskVariant(level: "ALTO" | "MEDIO" | "BAJO") {
  if (level === "ALTO") return "danger" as const;
  if (level === "MEDIO") return "warning" as const;
  return "success" as const;
}

export function FulfillmentAnalyticsPanels({ analytics }: Props) {
  return (
    <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <SectionCard title="Top pedidos en riesgo">
        <div className="space-y-2 text-sm">
          {analytics.topRiskOrders.length === 0 ? (
            <p className="text-[var(--text-muted)]">Sin riesgo relevante.</p>
          ) : (
            analytics.topRiskOrders.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3">
                <Link href={row.href} prefetch={false} className="font-mono text-[var(--accent)] hover:underline">
                  {row.label}
                </Link>
                <Badge variant={riskVariant(row.riskLevel)}>{row.riskLevel}</Badge>
              </div>
            ))
          )}
        </div>
      </SectionCard>

      <SectionCard title="Top causas de bloqueo (heurístico)">
        <div className="space-y-2 text-sm">
          {analytics.topBlockingCauses.length === 0 ? (
            <p className="text-[var(--text-muted)]">Sin bloqueos dominantes.</p>
          ) : (
            analytics.topBlockingCauses.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3">
                <Link href={row.href} prefetch={false} className="text-[var(--text-primary)] hover:text-[var(--accent)]">
                  {row.label}
                </Link>
                <Badge variant="warning">{row.count}</Badge>
              </div>
            ))
          )}
        </div>
      </SectionCard>
    </section>
  );
}
