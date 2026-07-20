"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import CustomerSearchField from "@/components/CustomerSearchField";
import ProductSearchField from "@/components/ProductSearchField";
import { SectionCard } from "@/components/ui/section-card";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { parseDueDate } from "@/lib/schemas/wms";
import type { CommercialAvailabilityPromise, CommercialPromiseStatus } from "@/lib/sales/availability-promise";

type PendingOrderLine =
  | { id: string; kind: "PRODUCT"; productId: string; requestedQty: number; notes?: string; label: string }
  | { id: string; kind: "ASSEMBLY"; entryFittingProductId: string; hoseProductId: string; exitFittingProductId: string; hoseLength: number; assemblyQuantity: number; notes?: string; label: string };

interface NewOrderFormProps {
  initialCustomerId?: string;
  initialCustomerName?: string;
  initialWarehouseId?: string;
  initialDueDate?: string;
  initialQuantity?: number;
  initialLineNotes?: string;
  warehouses: Array<{ id: string; code: string; name: string }>;
  selectedProduct?: {
    id: string;
    name: string;
    sku: string;
    referenceCode?: string | null;
    totalAvailable: number;
    unitLabel?: string | null;
  } | null;
  originalProduct?: {
    id: string;
    name: string;
    sku: string;
  } | null;
  hasCommercialContext: boolean;
  displayQuery: string;
  sourceLabel: string;
  commercialPromise?: (CommercialAvailabilityPromise & {
    status: CommercialPromiseStatus;
    staleThresholdMinutes: number;
  }) | null;
  invalidProductContext: boolean;
  catalogHref: string;
  availabilityHref: string;
  equivalencesHref: string;
  canViewCustomers: boolean;
  canManageCustomers: boolean;
  canQuickCreateCustomers: boolean;
  action: (formData: FormData) => void | Promise<void>;
  error?: string;
}

