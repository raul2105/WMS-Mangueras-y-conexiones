"use client";

import { useEffect, useRef, useState } from "react";
import type { ProductSearchMatch } from "@/lib/product-search";
import ProductSearchField from "@/components/ProductSearchField";

type WarehouseOption = {
  id: string;
  code: string;
  name: string;
};

type AssemblyFormValues = {
  warehouseId: string;
  entryFittingProductId: string;
  hoseProductId: string;
  exitFittingProductId: string;
  hoseLength: string;
  assemblyQuantity: string;
  sourceDocumentRef: string;
  notes: string;
};

type Props = {
  warehouses: WarehouseOption[];
  initialValues: AssemblyFormValues;
  initialSelections: {
    entryFitting: ProductSearchMatch | null;
    hose: ProductSearchMatch | null;
    exitFitting: ProductSearchMatch | null;
  };
  hiddenFields?: Array<{ name: string; value: string }>;
  warehouseLocked?: boolean;
  title?: string;
  submitLabel?: string;
  notesLabel?: string;
};

function parsePositiveDecimal(value: string) {
  if (!value) return null;
  const parsed = Number(String(value).replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function formatWarehouseLabel(warehouse: WarehouseOption) {
  return `${warehouse.name} (${warehouse.code})`;
}

type WarehouseComboboxProps = {
  warehouses: WarehouseOption[];
  warehouseId: string;
  onWarehouseIdChange: (warehouseId: string) => void;
  locked?: boolean;
};

function WarehouseCombobox({
  warehouses,
  warehouseId,
  onWarehouseIdChange,
  locked = false,
}: WarehouseComboboxProps) {
  const selectedWarehouse = warehouses.find((warehouse) => warehouse.id === warehouseId) ?? null;
  const [inputValue, setInputValue] = useState(selectedWarehouse ? formatWarehouseLabel(selectedWarehouse) : "");
  const [isOpen, setIsOpen] = useState(false);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
  }, []);

  const displayValue = !isOpen && selectedWarehouse ? formatWarehouseLabel(selectedWarehouse) : inputValue;
  const normalized = inputValue.trim().toLowerCase();
  const filteredWarehouses = warehouses
    .filter((warehouse) => {
      if (!normalized) return true;
      return (
        warehouse.name.toLowerCase().includes(normalized) ||
        warehouse.code.toLowerCase().includes(normalized)
      );
    })
    .slice(0, 8);

  return (
    <label className="space-y-2 md:col-span-2 block">
      <span className="text-sm text-slate-400">Almacén</span>
      <input type="hidden" name="warehouseId" value={warehouseId} />
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <input
            data-testid="assembly-warehouse-input"
            value={displayValue}
            disabled={locked}
            onChange={(event) => {
              const next = event.target.value;
              setInputValue(next);
              setIsOpen(true);
              if (!selectedWarehouse || next !== formatWarehouseLabel(selectedWarehouse)) {
                onWarehouseIdChange("");
              }
            }}
            onFocus={() => setIsOpen(true)}
            onBlur={() => {
              blurTimerRef.current = setTimeout(() => setIsOpen(false), 120);
            }}
            placeholder="Busca por nombre o código"
            className="w-full px-4 py-3 glass rounded-lg disabled:opacity-60 disabled:cursor-not-allowed"
          />
          {!locked && (warehouseId || inputValue) && (
            <button
              type="button"
              className="px-3 py-3 rounded-lg border border-white/10 text-slate-300 hover:text-white hover:border-cyan-400/40"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setInputValue("");
                setIsOpen(false);
                onWarehouseIdChange("");
              }}
            >
              Limpiar
            </button>
          )}
        </div>

        {isOpen && filteredWarehouses.length > 0 && (
          <div className="grid grid-cols-1 gap-2">
            {filteredWarehouses.map((warehouse) => (
              <button
                type="button"
                key={warehouse.id}
                className={`text-left p-3 rounded-lg border transition-colors ${
                  warehouse.id === warehouseId
                    ? "border-cyan-400/50 bg-cyan-500/10 text-cyan-100"
                    : "border-white/10 hover:border-cyan-400/40 hover:bg-white/5"
                }`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onWarehouseIdChange(warehouse.id);
                  setInputValue(formatWarehouseLabel(warehouse));
                  setIsOpen(false);
                }}
              >
                <p className="text-sm text-slate-100">{warehouse.name}</p>
                <p className="text-xs text-slate-400">{warehouse.code}</p>
              </button>
            ))}
          </div>
        )}

        {locked ? (
          <p className="text-xs text-slate-500">
            El almacen queda definido por el paso comercial de la orden.
          </p>
        ) : !warehouseId ? (
          <p className="text-xs text-slate-500">
            Selecciona un almacén antes de buscar conexiones y mangueras.
          </p>
        ) : null}
      </div>
    </label>
  );
}

