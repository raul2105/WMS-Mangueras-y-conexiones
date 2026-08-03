import { SectionCard } from "@/components/ui/section-card";
import { StatCard } from "@/components/ui/stat-card";
import type { FulfillmentOperationalMetrics } from "@/lib/dashboard/fulfillment-dashboard";

type Props = {
  metrics: FulfillmentOperationalMetrics;
};

function percent(value: number | null) {
  return value === null ? "—" : `${value.toLocaleString("es-MX", { maximumFractionDigits: 1 })}%`;
}

function hours(value: number | null) {
  return value === null ? "—" : `${value.toLocaleString("es-MX", { maximumFractionDigits: 1 })} h`;
}

export function FulfillmentOperationalMetrics({ metrics }: Props) {
  return (
    <SectionCard
      title="Indicadores operativos"
      description={`Ventana móvil de ${metrics.periodDays} días. Se muestran sólo ciclos y tareas con cierre registrado.`}
    >
      <div data-testid="fulfillment-operational-metrics" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Fill-rate de surtido"
          value={percent(metrics.fillRatePercent)}
          tone={metrics.fillRatePercent !== null && metrics.fillRatePercent < 95 ? "warning" : "success"}
          meta={metrics.measuredPickTasks > 0 ? `${metrics.measuredPickTasks} tareas cerradas` : "Sin tareas cerradas"}
        />
        <StatCard
          label="Exactitud de surtido"
          value={percent(metrics.pickAccuracyPercent)}
          tone={metrics.pickAccuracyPercent !== null && metrics.pickAccuracyPercent < 95 ? "warning" : "success"}
          meta="Tareas cerradas sin faltante"
        />
        <StatCard
          label="Ciclo promedio de surtido"
          value={hours(metrics.averagePickCycleHours)}
          tone="accent"
          meta={metrics.measuredPickCycles > 0 ? `${metrics.measuredPickCycles} pedidos medidos` : "Sin ciclos completos"}
        />
        <StatCard
          label="Ciclo promedio de OT"
          value={hours(metrics.averageAssemblyCycleHours)}
          tone="accent"
          meta={metrics.measuredAssemblyCycles > 0 ? `${metrics.measuredAssemblyCycles} OTs cerradas` : "Sin OTs cerradas"}
        />
      </div>
      <p className="mt-3 text-xs text-[var(--text-muted)]">
        Fill-rate = unidades surtidas / solicitadas. Exactitud = tareas cerradas sin faltante. Los ciclos se miden desde surtido iniciado hasta preparado y desde creación de OT hasta cierre.
      </p>
    </SectionCard>
  );
}