export function NewOrderForm({
  initialCustomerId,
  initialCustomerName,
  initialWarehouseId,
  initialDueDate,
  initialQuantity,
  initialLineNotes,
  warehouses,
  selectedProduct,
  originalProduct,
  hasCommercialContext,
  displayQuery,
  sourceLabel,
  commercialPromise = null,
  invalidProductContext,
  catalogHref,
  availabilityHref,
  equivalencesHref,
  canViewCustomers,
  canManageCustomers,
  canQuickCreateCustomers,
  action,
  error,
}: NewOrderFormProps) {
  const [customerId, setCustomerId] = useState(initialCustomerId || "");
  const [customerName, setCustomerName] = useState(initialCustomerName || "");
  const [warehouseId, setWarehouseId] = useState(initialWarehouseId || "");
  const [dueDate, setDueDate] = useState(initialDueDate || "");
  const [quantity, setQuantity] = useState(initialQuantity || 1);
  const [lineNotes, setLineNotes] = useState(initialLineNotes || "");
  const [lineKind, setLineKind] = useState<"PRODUCT" | "ASSEMBLY" | "">(selectedProduct ? "PRODUCT" : "");
  const [orderLines, setOrderLines] = useState<PendingOrderLine[]>([]);
  const [directProductId, setDirectProductId] = useState(selectedProduct?.id ?? "");
  const [directDraftKey, setDirectDraftKey] = useState(0);
  const [assemblyDraftKey, setAssemblyDraftKey] = useState(0);
  const [entryFittingProductId, setEntryFittingProductId] = useState("");
  const [hoseProductId, setHoseProductId] = useState("");
  const [exitFittingProductId, setExitFittingProductId] = useState("");
  const [hoseLength, setHoseLength] = useState("");
  const [assemblyQuantity, setAssemblyQuantity] = useState("1");
  const [assemblyNotes, setAssemblyNotes] = useState("");
  const [notes, setNotes] = useState("");
  const [serverError] = useState<string | undefined>(error);
  const [activeStep, setActiveStep] = useState<"customer" | "product" | "delivery">("customer");

  // Compute missing fields and readiness state directly from form state (no effect needed)
  const missingFields = (() => {
    const missing: string[] = [];

    if (canViewCustomers && !customerId) {
      missing.push("customerId");
    } else if (!canViewCustomers && !customerName) {
      missing.push("customerName");
    }

    if (!warehouseId) {
      missing.push("warehouseId");
    }

    if (!dueDate) {
      missing.push("dueDate");
    } else if (!parseDueDate(dueDate)) {
      missing.push("dueDate");
    }

    if (orderLines.length === 0) missing.push("orderLines");

    return missing;
  })();

  // A search query is context only; warehouse execution requires a resolved line.
  const assemblyReady = Boolean(warehouseId && entryFittingProductId && hoseProductId && exitFittingProductId && parsePositiveDecimal(hoseLength) && parsePositiveDecimal(assemblyQuantity));
  const hasProductContext = orderLines.length > 0;
  const readinessState: "not_ready" | "missing_required" | "ready" =
    missingFields.length === 0 && hasProductContext
      ? "ready"
      : missingFields.length > 0
        ? "missing_required"
        : "not_ready";

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (readinessState !== "ready") {
      e.preventDefault();
      return;
    }
    // Let form submit normally to server action
  };

  const customerReady = canViewCustomers ? Boolean(customerId) : Boolean(customerName.trim());
  const productReady = hasProductContext;
  const deliveryReady = Boolean(warehouseId && parseDueDate(dueDate));
  const promiseMatchesWarehouse = commercialPromise?.warehouseId === warehouseId;
  const promiseAppliesToOrder = Boolean(
    commercialPromise &&
    promiseMatchesWarehouse &&
    orderLines.some((line) => line.kind === "PRODUCT" && line.productId === commercialPromise.productId),
  );

  const steps = [
    { key: "customer", label: "Cliente", icon: "1", complete: customerReady },
    { key: "product", label: lineKind === "ASSEMBLY" ? "Ensamble" : "Producto", icon: "2", complete: productReady },
    { key: "delivery", label: "Entrega", icon: "3", complete: deliveryReady },
  ] as const;

  const commercialPromiseBanner = commercialPromise ? (
    <div
      className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-3 text-sm"
      data-testid="commercial-promise-section"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-[var(--text-primary)]">Disponibilidad verificada</p>
        <Badge variant={
          commercialPromise.status === "promise_safe" ? "success" :
          commercialPromise.status === "insufficient_stock" ? "danger" : "warning"
        } data-testid="commercial-promise-status">
          {commercialPromise.status === "promise_safe" ? "Promesa segura" :
            commercialPromise.status === "stale" ? "Promesa vencida" :
            commercialPromise.status === "insufficient_stock" ? "Disponibilidad insuficiente" :
            commercialPromise.status === "substitute_requires_confirmation" ? "Sustituto pendiente de confirmar" :
            "Disponibilidad no verificada"}
        </Badge>
      </div>
      <p className="mt-1 text-[var(--text-secondary)]">
        {commercialPromise.warehouseCode} · Disponible ahora: <span className="font-semibold text-[var(--text-primary)]" data-testid="commercial-promise-available-qty">{commercialPromise.availableQuantity.toLocaleString("es-MX")}</span>
      </p>
      {commercialPromise.status === "stale" ? (
        <p className="mt-1 text-xs text-[var(--status-warning-text)]">
          La consulta supera el límite de {commercialPromise.staleThresholdMinutes} minutos. Se validará de nuevo al crear el pedido.
        </p>
      ) : null}
      {!promiseMatchesWarehouse ? (
        <p className="mt-1 text-xs text-[var(--status-warning-text)]">
          Esta verificación corresponde a otro almacén; consulta disponibilidad para el almacén seleccionado.
        </p>
      ) : null}
    </div>
  ) : null;

  const addDirectLine = () => {
    const requestedQty = parsePositiveDecimal(String(quantity));
    if (!directProductId || !requestedQty) return;
    setOrderLines((lines) => [...lines, {
      id: `product-${Date.now()}-${lines.length}`,
      kind: "PRODUCT",
      productId: directProductId,
      requestedQty,
      notes: lineNotes || undefined,
      label: selectedProduct?.name ?? "Producto directo seleccionado",
    }]);
    setDirectProductId("");
    setLineNotes("");
    setDirectDraftKey((value) => value + 1);
  };

  const addAssemblyLine = () => {
    const length = parsePositiveDecimal(hoseLength);
    const assemblyQty = parsePositiveDecimal(assemblyQuantity);
    if (!assemblyReady || !length || !assemblyQty) return;
    setOrderLines((lines) => [...lines, {
      id: `assembly-${Date.now()}-${lines.length}`,
      kind: "ASSEMBLY",
      entryFittingProductId,
      hoseProductId,
      exitFittingProductId,
      hoseLength: length,
      assemblyQuantity: assemblyQty,
      notes: assemblyNotes || undefined,
      label: `Ensamble ${assemblyQty} × ${length}`,
    }]);
    setEntryFittingProductId("");
    setHoseProductId("");
    setExitFittingProductId("");
    setHoseLength("");
    setAssemblyQuantity("1");
    setAssemblyNotes("");
    setAssemblyDraftKey((value) => value + 1);
  };

  return (
    <form action={action} onSubmit={handleSubmit} className="space-y-6">
      <input type="hidden" name="lineKind" value={lineKind} />
      <input type="hidden" name="orderLines" value={JSON.stringify(orderLines)} />
      {promiseAppliesToOrder && commercialPromise ? (
        <input type="hidden" name="commercialPromise" value={JSON.stringify(commercialPromise)} />
      ) : null}
      {lineKind === "PRODUCT" && selectedProduct ? <input type="hidden" name="lineProductId" value={selectedProduct.id} /> : null}
      {activeStep !== "customer" && canViewCustomers ? <input type="hidden" name="customerId" value={customerId} /> : null}
      {activeStep !== "customer" && !canViewCustomers ? <input type="hidden" name="customerName" value={customerName} /> : null}
      {activeStep !== "product" && lineKind === "PRODUCT" && selectedProduct ? <input type="hidden" name="lineRequestedQty" value={quantity} /> : null}
      {activeStep !== "product" && lineKind === "PRODUCT" && selectedProduct ? <input type="hidden" name="lineNotes" value={lineNotes} /> : null}
      {activeStep !== "product" && lineKind === "ASSEMBLY" ? <>
        <input type="hidden" name="entryFittingProductId" value={entryFittingProductId} />
        <input type="hidden" name="hoseProductId" value={hoseProductId} />
        <input type="hidden" name="exitFittingProductId" value={exitFittingProductId} />
        <input type="hidden" name="hoseLength" value={hoseLength} />
        <input type="hidden" name="assemblyQuantity" value={assemblyQuantity} />
        <input type="hidden" name="assemblyNotes" value={assemblyNotes} />
      </> : null}
      <SectionCard title="Nuevo pedido">
        <div className="space-y-5">
          <nav aria-label="Pasos del nuevo pedido" className="grid gap-2 sm:grid-cols-3" data-testid="sales-order-stepper">
            {steps.map((step) => {
              const isActive = activeStep === step.key;
              const canOpen = step.key === "customer" || (step.key === "product" && customerReady) || (step.key === "delivery" && customerReady && productReady);
              return (
                <button
                  key={step.key}
                  type="button"
                  onClick={() => setActiveStep(step.key)}
                  disabled={!canOpen}
                  data-testid={`sales-order-step-${step.key}`}
                  className={cn(
                    "flex items-center gap-3 rounded-[var(--radius-md)] border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-55",
                    isActive
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]"
                      : "border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-secondary)]",
                  )}
                  aria-current={isActive ? "step" : undefined}
                >
                  <span className={cn(
                    "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                    step.complete
                      ? "bg-[var(--status-success-bg)] text-[var(--status-success-text)]"
                      : isActive
                        ? "bg-[var(--accent)] text-[var(--text-inverse)]"
                        : "bg-[var(--status-neutral-bg)] text-[var(--status-neutral-text)]",
                  )}>
                    {step.complete ? "✓" : step.icon}
                  </span>
                  <span>
                    <span className="block text-xs font-semibold uppercase tracking-[0.12em] opacity-80">Paso {step.icon}</span>
                    <span className="block text-sm font-semibold">{step.label}</span>
                  </span>
                </button>
              );
            })}
          </nav>
          {serverError ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {serverError}
            </div>
          ) : null}
          {commercialPromiseBanner}

          {activeStep === "product" && hasCommercialContext ? (
            <div className="op-card space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  {selectedProduct ? "Producto de referencia" : "Contexto comercial"}
                </p>
                <Badge variant="accent">{sourceLabel}</Badge>
              </div>

              {invalidProductContext ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                  No encontramos el producto seleccionado. Puedes corregir la
                  selección o seguir con la captura manual sin perder el
                  pedido.
                </div>
              ) : selectedProduct ? (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.7fr)]">
                  <div className="space-y-2">
                    <p className="text-lg font-semibold text-[var(--text-primary)]">
                      {selectedProduct.name}
                    </p>
                    <div className="grid gap-2 text-sm text-[var(--text-secondary)] sm:grid-cols-2">
                      <p>
                        <span className="text-[var(--text-muted)]">SKU:</span>{" "}
                        <span className="font-mono">{selectedProduct.sku}</span>
                      </p>
                      {selectedProduct?.referenceCode ? (
                        <p>
                          <span className="text-[var(--text-muted)]">Referencia:</span>{" "}
                          <span className="font-mono">
                            {selectedProduct?.referenceCode}
                          </span>
                        </p>
                      ) : null}
                      <p>
                        <span className="text-[var(--text-muted)]">Stock disponible:</span>{" "}
                        {selectedProduct.totalAvailable.toLocaleString("es-MX")}
                      </p>
                      {selectedProduct.unitLabel ? (
                        <p>
                          <span className="text-[var(--text-muted)]">Unidad:</span>{" "}
                          {selectedProduct.unitLabel}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="op-next-action text-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">
                      Siguiente acción
                    </p>
                    <p className="mt-2">
                      Confirma el cliente y guarda esta referencia como la
                      primera línea editable del pedido.
                    </p>
                  </div>
                </div>
              ) : displayQuery ? (
                <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-4 text-sm text-cyan-50">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">
                    Contexto comercial
                  </p>
                  <p className="mt-2 text-lg font-semibold text-[var(--text-primary)]">
                    Búsqueda comercial: {displayQuery}
                  </p>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">
                    No hay un producto resuelto todavía. La búsqueda se
                    mantiene como referencia para continuar el pedido manual.
                  </p>
                </div>
              ) : null}

              {originalProduct ? (
                <div className="op-surface-muted p-4 text-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                    Sustituye a
                  </p>
                  <p className="mt-1 font-semibold text-[var(--text-primary)]">
                    {originalProduct.name}
                  </p>
                  <p className="font-mono text-xs text-[var(--text-muted)]">
                    {originalProduct.sku}
                  </p>
                </div>
              ) : null}

            </div>
          ) : null}

          {activeStep === "customer" ? (
          <section id="captura-cliente" className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-accent)]">Paso 1 de 3</p>
                <h2 className="text-2xl font-semibold text-[var(--text-primary)]">¿Quién es el cliente?</h2>
                <p className="text-sm text-[var(--text-muted)]">
                  Selecciona la cuenta que recibirá el pedido.
                </p>
              </div>
              {canManageCustomers ? (
                <Link
                  href="/sales/customers/new"
                  className={buttonStyles({ variant: "secondary", size: "sm" })}
                >
                  Registrar cliente
                </Link>
              ) : null}
            </div>
            {canViewCustomers ? (
              <div className="space-y-1">
                <CustomerSearchField
                  name="customerId"
                  label="Selecciona o crea el cliente"
                  required
                  allowQuickCreate={canQuickCreateCustomers}
                  allowQuickCreateCode={canManageCustomers}
                  quickCreateLabel="Registrar cliente para este pedido"
                  value={customerId}
                  onChange={setCustomerId}
                />
              </div>
            ) : (
              <div className="space-y-1">
                <label className="space-y-1">
                  <span className="op-label">
                    Cliente comercial
                  </span>
                  <input
                    name="customerName"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="op-field px-4 py-3"
                    placeholder="Cliente, cuenta o razón social"
                  />
                  <p className="op-helper">
                    No tienes acceso al catálogo de clientes. Captura el nombre
                    comercial para continuar con el pedido.
                  </p>
                </label>
                {missingFields.includes("customerName") && (
                  <p className="text-xs text-amber-300" role="alert">
                    El nombre del cliente es obligatorio
                  </p>
                )}
              </div>
            )}
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setActiveStep("product")}
                disabled={!customerReady}
                className={cn(buttonStyles({ size: "lg" }), !customerReady && "cursor-not-allowed opacity-55")}
              >
                Continuar a producto →
              </button>
            </div>
          </section>
          ) : null}

          {activeStep === "product" ? (
            <section className="space-y-4" data-testid="sales-order-product-step">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-accent)]">Paso 2 de 3</p>
                <h2 className="text-2xl font-semibold text-[var(--text-primary)]">¿Qué necesita el cliente?</h2>
                <p className="text-sm text-[var(--text-secondary)]">Elige una familia o busca por código.</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <button type="button" onClick={() => setLineKind("PRODUCT")} className={cn("op-card op-card-interactive space-y-2 text-left", lineKind === "PRODUCT" && "border-[var(--accent)] bg-[var(--accent-soft)]")}>
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent-soft)] text-lg font-bold text-[var(--text-accent)]">M</span>
                  <p className="font-semibold text-[var(--text-primary)]">Producto directo</p>
                  <p className="text-sm text-[var(--text-muted)]">Busca manguera, conexión o acople existente sin salir del pedido.</p>
                </button>
                <button type="button" onClick={() => setLineKind("ASSEMBLY")} className={cn("op-card op-card-interactive space-y-2 text-left", lineKind === "ASSEMBLY" && "border-[var(--accent)] bg-[var(--accent-soft)]")}>
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent-soft)] text-lg font-bold text-[var(--text-accent)]">E</span>
                  <p className="font-semibold text-[var(--text-primary)]">Ensamble</p>
                  <p className="text-sm text-[var(--text-muted)]">Arma manguera + dos conexiones sin crear un SKU nuevo.</p>
                </button>
              </div>

              {orderLines.length > 0 ? (
                <section className="op-surface-muted space-y-3 p-4" data-testid="sales-order-lines">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Pedido en preparación</p>
                      <p className="text-sm text-[var(--text-primary)]">{orderLines.length} línea{orderLines.length === 1 ? "" : "s"} lista{orderLines.length === 1 ? "" : "s"}</p>
                    </div>
                    <span className="text-xs text-[var(--text-muted)]">Puedes agregar más antes de confirmar.</span>
                  </div>
                  <div className="space-y-2">
                    {orderLines.map((line) => (
                      <div key={line.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm">
                        <p className="text-[var(--text-primary)]"><span className="mr-2 text-xs font-semibold text-[var(--text-accent)]">{line.kind === "ASSEMBLY" ? "ENSAMBLE" : "PRODUCTO"}</span>{line.label}</p>
                        <button type="button" onClick={() => setOrderLines((lines) => lines.filter((item) => item.id !== line.id))} className="text-xs text-[var(--status-danger-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Quitar</button>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {lineKind === "ASSEMBLY" ? (
                <div key={assemblyDraftKey} className="op-panel space-y-4" data-testid="sales-order-assembly-configurator">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-accent)]">Ensamble configurado</p>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">Primero elige el almacén; después selecciona manguera y las dos conexiones con stock real.</p>
                  </div>
                  <label className="space-y-1 block">
                    <span className="op-label">Almacén para el ensamble</span>
                    <select name="warehouseId" required value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="op-field w-full px-4 py-3">
                      <option value="">Selecciona un almacén</option>
                      {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} - {warehouse.name}</option>)}
                    </select>
                  </label>
                  <div className="grid gap-4 md:grid-cols-2">
                    <ProductSearchField fieldKey="new-order-entry-fitting" name="entryFittingProductId" label="Conexión de entrada" productType="FITTING" warehouseId={warehouseId} requiredQty={parsePositiveDecimal(assemblyQuantity)} disabled={!warehouseId} onSelectedIdChange={setEntryFittingProductId} />
                    <ProductSearchField fieldKey="new-order-exit-fitting" name="exitFittingProductId" label="Conexión de salida" productType="FITTING" warehouseId={warehouseId} requiredQty={parsePositiveDecimal(assemblyQuantity)} disabled={!warehouseId} onSelectedIdChange={setExitFittingProductId} />
                    <div className="md:col-span-2">
                      <ProductSearchField fieldKey="new-order-hose" name="hoseProductId" label="Manguera" productType="HOSE" warehouseId={warehouseId} requiredQty={(parsePositiveDecimal(hoseLength) && parsePositiveDecimal(assemblyQuantity)) ? parsePositiveDecimal(hoseLength)! * parsePositiveDecimal(assemblyQuantity)! : null} disabled={!warehouseId} onSelectedIdChange={setHoseProductId} />
                    </div>
                    <label className="space-y-1"><span className="op-label">Longitud por ensamble</span><input name="hoseLength" type="number" min="0.0001" step="0.0001" required value={hoseLength} onChange={(e) => setHoseLength(e.target.value)} className="op-field w-full px-4 py-3" placeholder="Ej. 2.5" /></label>
                    <label className="space-y-1"><span className="op-label">Cantidad de ensambles</span><input name="assemblyQuantity" type="number" min="1" step="1" required value={assemblyQuantity} onChange={(e) => setAssemblyQuantity(e.target.value)} className="op-field w-full px-4 py-3" /></label>
                    <label className="space-y-1 md:col-span-2"><span className="op-label">Nota técnica (opcional)</span><input name="assemblyNotes" value={assemblyNotes} onChange={(e) => setAssemblyNotes(e.target.value)} className="op-field w-full px-4 py-3" placeholder="Presión, fluido, medida o aplicación" /></label>
                  </div>
                  <p className="text-sm text-[var(--text-secondary)]">El sistema reservará las piezas y generará el surtido de ensamble cuando confirmes el pedido.</p>
                  <div className="flex justify-end"><button type="button" onClick={addAssemblyLine} disabled={!assemblyReady} className={cn(buttonStyles({ size: "lg" }), !assemblyReady && "cursor-not-allowed opacity-55")}>Agregar ensamble al pedido</button></div>
                </div>
              ) : lineKind === "PRODUCT" ? (
                <div key={directDraftKey} className="op-panel space-y-4">
                  <label className="space-y-1 block">
                    <span className="op-label">Almacén para surtido</span>
                    <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="op-field w-full px-4 py-3">
                      <option value="">Selecciona un almacén</option>
                      {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} - {warehouse.name}</option>)}
                    </select>
                  </label>
                  <ProductSearchField
                    fieldKey="new-order-direct-product"
                    name="directProductId"
                    label="Producto directo"
                    warehouseId={warehouseId}
                    requiredQty={parsePositiveDecimal(String(quantity))}
                    initialProductId={orderLines.length === 0 ? selectedProduct?.id : ""}
                    disabled={!warehouseId}
                    onSelectedIdChange={setDirectProductId}
                  />
                  {selectedProduct && orderLines.length === 0 ? <div className="text-sm text-[var(--text-secondary)]"><span className="font-semibold text-[var(--text-primary)]">Sugerido:</span> {selectedProduct.sku} · {selectedProduct.name}</div> : null}
                  <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-1">
                    <span className="op-label">Cantidad</span>
                    <input type="number" min="0.0001" step="0.0001" required value={quantity} onChange={(e) => setQuantity(parsePositiveDecimal(e.target.value) || 1)} className="op-field px-4 py-3" />
                  </label>
                  <label className="space-y-1">
                    <span className="op-label">Nota (opcional)</span>
                    <input value={lineNotes} onChange={(e) => setLineNotes(e.target.value)} className="op-field px-4 py-3" placeholder="Medida, presión o aplicación" />
                  </label>
                  </div>
                  <div className="flex justify-end"><button type="button" onClick={addDirectLine} disabled={!directProductId || !parsePositiveDecimal(String(quantity))} className={cn(buttonStyles({ size: "lg" }), (!directProductId || !parsePositiveDecimal(String(quantity))) && "cursor-not-allowed opacity-55")}>Agregar producto al pedido</button></div>
                </div>
              ) : (
                <div className="op-surface-muted px-4 py-5 text-sm" role="status">
                  Elige producto directo o ensamble para continuar.
                </div>
              )}

              <div className="flex flex-wrap justify-between gap-3 pt-2">
                <button type="button" onClick={() => setActiveStep("customer")} className={buttonStyles({ variant: "secondary" })}>← Cliente</button>
                <button type="button" onClick={() => setActiveStep("delivery")} disabled={!productReady} className={cn(buttonStyles({ size: "lg" }), !productReady && "cursor-not-allowed opacity-55")}>Continuar a entrega →</button>
              </div>
            </section>
          ) : null}

          {activeStep === "delivery" ? (
          <section className="space-y-4" data-testid="sales-order-delivery-step">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-accent)]">Paso 3 de 3</p>
              <h2 className="text-2xl font-semibold text-[var(--text-primary)]">¿Cuándo y desde dónde se entrega?</h2>
              <p className="text-sm text-[var(--text-muted)]">
                Elige el almacén y la fecha prometida.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1">
                <span className="op-label">Almacén</span>
                <select
                  name="warehouseId"
                  required
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                  className="op-field px-4 py-3"
                >
                  <option value="">Selecciona un almacén</option>
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.code} - {warehouse.name}
                    </option>
                  ))}
                </select>
                {missingFields.includes("warehouseId") && (
                  <p className="text-xs text-amber-300" role="alert">
                    Selecciona un almacén para continuar
                  </p>
                )}
              </label>

              <label className="space-y-1">
                <span className="op-label">Fecha compromiso</span>
                <input
                  name="dueDate"
                  type="date"
                  required
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="op-field px-4 py-3"
                />
                {missingFields.includes("dueDate") && (
                  <p className="text-xs text-amber-300" role="alert">
                    Selecciona una fecha de compromiso válida
                  </p>
                )}
              </label>

              <label className="space-y-1 md:col-span-2">
                <span className="op-label">Notas del pedido</span>
                <textarea
                  name="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="op-field min-h-24 px-4 py-3"
                  placeholder="Contexto comercial, prioridad o consideraciones del cliente"
                />
              </label>
            </div>
            <details className="op-surface-muted p-4">
              <summary className="cursor-pointer text-sm font-semibold text-[var(--text-primary)]">Ayuda para elegir producto</summary>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={catalogHref} className={buttonStyles({ variant: "secondary", size: "sm" })}>Buscar manguera o conexión</Link>
                <Link href={availabilityHref} className={buttonStyles({ variant: "secondary", size: "sm" })}>Ver disponibilidad</Link>
                <Link href={equivalencesHref} className={buttonStyles({ variant: "secondary", size: "sm" })}>Ver equivalencias</Link>
              </div>
            </details>

            <div className="flex flex-wrap justify-between gap-3">
              <button type="button" onClick={() => setActiveStep("product")} className={buttonStyles({ variant: "secondary" })}>← Producto</button>
              <button type="submit" disabled={readinessState !== "ready"} className={cn(buttonStyles({ size: "lg" }), readinessState !== "ready" && "cursor-not-allowed opacity-55")} data-testid="create-order-button">
                {readinessState === "ready" ? "Crear pedido" : "Completa lo que falta"}
              </button>
            </div>
          </section>
          ) : null}

          <Link href="/production/requests" className="op-link inline-flex rounded-[var(--radius-md)] px-2 py-1 text-sm">Cancelar pedido</Link>
        </div>
      </SectionCard>
    </form>
  );
}

function parsePositiveDecimal(value: string) {
  if (!value) return null;
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}
