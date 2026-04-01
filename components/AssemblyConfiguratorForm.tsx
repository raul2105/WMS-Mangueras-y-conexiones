"use client";

import { useEffect, useRef, useState } from "react";
import type { ProductSearchMatch } from "@/lib/product-search";

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
};

type ProductSearchResponse = {
  results: ProductSearchMatch[];
  selected: ProductSearchMatch | null;
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

function formatProductLabel(product: ProductSearchMatch) {
  return `${product.sku} - ${product.name}`;
}

function formatQty(value: number) {
  return new Intl.NumberFormat("es-MX", {
    maximumFractionDigits: 4,
  }).format(value);
}

type WarehouseComboboxProps = {
  warehouses: WarehouseOption[];
  warehouseId: string;
  onWarehouseIdChange: (warehouseId: string) => void;
};

function WarehouseCombobox({
  warehouses,
  warehouseId,
  onWarehouseIdChange,
}: WarehouseComboboxProps) {
  const selectedWarehouse = warehouses.find((warehouse) => warehouse.id === warehouseId) ?? null;
  const [inputValue, setInputValue] = useState(selectedWarehouse ? formatWarehouseLabel(selectedWarehouse) : "");
  const [isOpen, setIsOpen] = useState(false);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (selectedWarehouse) {
      setInputValue(formatWarehouseLabel(selectedWarehouse));
    }
  }, [selectedWarehouse]);

  useEffect(() => () => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
  }, []);

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
            value={inputValue}
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
            className="w-full px-4 py-3 glass rounded-lg"
          />
          {(warehouseId || inputValue) && (
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

        {!warehouseId && (
          <p className="text-xs text-slate-500">
            Selecciona un almacén antes de buscar conexiones y mangueras.
          </p>
        )}
      </div>
    </label>
  );
}

type AssemblyProductSearchFieldProps = {
  fieldKey: string;
  name: string;
  label: string;
  productType: "FITTING" | "HOSE";
  warehouseId: string;
  requiredQty: number | null;
  initialProductId: string;
  initialSelection: ProductSearchMatch | null;
  disabled: boolean;
};

