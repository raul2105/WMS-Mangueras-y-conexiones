"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useRef, useState } from "react";
import type { ProductSearchMatch } from "@/lib/product-search";

type ProductSearchResponse = {
  results: ProductSearchMatch[];
  selected: ProductSearchMatch | null;
  nextCursor?: string | null;
};

type Props = {
  fieldKey: string;
  name: string;
  label: string;
  warehouseId: string;
  requiredQty: number | null;
  initialProductId?: string;
  initialSelection?: ProductSearchMatch | null;
  disabled?: boolean;
  placeholder?: string;
  productType?: "FITTING" | "HOSE";
  emptyWarehouseMessage?: string;
  minCharsMessage?: string;
  loadingMessage?: string;
  noResultsMessage?: string;
  searchErrorMessage?: string;
  availabilityLabel?: string;
  requiredLabel?: string;
  insufficientMessage?: string;
  onSelectedIdChange?: (selectedId: string) => void;
};

export function formatProductLabel(product: ProductSearchMatch) {
  return `${product.sku} - ${product.name}`;
}

function formatQty(value: number) {
  return new Intl.NumberFormat("es-MX", {
    maximumFractionDigits: 4,
  }).format(value);
}

export default function ProductSearchField({
  fieldKey,
  name,
  label,
  warehouseId,
  requiredQty,
  initialProductId = "",
  initialSelection = null,
  disabled = false,
  placeholder = "Busca por SKU, nombre o atributo",
  productType,
  emptyWarehouseMessage = "Selecciona un almacén para habilitar la búsqueda.",
  minCharsMessage = "Escribe al menos 3 caracteres para buscar.",
  loadingMessage = "Buscando coincidencias operativas...",
  noResultsMessage = "No se encontraron coincidencias con stock suficiente.",
  searchErrorMessage = "No se pudo consultar el catálogo.",
  availabilityLabel = "Disponible en almacén",
  requiredLabel = "Stock filtrado con base en disponibilidad actual",
  insufficientMessage = "La selección se conserva, pero ya no cumple con el stock suficiente para la cantidad actual.",
  onSelectedIdChange,
}: Props) {
  const [query, setQuery] = useState(initialSelection ? formatProductLabel(initialSelection) : "");
  const [selectedId, setSelectedId] = useState(initialProductId);
  const [selected, setSelected] = useState<ProductSearchMatch | null>(initialSelection);
  const [results, setResults] = useState<ProductSearchMatch[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const searchRequestRef = useRef(0);
  const selectionRequestRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const searchCacheRef = useRef(new Map<string, ProductSearchResponse>());
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedLabel = selected ? formatProductLabel(selected) : "";
  const trimmedQuery = query.trim();
  const isSelectedQuery = Boolean(selectedId && selectedLabel && trimmedQuery === selectedLabel);
  const shouldSearch = !disabled && Boolean(warehouseId) && trimmedQuery.length >= 3 && !isSelectedQuery;
  const isLoadingMore = Boolean(cursor) && isLoading;

  useEffect(() => {
    onSelectedIdChange?.(selectedId);
  }, [onSelectedIdChange, selectedId]);

  useEffect(() => () => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    abortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!selectedId || !warehouseId) return;

    const requestId = ++selectionRequestRef.current;
    const params = new URLSearchParams({
      selectedId,
      warehouseId,
    });

    if (productType) {
      params.set("type", productType);
    }

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
  }, [productType, selectedId, selectedLabel, warehouseId]);

  useEffect(() => {
    if (!shouldSearch) {
      searchRequestRef.current += 1;
      abortRef.current?.abort();
      setNextCursor(null);
      setCursor(null);
      return;
    }

    const cacheKey = [
      trimmedQuery.toLowerCase(),
      warehouseId,
      productType ?? "",
      requiredQty ?? "",
    ].join("|");

    const cached = !cursor ? searchCacheRef.current.get(cacheKey) : null;
    if (cached && !cursor) {
      setResults(cached.results ?? []);
      setSearchError((cached.results ?? []).length === 0 ? noResultsMessage : null);
      setNextCursor(cached.nextCursor ?? null);
      setIsLoading(false);
      return;
    }

    const timeoutId = setTimeout(() => {
      const requestId = ++searchRequestRef.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const params = new URLSearchParams({
        q: trimmedQuery,
        warehouseId,
      });
      if (cursor) {
        params.set("cursor", cursor);
      }

      if (productType) {
        params.set("type", productType);
      }

      if (requiredQty) {
        params.set("requiredQty", String(requiredQty));
      }

      setIsLoading(true);
      fetch(`/api/products/search?${params.toString()}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error("SEARCH_FAILED");
          return response.json() as Promise<ProductSearchResponse>;
        })
        .then((payload) => {
          if (requestId !== searchRequestRef.current) return;
          if (!cursor) {
            searchCacheRef.current.set(cacheKey, payload);
          }
          const incoming = payload.results ?? [];
          setResults((current) => {
            if (!cursor) return incoming;
            const merged = [...current];
            for (const row of incoming) {
              if (!merged.some((item) => item.id === row.id)) {
                merged.push(row);
              }
            }
            return merged;
          });
          setSearchError((incoming ?? []).length === 0 && !cursor ? noResultsMessage : null);
          setNextCursor(payload.nextCursor ?? null);
        })
        .catch((error) => {
          if (requestId !== searchRequestRef.current) return;
          if (error instanceof Error && error.name === "AbortError") return;
          setResults([]);
          setSearchError(searchErrorMessage);
        })
        .finally(() => {
          if (requestId === searchRequestRef.current) {
            setIsLoading(false);
          }
        });
    }, 400);

    return () => clearTimeout(timeoutId);
  }, [cursor, noResultsMessage, productType, requiredQty, searchErrorMessage, shouldSearch, trimmedQuery, warehouseId]);

  const effectiveMinCharsMessage = minCharsMessage;

  const hasRequiredQty = typeof requiredQty === "number" && Number.isFinite(requiredQty) && requiredQty > 0;
  const isInsufficient = Boolean(
    selected &&
      warehouseId &&
      (hasRequiredQty ? selected.totalAvailable < requiredQty! : selected.totalAvailable <= 0)
  );
  const visibleResults = shouldSearch ? results : [];
  const visibleIsLoading = shouldSearch ? isLoading : false;
  const visibleSearchError = shouldSearch ? searchError : null;

  return (
    <div className="space-y-2">
      <span className="text-sm text-slate-400">{label}</span>
      <input type="hidden" name={name} value={selectedId} />
      <input
        data-testid={`${fieldKey}-input`}
        value={query}
        disabled={disabled}
        onChange={(event) => {
          const next = event.target.value;
          setQuery(next);
          setIsOpen(true);
          setSearchError(null);
          searchRequestRef.current += 1;
          setCursor(null);
          setNextCursor(null);
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
        placeholder={disabled ? emptyWarehouseMessage : placeholder}
        className="w-full px-4 py-3 glass rounded-lg disabled:opacity-60 disabled:cursor-not-allowed"
      />

      {visibleIsLoading && <p className="text-xs text-slate-500">{loadingMessage}</p>}
      {!visibleIsLoading && !disabled && trimmedQuery.length > 0 && trimmedQuery.length < 3 && (
        <p className="text-xs text-slate-500">{effectiveMinCharsMessage}</p>
      )}
      {visibleSearchError && <p className="text-xs text-amber-300">{visibleSearchError}</p>}
      {!disabled && !warehouseId ? <p className="text-xs text-slate-500">{emptyWarehouseMessage}</p> : null}

      {isOpen && visibleResults.length > 0 && (
        <div className="grid grid-cols-1 gap-2">
          {visibleResults.map((option) => (
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
                setCursor(null);
                setNextCursor(null);
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
          {nextCursor ? (
            <button
              type="button"
              className="text-left p-3 rounded-lg border border-white/10 hover:border-cyan-400/40 hover:bg-white/5 transition-colors text-sm text-cyan-300 disabled:opacity-60"
              disabled={isLoadingMore}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setCursor(nextCursor)}
            >
              {isLoadingMore ? "Cargando más..." : "Mostrar más coincidencias"}
            </button>
          ) : null}
        </div>
      )}

      {selected && (
        <div
          data-testid={`${fieldKey}-selected`}
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
                setCursor(null);
                setNextCursor(null);
              }}
            >
              Cambiar
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
            <p className={isInsufficient ? "text-red-200" : "text-slate-300"}>
              {availabilityLabel}: {formatQty(selected.totalAvailable)}
            </p>
            <p className={isInsufficient ? "text-red-200" : "text-slate-300"}>
              {hasRequiredQty ? `${requiredLabel}: ${formatQty(requiredQty!)}` : requiredLabel}
            </p>
          </div>
          {isInsufficient && (
            <p className="text-xs text-red-200">
              {insufficientMessage}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
