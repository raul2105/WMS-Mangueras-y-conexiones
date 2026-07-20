"use client";

import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/ui/section-card";
import { cn } from "@/lib/cn";

export type CommercialPromiseStatus = 
  | "promise_safe"
  | "insufficient_stock"
  | "unresolved"
  | "stale"
  | "substitute_requires_confirmation";

export interface CommercialPromiseDisplay {
  status: CommercialPromiseStatus;
  warehouseCode?: string;
  warehouseName?: string;
  availableQuantity?: number;
  checkedAt?: string;
  isSubstitute?: boolean;
  originalProductName?: string;
  originalProductSku?: string;
}

const COMMERCIAL_PROMISE_STATUS_LABELS: Record<CommercialPromiseStatus, string> = {
  promise_safe: "Promesa segura",
  insufficient_stock: "Disponibilidad insuficiente",
  unresolved: "Disponibilidad no verificada",
  stale: "Promesa vencida",
  substitute_requires_confirmation: "Sustituto pendiente de confirmar",
};

const COMMERCIAL_PROMISE_STATUS_VARIANTS: Record<CommercialPromiseStatus, "success" | "warning" | "danger" | "neutral" | "accent"> = {
  promise_safe: "success",
  insufficient_stock: "danger",
  unresolved: "warning",
  stale: "warning",
  substitute_requires_confirmation: "accent",
};

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
  // KAN-128: Commercial availability promise
  commercialPromise?: CommercialPromiseDisplay | null;
}

const STEPS = [
  { key: "customer", label: "Cliente" },
  { key: "product", label: "Producto" },
  { key: "delivery", label: "Entrega" },
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
  commercialPromise = null,
}: OrderSummaryProps) {
  return (
    <>
      {/* Desktop sidebar - hidden on mobile */}
      <aside className="hidden lg:block w-96 shrink-0" aria-label="Resumen del pedido" data-testid="order-summary-desktop">
        <SectionCard
          title="Resumen del pedido"
          description="Estado de la captura comercial. Se mantiene visible mientras construyes el pedido."
          className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto"
        >
          <OrderSummaryContent
            customerName={customerName}
            customerId={customerId}
            warehouseCode={warehouseCode}
            warehouseName={warehouseName}
            dueDate={dueDate}
            selectedProduct={selectedProduct}
            sourceLabel={sourceLabel}
            equivalentProduct={equivalentProduct}
            quantity={quantity}
            lineNotes={lineNotes}
            readinessState={readinessState}
            missingFields={missingFields}
            hasCommercialContext={hasCommercialContext}
            displayQuery={displayQuery}
            commercialPromise={commercialPromise}
          />
        </SectionCard>
      </aside>

      {/* Mobile collapsible version - visible on mobile */}
      <div className="lg:hidden" data-testid="order-summary-mobile">
        <details className="op-surface-muted">
          <summary className="flex cursor-pointer items-center justify-between p-4 list-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <span className="font-medium text-[var(--text-primary)]">Resumen del pedido</span>
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
            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </summary>
          <div className="p-4 space-y-4 border-t border-[var(--border-default)]">
            <OrderSummaryMobileContent
              customerName={customerName}
              customerId={customerId}
              warehouseCode={warehouseCode}
              warehouseName={warehouseName}
              dueDate={dueDate}
              selectedProduct={selectedProduct}
              hasCommercialContext={hasCommercialContext}
              displayQuery={displayQuery}
              missingFields={missingFields}
              readinessState={readinessState}
            />
          </div>
        </details>
      </div>
    </>
  );
}

