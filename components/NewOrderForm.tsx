"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import CustomerSearchField from "@/components/CustomerSearchField";
import { SectionCard } from "@/components/ui/section-card";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { parseDueDate } from "@/lib/schemas/wms";

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
  invalidProductContext: boolean;
  catalogHref: string;
  availabilityHref: string;
  equivalencesHref: string;
  canViewCustomers: boolean;
  canManageCustomers: boolean;
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
  invalidProductContext,
  catalogHref,
  availabilityHref,
  equivalencesHref,
  canViewCustomers,
  canManageCustomers,
  error,
}: NewOrderFormProps) {
  const [customerId, setCustomerId] = useState(initialCustomerId || "");
  const [customerName, setCustomerName] = useState(initialCustomerName || "");
  const [warehouseId, setWarehouseId] = useState(initialWarehouseId || "");
  const [dueDate, setDueDate] = useState(initialDueDate || "");
  const [quantity, setQuantity] = useState(initialQuantity || 1);
  const [lineNotes, setLineNotes] = useState(initialLineNotes || "");
  const [notes, setNotes] = useState("");
  const [serverError] = useState<string | undefined>(error);

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

    return missing;
  })();

  const hasProductContext = Boolean(selectedProduct || (hasCommercialContext && !invalidProductContext));
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

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <SectionCard
        title="Captura comercial"
        description="Empieza por el cliente, agrega contexto de producto solo si existe y termina el pedido sin abrir otra pantalla."
      >
        <div className="space-y-5">
          {serverError ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {serverError}
            </div>
          ) : null}

          {hasCommercialContext ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
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
                    <p className="text-lg font-semibold text-white">
                      {selectedProduct.name}
                    </p>
                    <div className="grid gap-2 text-sm text-slate-200 sm:grid-cols-2">
                      <p>
                        <span className="text-slate-400">SKU:</span>{" "}
                        <span className="font-mono">{selectedProduct.sku}</span>
                      </p>
                      {selectedProduct?.referenceCode ? (
                        <p>
                          <span className="text-slate-400">Referencia:</span>{" "}
                          <span className="font-mono">
                            {selectedProduct?.referenceCode}
                          </span>
                        </p>
                      ) : null}
                      <p>
                        <span className="text-slate-400">Stock disponible:</span>{" "}
                        {selectedProduct.totalAvailable.toLocaleString("es-MX")}
                      </p>
                      {selectedProduct.unitLabel ? (
                        <p>
                          <span className="text-slate-400">Unidad:</span>{" "}
                          {selectedProduct.unitLabel}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-4 text-sm text-cyan-50">
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
                  <p className="mt-2 text-lg font-semibold text-white">
                    Búsqueda comercial: {displayQuery}
                  </p>
                  <p className="mt-2 text-sm text-slate-300">
                    No hay un producto resuelto todavía. La búsqueda se
                    mantiene como referencia para continuar el pedido manual.
                  </p>
                </div>
              ) : null}

              {originalProduct ? (
                <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                    Sustituye a
                  </p>
                  <p className="mt-1 font-semibold text-white">
                    {originalProduct.name}
                  </p>
                  <p className="font-mono text-xs text-slate-400">
                    {originalProduct.sku}
                  </p>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Link
                  href="#captura-cliente"
                  className={buttonStyles({ size: "sm" })}
                >
                  {selectedProduct
                    ? "Continuar con este producto"
                    : "Continuar con la captura"}
                </Link>
                <Link
                  href={catalogHref}
                  className={buttonStyles({ variant: "secondary", size: "sm" })}
                >
                  Cambiar producto
                </Link>
                <Link
                  href="/production/requests/new"
                  className={buttonStyles({ variant: "secondary", size: "sm" })}
                >
                  Quitar selección
                </Link>
              </div>
            </div>
          ) : null}

          <section id="captura-cliente" className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-white">1. Cliente</h2>
                <p className="text-sm text-slate-400">
                  Empieza por la cuenta comercial. Si no existe, usa el alta
                  rápida para continuar sin bloquear el pedido.
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
                  allowQuickCreate={canManageCustomers}
                  value={customerId}
                  onChange={setCustomerId}
                />
                {missingFields.includes("customerId") && (
                  <p className="text-xs text-amber-300" role="alert">
                    Selecciona un cliente del catálogo para continuar
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                <label className="space-y-1">
                  <span className="text-sm text-slate-400">
                    Cliente comercial
                  </span>
                  <input
                    name="customerName"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white"
                    placeholder="Cliente, cuenta o razón social"
                  />
                  <p className="text-xs text-slate-500">
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
            {canViewCustomers && canManageCustomers ? (
              <p className="text-xs text-slate-400">
                ¿No encuentras al cliente? Regístralo para continuar con el pedido.
              </p>
            ) : null}
          </section>

          {selectedProduct ? (
            <section className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    2. Línea sugerida
                  </h2>
                  <p className="text-sm text-slate-300">
                    El producto seleccionado puede guardarse como la primera
                    línea editable del pedido.
                  </p>
                </div>
                <Badge variant="accent">Editable</Badge>
              </div>

              <input
                type="hidden"
                name="lineProductId"
                value={selectedProduct.id}
              />

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.7fr)_minmax(0,1fr)]">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                    Producto seleccionado
                  </p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    {selectedProduct.name}
                  </p>
                  <div className="mt-3 space-y-2 text-sm text-slate-300">
                    <p>
                      <span className="text-slate-400">SKU:</span>{" "}
                      <span className="font-mono">{selectedProduct.sku}</span>
                    </p>
                    {selectedProduct.unitLabel ? (
                      <p>
                        <span className="text-slate-400">Unidad:</span>{" "}
                        {selectedProduct.unitLabel}
                      </p>
                    ) : null}
                    <p>
                      <span className="text-slate-400">Fuente:</span>{" "}
                      {sourceLabel}
                    </p>
                    <p>
                      <span className="text-slate-400">Acción sugerida:</span>{" "}
                      Guarda el pedido para continuar con el cliente y el
                      detalle.
                    </p>
                  </div>
                </div>

                <label className="space-y-1">
                  <span className="text-sm text-slate-400">
                    Cantidad sugerida
                  </span>
                  <input
                    name="lineRequestedQty"
                    type="number"
                    min="0.0001"
                    step="0.0001"
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(parsePositiveDecimal(e.target.value) || 1)}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white"
                  />
                  <p className="text-xs text-slate-500">
                    Se convertirá en la cantidad de la primera línea editable
                    del pedido.
                  </p>
                  {missingFields.includes("lineRequestedQty") && (
                    <p className="text-xs text-amber-300" role="alert">
                      La cantidad debe ser mayor que cero
                    </p>
                  )}
                </label>

                <label className="space-y-1">
                  <span className="text-sm text-slate-400">
                    Notas de la línea
                  </span>
                  <textarea
                    name="lineNotes"
                    value={lineNotes}
                    onChange={(e) => setLineNotes(e.target.value)}
                    className="min-h-30 w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white"
                    placeholder="Opcional: especificaciones, urgencia o contexto comercial"
                  />
                </label>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  href="#captura-cliente"
                  className={buttonStyles({ size: "sm" })}
                >
                  Continuar con este producto
                </Link>
                <Link
                  href={catalogHref}
                  className={buttonStyles({ variant: "secondary", size: "sm" })}
                >
                  Cambiar producto
                </Link>
                <Link
                  href="/production/requests/new"
                  className={buttonStyles({ variant: "secondary", size: "sm" })}
                >
                  Quitar selección
                </Link>
              </div>
            </section>
          ) : null}

          <section className="space-y-3">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-white">
                {selectedProduct ? "3. Datos del pedido" : "2. Datos del pedido"}
              </h2>
              <p className="text-sm text-slate-400">
                Confirma almacén, fecha compromiso y notas del pedido.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-sm text-slate-400">Almacén</span>
                <select
                  name="warehouseId"
                  required
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white"
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
                <span className="text-sm text-slate-400">Fecha compromiso</span>
                <input
                  name="dueDate"
                  type="date"
                  required
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white"
                />
                {missingFields.includes("dueDate") && (
                  <p className="text-xs text-amber-300" role="alert">
                    Selecciona una fecha de compromiso válida
                  </p>
                )}
              </label>

              <label className="space-y-1 md:col-span-2">
                <span className="text-sm text-slate-400">Notas del pedido</span>
                <textarea
                  name="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="min-h-24 w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white"
                  placeholder="Contexto comercial, prioridad o consideraciones del cliente"
                />
              </label>
            </div>
          </section>

          <details className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-white">
              Herramientas de apoyo
            </summary>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={catalogHref}
                className={buttonStyles({ variant: "secondary", size: "sm" })}
              >
                Buscar en catálogo
              </Link>
              <Link
                href={availabilityHref}
                className={buttonStyles({ variant: "secondary", size: "sm" })}
              >
                Ver disponibilidad
              </Link>
              <Link
                href={equivalencesHref}
                className={buttonStyles({ variant: "secondary", size: "sm" })}
              >
                Revisar equivalencias
              </Link>
            </div>
          </details>

          <div className="flex justify-end gap-3">
            <Link
              href="/production/requests"
              className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:text-white"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={readinessState !== "ready"}
              className={cn(
                "btn-primary",
                readinessState !== "ready" && "opacity-50 cursor-not-allowed"
              )}
              data-testid="create-order-button"
            >
              {readinessState === "ready" ? "Crear pedido" : "Completa los campos requeridos"}
            </button>
          </div>
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