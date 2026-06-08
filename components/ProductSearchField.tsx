"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useRef, useState } from "react";
import type { ProductSearchMatch } from "@/lib/product-search";
import { buttonStyles } from "@/components/ui/button";

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
      <span className="text-sm text-[var(--text-muted)]">{label}</span>
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
        className="field disabled:cursor-not-allowed disabled:opacity-60"
      />

      {visibleIsLoading && <p className="text-xs text-[var(--text-muted)]">{loadingMessage}</p>}
      {!visibleIsLoading && !disabled && trimmedQuery.length > 0 && trimmedQuery.length < 3 && (
        <p className="text-xs text-[var(--text-muted)]">{effectiveMinCharsMessage}</p>
      )}
      {visibleSearchError && <p className="text-xs text-[var(--status-warning-text)]">{visibleSearchError}</p>}
      {!disabled && !warehouseId ? <p className="text-xs text-[var(--text-muted)]">{emptyWarehouseMessage}</p> : null}

      {isOpen && visibleResults.length > 0 && (
        <div className="grid grid-cols-1 gap-2">
          {visibleResults.map((option) => (
            <button
              type="button"
              key={`${fieldKey}-${option.id}`}
              className="text-left rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 transition-colors hover:border-[var(--accent)] hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-surface)]"
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
                  <p className="font-mono text-sm text-[var(--accent)]">{option.sku}</p>
                  <p className="truncate text-sm text-[var(--text-primary)]">{option.name}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {[option.referenceCode, option.brand, option.category?.name, option.subcategory].filter(Boolean).join(" • ") || "Sin metadatos adicionales"}
                  </p>
                </div>
                <span className="text-xs font-semibold text-[var(--status-success-text)]">
                  {formatQty(option.totalAvailable)} disp.
                </span>
              </div>
            </button>
          ))}
          {nextCursor ? (
            <button
              type="button"
              className="text-left rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 text-sm text-[var(--accent)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--bg-subtle)] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-surface)]"
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
          className={`space-y-2 rounded-lg border p-3 ${
            isInsufficient
              ? "border-[var(--status-danger-border)] bg-[var(--status-danger-bg)]"
              : "border-[var(--status-info-border)] bg-[var(--status-info-bg)]"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-sm text-[var(--accent)]">{selected.sku}</p>
              <p className="text-sm text-[var(--text-primary)]">{selected.name}</p>
              <p className="text-xs text-[var(--text-muted)]">
                {[selected.referenceCode, selected.brand, selected.category?.name, selected.subcategory].filter(Boolean).join(" • ") || "Sin metadatos adicionales"}
              </p>
            </div>
            <button
              type="button"
              className={buttonStyles({ variant: "secondary", size: "sm" })}
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
            <p className={isInsufficient ? "text-[var(--status-danger-text)]" : "text-[var(--text-secondary)]"}>
              {availabilityLabel}: {formatQty(selected.totalAvailable)}
            </p>
            <p className={isInsufficient ? "text-[var(--status-danger-text)]" : "text-[var(--text-secondary)]"}>
              {hasRequiredQty ? `${requiredLabel}: ${formatQty(requiredQty!)}` : requiredLabel}
            </p>
          </div>
          {isInsufficient && (
            <p className="text-xs text-[var(--status-danger-text)]">
              {insufficientMessage}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