// Desktop content component
function OrderSummaryContent({
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
  commercialPromise = null,
}: OrderSummaryProps) {
  return (
    <div className="space-y-3">
      <div className="op-next-action" data-testid="next-required-action" role="status">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
          Siguiente acción
        </p>
        <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
          {readinessState === "ready"
            ? "Revisar y crear el pedido"
            : missingFields.length > 0
              ? getFieldLabel(missingFields[0])
              : "Completar la captura"}
        </p>
        {readinessState !== "ready" && missingFields.length > 0 ? (
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Completa este dato para continuar con el siguiente paso.
          </p>
        ) : null}
      </div>
      {/* Progress Steps */}
      <nav className="space-y-2" aria-label="Progreso del pedido guiado" data-testid="guided-progress">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
            Progreso
          </p>
          <span className="text-xs text-[var(--text-muted)]">
            {readinessState === "ready" ? "3 de 3" : `${Math.max(0, STEPS.findIndex((step) => step.key === getCurrentStep(readinessState, missingFields)))} de 3`}
          </span>
        </div>
        <ol className="op-progress-list">
          {STEPS.map((step, index) => {
            const isCurrent = getCurrentStep(readinessState, missingFields) === step.key;
            const isCompleted = isStepCompleted(step.key, readinessState, missingFields);
            
            return (
              <li key={step.key} className="relative" data-testid={`progress-step-${step.key}`}>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "op-progress-marker",
                      isCompleted
                        ? "bg-emerald-500 text-white"
                        : isCurrent
                          ? "bg-cyan-500 text-white"
                          : "bg-[var(--status-neutral-bg)] text-[var(--status-neutral-text)] border border-[var(--status-neutral-border)]"
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

      {/* Commercial Availability Promise - KAN-128 */}
      {commercialPromise && (
        <div className="op-surface-muted p-4 space-y-3" data-testid="commercial-promise-section">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cyan-200">
              Promesa de disponibilidad
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge
                variant={COMMERCIAL_PROMISE_STATUS_VARIANTS[commercialPromise.status]}
                className="text-xs"
                data-testid="commercial-promise-status"
              >
                {COMMERCIAL_PROMISE_STATUS_LABELS[commercialPromise.status]}
              </Badge>
              {commercialPromise.warehouseCode && (
                <span className="text-xs text-slate-400 font-mono" data-testid="commercial-promise-warehouse">
                  {commercialPromise.warehouseCode}
                  {commercialPromise.warehouseName && ` - ${commercialPromise.warehouseName}`}
                </span>
              )}
            </div>
            {commercialPromise.availableQuantity !== undefined && (
              <p className="text-sm text-white">
                <span className="text-slate-400">Disponible al verificar: </span>
                <span className="font-semibold" data-testid="commercial-promise-available-qty">{commercialPromise.availableQuantity.toLocaleString("es-MX")}</span>
                {commercialPromise.isSubstitute && (
                  <Badge variant="accent" className="ml-2 text-xs">Sustituto</Badge>
                )}
              </p>
            )}
            {commercialPromise.checkedAt && (
              <p className="text-xs text-slate-400">
                Verificado: {new Date(commercialPromise.checkedAt).toLocaleString("es-MX", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            )}
            {commercialPromise.isSubstitute && commercialPromise.originalProductName && (
              <p className="text-xs text-cyan-300">
                <span className="font-semibold text-white">Sustituye a:</span>{" "}
                {commercialPromise.originalProductName} ({commercialPromise.originalProductSku})
              </p>
            )}
            {commercialPromise.status === "stale" && (
              <p className="text-xs text-amber-300">⚠ La verificación supera el umbral de 15 minutos. Vuelva a verificar disponibilidad.</p>
            )}
            {commercialPromise.status === "insufficient_stock" && (
              <p className="text-xs text-red-300">⚠ Stock insuficiente para la cantidad solicitada.</p>
            )}
            {commercialPromise.status === "unresolved" && (
              <p className="text-xs text-amber-300">⚠ No hay verificación de disponibilidad para este producto/almacén.</p>
            )}
            {commercialPromise.status === "substitute_requires_confirmation" && (
              <p className="text-xs text-cyan-300">⚠ Este producto es un sustituto/equivalencia. Requiere confirmación explícita del cliente.</p>
            )}
          </div>
        </div>
      )}

      <div className="border-t border-[var(--border-soft)] pt-3 space-y-3">
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
        </div>

        {/* Product Lines */}
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
            Líneas de producto
          </p>
          {selectedProduct ? (
            <div className="space-y-2">
              <div className="op-surface-muted p-3">
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
                      <p className="text-xs text-slate-40-400">Cantidad</p>
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
        <div className="border-t border-[var(--border-soft)] pt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
            Estado
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Badge
              variant={
                readinessState === "ready" ? "success" :
                readinessState === "missing_required" ? "warning" : "neutral"
              }
              data-testid="readiness-badge"
            >
              {readinessState === "ready" && "✓ Listo para crear"}
              {readinessState === "missing_required" && "⚠ Faltan datos obligatorios"}
              {readinessState === "not_ready" && "○ Pendiente de captura"}
            </Badge>
          </div>
          {readinessState === "missing_required" && missingFields.length > 0 ? (
            <p className="mt-2 text-xs text-[var(--status-warning-text)]">
              Falta completar el siguiente requisito para continuar.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// Mobile content component
function OrderSummaryMobileContent({
  customerName,
  customerId,
  warehouseCode,
  warehouseName,
  dueDate,
  selectedProduct,
  hasCommercialContext = false,
  displayQuery,
  missingFields = [],
}: Omit<OrderSummaryProps, "commercialPromise">) {
  return (
    <div className="space-y-4">
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
              {warehouseCode && warehouseName ? `${warehouseCode} - {warehouseName}` : "Almacén pendiente"}
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
  );
}

function getCurrentStep(readinessState: string, missingFields: string[]): string {
  if (readinessState === "ready") return "delivery";
  if (missingFields.includes("customerId") || missingFields.includes("customerName")) return "customer";
  if (missingFields.includes("lineProductId") || (missingFields.length === 0 && readinessState === "not_ready")) return "product";
  if (missingFields.includes("warehouseId") || missingFields.includes("dueDate")) return "delivery";
  return "product";
}

function isStepCompleted(stepKey: string, readinessState: string, missingFields: string[]): boolean {
  const currentStep = getCurrentStep(readinessState, missingFields);
  const stepOrder = ["customer", "product", "delivery"];
  const currentIndex = stepOrder.indexOf(currentStep);
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