function AssemblyProductSearchField({
  fieldKey,
  name,
  label,
  productType,
  warehouseId,
  requiredQty,
  initialProductId,
  initialSelection,
  disabled,
}: AssemblyProductSearchFieldProps) {
  const [query, setQuery] = useState(initialSelection ? formatProductLabel(initialSelection) : "");
  const [selectedId, setSelectedId] = useState(initialProductId);
  const [selected, setSelected] = useState<ProductSearchMatch | null>(initialSelection);
  const [results, setResults] = useState<ProductSearchMatch[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchRequestRef = useRef(0);
  const selectionRequestRef = useRef(0);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedLabel = selected ? formatProductLabel(selected) : "";

  useEffect(() => () => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
  }, []);

  useEffect(() => {
    if (!selectedId || !warehouseId) return;

    const requestId = ++selectionRequestRef.current;
    const params = new URLSearchParams({
      selectedId,
      type: productType,
      warehouseId,
    });

    fetch(`/api/products/search?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("SEARCH_SELECTION_FAILED");
        return response.json() as Promise<ProductSearchResponse>;
      })
      .then((payload) => {
        if (requestId !== selectionRequestRef.current) return;
        if (!payload.selected) {
          setSelected(null);
          setSelectedId("");
          return;
        }

        const refreshedSelection = payload.selected;
        setSelected(refreshedSelection);
        setSearchError(null);
        setQuery((current) => {
          const currentTrimmed = current.trim();
          if (!currentTrimmed) return formatProductLabel(refreshedSelection);
          if (currentTrimmed === selectedLabel) {
            return formatProductLabel(refreshedSelection);
          }
          return current;
        });
      })
      .catch(() => {
        if (requestId !== selectionRequestRef.current) return;
        setSearchError("No se pudo actualizar el stock del producto seleccionado.");
      });
  }, [selectedId, warehouseId, productType, selectedLabel]);

  useEffect(() => {
    const trimmed = query.trim();
    if (disabled || !warehouseId) {
      setResults([]);
      setIsLoading(false);
      setSearchError(null);
      return;
    }

    if (!trimmed || (selectedId && selected && trimmed === selectedLabel)) {
      setResults([]);
      setIsLoading(false);
      setSearchError(null);
      return;
    }

    if (trimmed.length < 2) {
      setResults([]);
      setIsLoading(false);
      setSearchError(null);
      return;
    }

    const timeoutId = setTimeout(() => {
      const requestId = ++searchRequestRef.current;
      const params = new URLSearchParams({
        q: trimmed,
        type: productType,
        warehouseId,
      });

      if (requiredQty) {
        params.set("requiredQty", String(requiredQty));
      }

      setIsLoading(true);
      fetch(`/api/products/search?${params.toString()}`)
        .then(async (response) => {
          if (!response.ok) throw new Error("SEARCH_FAILED");
          return response.json() as Promise<ProductSearchResponse>;
        })
        .then((payload) => {
          if (requestId !== searchRequestRef.current) return;
          setResults(payload.results ?? []);
          setSearchError((payload.results ?? []).length === 0 ? "No se encontraron coincidencias con stock suficiente." : null);
        })
        .catch(() => {
          if (requestId !== searchRequestRef.current) return;
          setResults([]);
          setSearchError("No se pudo consultar el catálogo de ensamble.");
        })
        .finally(() => {
          if (requestId === searchRequestRef.current) {
            setIsLoading(false);
          }
        });
    }, 220);

    return () => clearTimeout(timeoutId);
  }, [query, selectedId, selectedLabel, warehouseId, productType, requiredQty, disabled]);

  const hasRequiredQty = typeof requiredQty === "number" && Number.isFinite(requiredQty) && requiredQty > 0;
  const isInsufficient = Boolean(
    selected &&
      warehouseId &&
      (hasRequiredQty ? selected.totalAvailable < requiredQty! : selected.totalAvailable <= 0)
  );

  return (
    <div className="space-y-2">
      <span className="text-sm text-slate-400">{label}</span>
      <input type="hidden" name={name} value={selectedId} />
      <input
        data-testid={`assembly-${fieldKey}-input`}
        value={query}
        disabled={disabled}
        onChange={(event) => {
          const next = event.target.value;
          setQuery(next);
          setIsOpen(true);
          setSearchError(null);
          searchRequestRef.current += 1;
          if (selectedId) {
            setSelectedId("");
            setSelected(null);
          }
        }}
        onFocus={() => {
          if (!disabled) setIsOpen(true);
        }}
        onBlur={() => {
          blurTimerRef.current = setTimeout(() => setIsOpen(false), 120);
        }}
        placeholder={disabled ? "Selecciona un almacén para habilitar la búsqueda" : "Busca por SKU, nombre o atributo"}
        className="w-full px-4 py-3 glass rounded-lg disabled:opacity-60 disabled:cursor-not-allowed"
      />

      {isLoading && <p className="text-xs text-slate-500">Buscando coincidencias operativas...</p>}
      {!isLoading && !disabled && query.trim().length > 0 && query.trim().length < 2 && (
        <p className="text-xs text-slate-500">Escribe al menos 2 caracteres para buscar.</p>
      )}
      {searchError && <p className="text-xs text-amber-300">{searchError}</p>}

      {isOpen && results.length > 0 && (
        <div className="grid grid-cols-1 gap-2">
          {results.map((option) => (
            <button
              type="button"
              key={`${fieldKey}-${option.id}`}
              className="text-left p-3 rounded-lg border border-white/10 hover:border-cyan-400/40 hover:bg-white/5 transition-colors"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                searchRequestRef.current += 1;
                setSelected(option);
                setSelectedId(option.id);
                setQuery(formatProductLabel(option));
                setResults([]);
                setSearchError(null);
                setIsOpen(false);
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-sm text-cyan-300">{option.sku}</p>
                  <p className="text-sm text-slate-100 truncate">{option.name}</p>
                  <p className="text-xs text-slate-500">
                    {[option.referenceCode, option.brand, option.category?.name, option.subcategory].filter(Boolean).join(" • ") || "Sin metadatos adicionales"}
                  </p>
                </div>
                <span className="text-xs font-semibold text-green-300">
                  {formatQty(option.totalAvailable)} disp.
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div
          data-testid={`assembly-${fieldKey}-selected`}
          className={`rounded-lg border p-3 space-y-2 ${
            isInsufficient
              ? "border-red-500/30 bg-red-500/5"
              : "border-cyan-400/20 bg-cyan-500/5"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-sm text-cyan-300">{selected.sku}</p>
              <p className="text-sm text-slate-100">{selected.name}</p>
              <p className="text-xs text-slate-500">
                {[selected.referenceCode, selected.brand, selected.category?.name, selected.subcategory].filter(Boolean).join(" • ") || "Sin metadatos adicionales"}
              </p>
            </div>
            <button
              type="button"
              className="px-2 py-1 rounded border border-white/10 text-xs text-slate-300 hover:text-white hover:border-cyan-400/40"
              onClick={() => {
                searchRequestRef.current += 1;
                setSelected(null);
                setSelectedId("");
                setQuery("");
                setResults([]);
                setSearchError(null);
              }}
            >
              Cambiar
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
            <p className={isInsufficient ? "text-red-200" : "text-slate-300"}>
              Disponible en almacén: {formatQty(selected.totalAvailable)}
            </p>
            <p className={isInsufficient ? "text-red-200" : "text-slate-300"}>
              {hasRequiredQty
                ? `Requerido para ensamble: ${formatQty(requiredQty!)}`
                : "Stock filtrado con base en disponibilidad actual"}
            </p>
          </div>
          {isInsufficient && (
            <p className="text-xs text-red-200">
              La selección se conserva, pero ya no cumple con el stock suficiente para el ensamble actual.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function AssemblyConfiguratorForm({
  warehouses,
  initialValues,
  initialSelections,
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
      <h2 className="text-lg font-semibold">1) Configurar ensamble</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <WarehouseCombobox
          warehouses={warehouses}
          warehouseId={warehouseId}
          onWarehouseIdChange={setWarehouseId}
        />

        <AssemblyProductSearchField
          fieldKey="entry-fitting"
          name="entryFittingProductId"
          label="Conexión entrada"
          productType="FITTING"
          warehouseId={warehouseId}
          requiredQty={fittingRequiredQty}
          initialProductId={initialValues.entryFittingProductId}
          initialSelection={initialSelections.entryFitting}
          disabled={!warehouseId}
        />

        <AssemblyProductSearchField
          fieldKey="exit-fitting"
          name="exitFittingProductId"
          label="Conexión salida"
          productType="FITTING"
          warehouseId={warehouseId}
          requiredQty={fittingRequiredQty}
          initialProductId={initialValues.exitFittingProductId}
          initialSelection={initialSelections.exitFitting}
          disabled={!warehouseId}
        />

        <div className="md:col-span-2">
          <AssemblyProductSearchField
            fieldKey="hose"
            name="hoseProductId"
            label="Manguera"
            productType="HOSE"
            warehouseId={warehouseId}
            requiredQty={hoseRequiredQty}
            initialProductId={initialValues.hoseProductId}
            initialSelection={initialSelections.hose}
            disabled={!warehouseId}
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
          <span className="text-sm text-slate-400">Notas</span>
          <textarea
            name="notes"
            defaultValue={initialValues.notes}
            className="w-full px-4 py-3 glass rounded-lg min-h-[80px]"
          />
        </label>
      </div>

      <div className="flex justify-end">
        <button type="submit" className="btn-primary">
          Previsualizar disponibilidad
        </button>
      </div>
    </form>
  );
}
