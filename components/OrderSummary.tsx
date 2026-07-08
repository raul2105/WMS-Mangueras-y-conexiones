"use client";

import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/ui/section-card";
import { cn } from "@/lib/cn";

interface OrderSummaryProps {
  customerName?: string | null;
  customerId?: string | null;
  warehouseCode?: string | null;
  warehouseName?: string | null;
  dueDate?: string | null;
  selectedProduct?: {
    id: string;
    name: string;
    sku: string;
    totalAvailable: number;
    unitLabel?: string | null;
  } | null;
  sourceLabel?: string;
  equivalentProduct?: {
    id: string;
    name: string;
    sku: string;
  } | null;
  quantity?: number;
  lineNotes?: string;
  readinessState: "not_ready" | "missing_required" | "ready";
  missingFields?: string[];
  hasCommercialContext?: boolean;
  displayQuery?: string;
}

const STEPS = [
  { key: "customer", label: "Cliente" },
  { key: "products", label: "Productos" },
  { key: "availability", label: "Disponibilidad" },
  { key: "commitment", label: "Compromiso" },
  { key: "confirmation", label: "Confirmación" },
];

export function OrderSummary({
  customerName,
  customerId,
  warehouseCode,
  warehouseName,
  dueDate,
  selectedProduct,
  sourceLabel,
  equivalentProduct,
  quantity,
  lineNotes,
  readinessState,
  missingFields = [],
  hasCommercialContext = false,
  displayQuery,
}: OrderSummaryProps) {
  return (
    <aside className="hidden lg:block w-96 shrink-0" aria-label="Resumen del pedido">
      <SectionCard
        title="Resumen del pedido"
        description="Estado de la captura comercial. Se mantiene visible mientras construyes el pedido."
        className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto"
      >
        <div className="space-y-4">
          {/* Progress Steps */}
          <nav className="space-y-2" aria-label="Progreso del pedido guiado">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
              Pasos
            </p>
            <ol className="space-y-1.5">
              {STEPS.map((step, index) => {
                const isCurrent = getCurrentStep(readinessState, missingFields) === step.key;
                const isCompleted = isStepCompleted(step.key, readinessState, missingFields);
                
                return (
                  <li key={step.key} className="relative">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold",
                          isCompleted
                            ? "bg-emerald-500 text-white"
                            : isCurrent
                              ? "bg-cyan-500 text-white"
                              : "bg-white/10 text-slate-400 border border-white/10"
                        )}
                      >
                        {isCompleted ? "✓" : index + 1}
                      </span>
                      <span
                        className={cn(
                          "text-sm font-medium",
                          isCompleted ? "text-emerald-300" : isCurrent ? "text-cyan-300" : "text-slate-300"
                        )}
                      >
                        {step.label}
                      </span>
                    </div>
                    {/* Connector line */}
                    {index < STEPS.length - 1 && (
                      <div
                        className={cn(
                          "absolute left-3 top-6 w-0.5 h-full",
                          isCompleted ? "bg-emerald-500/50" : "bg-white/10"
                        )}
                      />
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>

          <div className="border-t border-white/10 pt-4 space-y-4">
            {/* Customer */}
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                Cliente
              </p>
              <p className={cn("text-sm", missingFields.includes("customerId") || missingFields.includes("customerName") ? "text-amber-300" : "text-white")}>
                {customerName || customerId ? (
                  <>
                    {customerName && <span className="font-medium">{customerName}</span>}
                    {customerId && <span className="font-mono text-xs text-slate-400 ml-1">({customerId})</span>}
                  </>
                ) : (
                  <span className="text-slate-400">Cliente pendiente</span>
                )}
              </p>
              {missingFields.includes("customerId") || missingFields.includes("customerName") ? (
                <p className="text-xs text-amber-300">Selecciona un cliente del catálogo</p>
              ) : null}
            </div>

            {/* Warehouse / Fulfillment Source */}
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                Almacén / Origen
              </p>
              <p className={cn("text-sm", missingFields.includes("warehouseId") ? "text-amber-300" : "text-white")}>
                {warehouseCode && warehouseName ? (
                  <>{warehouseCode} - {warehouseName}</>
                ) : (
                  <span className="text-slate-400">Almacén pendiente</span>
                )}
              </p>
              {missingFields.includes("warehouseId") && (
                <p className="text-xs text-amber-300">Selecciona un almacén</p>
              )}
            </div>

            {/* Delivery / Commitment Date */}
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                Fecha compromiso
              </p>
              <p className={cn("text-sm", missingFields.includes("dueDate") ? "text-amber-300" : "text-white")}>
                {dueDate ? (
                  new Date(dueDate).toLocaleDateString("es-MX", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                ) : (
                  <span className="text-slate-400">Fecha pendiente</span>
                )}
              </p>
              {missingFields.includes("dueDate") && (
                <p className="text-xs text-amber-300">Selecciona la fecha de compromiso</p>
              )}
            </div>

            {/* Product Lines */}
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                Líneas de producto
              </p>
              {selectedProduct ? (
                <div className="space-y-2">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">{selectedProduct.name}</p>
                        <p className="text-xs text-slate-400 font-mono">{selectedProduct.sku}</p>
                        <p className="text-xs text-slate-400">
                          Stock: {selectedProduct.totalAvailable.toLocaleString("es-MX")}
                          {selectedProduct.unitLabel && ` · ${selectedProduct.unitLabel}`}
                        </p>
                        {sourceLabel && (
                          <Badge variant="accent" className="mt-1 text-xs">{sourceLabel}</Badge>
                        )}
                        {equivalentProduct && (
                          <div className="mt-2 text-xs text-slate-400">
                            <span className="font-semibold text-white">Sustituye a:</span>{" "}
                            {equivalentProduct.name} ({equivalentProduct.sku})
                          </div>
                        )}
                      </div>
                      {quantity && (
                        <div className="text-right">
                          <p className="text-lg font-semibold text-white">{quantity.toLocaleString("es-MX")}</p>
                          <p className="text-xs text-slate-400">Cantidad</p>
                        </div>
                      )}
                    </div>
                    {lineNotes && (
                      <p className="mt-2 text-xs text-slate-300 line-clamp-2">{lineNotes}</p>
                    )}
                  </div>
                </div>
              ) : hasCommercialContext && displayQuery ? (
                <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-3 text-sm text-cyan-50">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cyan-200">
                    Contexto comercial
                  </p>
                  <p className="mt-1 font-medium text-white">Búsqueda: {displayQuery}</p>
                  {sourceLabel && (
                    <Badge variant="accent" className="mt-1 text-xs">{sourceLabel}</Badge>
                  )}
                  {equivalentProduct && (
                    <div className="mt-2 text-xs text-cyan-300">
                      <span className="font-semibold text-white">Sustituye a:</span>{" "}
                      {equivalentProduct.name} ({equivalentProduct.sku})
                    </div>
                  )}
                  <p className="mt-2 text-xs text-slate-400">
                    No hay producto resuelto todavía. Selecciona uno para agregarlo como línea.
                  </p>
                </div>
              ) : (
                <p className="text-slate-400 text-sm">Sin líneas seleccionadas</p>
              )}
            </div>

            {/* Readiness State */}
            <div className="border-t border-white/10 pt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                Estado
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Badge
                  variant={
                    readinessState === "ready" ? "success" :
                    readinessState === "missing_required" ? "warning" : "neutral"
                  }
                >
                  {readinessState === "ready" && "✓ Listo para crear"}
                  {readinessState === "missing_required" && "⚠ Faltan datos obligatorios"}
                  {readinessState === "not_ready" && "○ Pendiente de captura"}
                </Badge>
              </div>
              {readinessState === "missing_required" && missingFields.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {missingFields.map((field) => (
                    <li key={field} className="text-xs text-amber-300 flex items-center gap-1">
                      <span>•</span>
                      <span>{getFieldLabel(field)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Mobile collapsible version */}
      <div className="lg:hidden">
        <details className="rounded-2xl border border-white/10 bg-white/5">
          <summary className="flex cursor-pointer items-center justify-between p-4 list-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <span className="font-medium text-white">Resumen del pedido</span>
              <Badge
                variant={
                  readinessState === "ready" ? "success" :
                  readinessState === "missing_required" ? "warning" : "neutral"
                }
                className="text-xs"
              >
                {readinessState === "ready" && "Listo"}
                {readinessState === "missing_required" && "Incompleto"}
                {readinessState === "not_ready" && "Pendiente"}
              </Badge>
            </div>
            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentView" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </summary>
          <div className="p-4 space-y-4 border-t border-white/10">
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-slate-400">Cliente</p>
                  <p className={cn("text-sm font-medium", !customerName && !customerId ? "text-slate-400" : "text-white")}>
                    {customerName || customerId || "Cliente pendiente"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Almacén</p>
                  <p className={cn("text-sm font-medium", !warehouseCode ? "text-slate-400" : "text-white")}>
                    {warehouseCode && warehouseName ? `${warehouseCode} - ${warehouseName}` : "Almacén pendiente"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Fecha</p>
                  <p className={cn("text-sm font-medium", !dueDate ? "text-slate-400" : "text-white")}>
                    {dueDate ? new Date(dueDate).toLocaleDateString("es-MX", { day: "numeric", month: "short" }) : "Fecha pendiente"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Líneas</p>
                  <p className={cn("text-sm font-medium", !selectedProduct && !hasCommercialContext ? "text-slate-400" : "text-white")}>
                    {selectedProduct ? selectedProduct.name : hasCommercialContext ? `Contexto: ${displayQuery}` : "Sin líneas"}
                  </p>
                </div>
              </div>
            </div>

            {missingFields.length > 0 && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-200">
                  Acciones requeridas
                </p>
                <ul className="mt-2 space-y-1">
                  {missingFields.map((field) => (
                    <li key={field} className="text-xs text-amber-100 flex items-center gap-1">
                      <span>•</span>
                      <span>{getFieldLabel(field)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      </div>
    </aside>
  );
}

function getCurrentStep(readinessState: string, missingFields: string[]): string {
  if (readinessState === "ready") return "confirmation";
  if (missingFields.includes("customerId") || missingFields.includes("customerName")) return "customer";
  if (missingFields.includes("lineProductId") || (missingFields.length === 0 && readinessState === "not_ready")) return "products";
  if (missingFields.includes("warehouseId") || missingFields.includes("dueDate")) return "commitment";
  if (readinessState === "missing_required") return "availability";
  return "products";
}

function isStepCompleted(stepKey: string, readinessState: string, missingFields: string[]): boolean {
  const completedUpTo = getCurrentStep(readinessState, missingFields);
  const stepOrder = ["customer", "products", "availability", "commitment", "confirmation"];
  const currentIndex = stepOrder.indexOf(completedUpTo);
  const stepIndex = stepOrder.indexOf(stepKey);
  return stepIndex < currentIndex || (stepIndex === currentIndex && readinessState === "ready");
}

function getFieldLabel(field: string): string {
  const labels: Record<string, string> = {
    customerId: "Seleccionar cliente",
    customerName: "Nombre del cliente",
    warehouseId: "Seleccionar almacén",
    dueDate: "Fecha de compromiso",
    lineProductId: "Seleccionar producto",
    lineRequestedQty: "Cantidad del producto",
  };
  return labels[field] || field;
}