export default function AssemblyConfiguratorForm({
  warehouses,
  initialValues,
  initialSelections,
  hiddenFields = [],
  warehouseLocked = false,
  title = "1) Configurar ensamble",
  submitLabel = "Previsualizar disponibilidad",
  notesLabel = "Notas",
}: Props) {
  const [warehouseId, setWarehouseId] = useState(initialValues.warehouseId);
  const [hoseLength, setHoseLength] = useState(initialValues.hoseLength);
  const [assemblyQuantity, setAssemblyQuantity] = useState(initialValues.assemblyQuantity);

  const assemblyQtyValue = parsePositiveDecimal(assemblyQuantity);
  const hoseLengthValue = parsePositiveDecimal(hoseLength);
  const fittingRequiredQty = assemblyQtyValue;
  const hoseRequiredQty = assemblyQtyValue && hoseLengthValue ? assemblyQtyValue * hoseLengthValue : null;

  return (
    <form method="GET" className="glass-card space-y-5">
      {hiddenFields.map((field) => (
        <input key={field.name} type="hidden" name={field.name} value={field.value} />
      ))}
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <WarehouseCombobox
          warehouses={warehouses}
          warehouseId={warehouseId}
          onWarehouseIdChange={setWarehouseId}
          locked={warehouseLocked}
        />

        <ProductSearchField
          fieldKey="assembly-entry-fitting"
          name="entryFittingProductId"
          label="Conexión entrada"
          productType="FITTING"
          warehouseId={warehouseId}
          requiredQty={fittingRequiredQty}
          initialProductId={initialValues.entryFittingProductId}
          initialSelection={initialSelections.entryFitting}
          disabled={!warehouseId}
          searchErrorMessage="No se pudo consultar el catálogo de ensamble."
          requiredLabel="Requerido para ensamble"
          insufficientMessage="La selección se conserva, pero ya no cumple con el stock suficiente para el ensamble actual."
        />

        <ProductSearchField
          fieldKey="assembly-exit-fitting"
          name="exitFittingProductId"
          label="Conexión salida"
          productType="FITTING"
          warehouseId={warehouseId}
          requiredQty={fittingRequiredQty}
          initialProductId={initialValues.exitFittingProductId}
          initialSelection={initialSelections.exitFitting}
          disabled={!warehouseId}
          searchErrorMessage="No se pudo consultar el catálogo de ensamble."
          requiredLabel="Requerido para ensamble"
          insufficientMessage="La selección se conserva, pero ya no cumple con el stock suficiente para el ensamble actual."
        />

        <div className="md:col-span-2">
          <ProductSearchField
            fieldKey="assembly-hose"
            name="hoseProductId"
            label="Manguera"
            productType="HOSE"
            warehouseId={warehouseId}
            requiredQty={hoseRequiredQty}
            initialProductId={initialValues.hoseProductId}
            initialSelection={initialSelections.hose}
            disabled={!warehouseId}
            searchErrorMessage="No se pudo consultar el catálogo de ensamble."
            requiredLabel="Requerido para ensamble"
            insufficientMessage="La selección se conserva, pero ya no cumple con el stock suficiente para el ensamble actual."
          />
        </div>

        <label className="space-y-1">
          <span className="text-sm text-slate-400">Longitud por ensamble</span>
          <input
            name="hoseLength"
            value={hoseLength}
            required
            type="number"
            min={0.0001}
            step="0.0001"
            onChange={(event) => setHoseLength(event.target.value)}
            className="w-full px-4 py-3 glass rounded-lg"
          />
        </label>

        <label className="space-y-1">
          <span className="text-sm text-slate-400">Cantidad de ensambles</span>
          <input
            name="assemblyQuantity"
            value={assemblyQuantity}
            required
            type="number"
            min={0.0001}
            step="0.0001"
            onChange={(event) => setAssemblyQuantity(event.target.value)}
            className="w-full px-4 py-3 glass rounded-lg"
          />
        </label>

        <label className="space-y-1">
          <span className="text-sm text-slate-400">Documento fuente</span>
          <input
            name="sourceDocumentRef"
            defaultValue={initialValues.sourceDocumentRef}
            className="w-full px-4 py-3 glass rounded-lg"
          />
        </label>

        <label className="space-y-1 md:col-span-2">
          <span className="text-sm text-slate-400">{notesLabel}</span>
          <textarea
            name="notes"
            defaultValue={initialValues.notes}
            className="w-full px-4 py-3 glass rounded-lg min-h-[80px]"
          />
        </label>
      </div>

      <div className="flex justify-end">
        <button type="submit" className="btn-primary">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
