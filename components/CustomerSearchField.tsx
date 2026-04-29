"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useRef, useState } from "react";

export type CustomerSearchMatch = {
  id: string;
  code: string;
  name: string;
  taxId: string | null;
  email: string | null;
  isActive: boolean;
};

type CustomerSearchResponse = {
  results: CustomerSearchMatch[];
  selected: CustomerSearchMatch | null;
  nextCursor?: string | null;
};

type Props = {
  name: string;
  label: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  minChars?: number;
};

function customerLabel(customer: CustomerSearchMatch) {
  return `${customer.code} - ${customer.name}`;
}

export default function CustomerSearchField({
  name,
  label,
  required = false,
  disabled = false,
  placeholder = "Busca cliente por código, nombre o RFC",
  minChars = 2,
}: Props) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [selected, setSelected] = useState<CustomerSearchMatch | null>(null);
  const [results, setResults] = useState<CustomerSearchMatch[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestRef = useRef(0);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trimmedQuery = query.trim();
  const selectedText = selected ? customerLabel(selected) : "";
  const isSelectedQuery = Boolean(selectedId && selectedText && selectedText === trimmedQuery);
  const shouldSearch = !disabled && !isSelectedQuery && trimmedQuery.length >= minChars;

  useEffect(() => () => {
    abortRef.current?.abort();
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
  }, []);

  useEffect(() => {
    if (!shouldSearch) {
      abortRef.current?.abort();
      setIsLoading(false);
      if (!cursor) {
        setResults([]);
        setNextCursor(null);
      }
      return;
    }

    const timeoutId = setTimeout(() => {
      const requestId = ++requestRef.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const params = new URLSearchParams({
        q: trimmedQuery,
        take: "8",
      });
      if (cursor) params.set("cursor", cursor);

      setIsLoading(true);
      fetch(`/api/customers/search?${params.toString()}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error("CUSTOMER_SEARCH_FAILED");
          return response.json() as Promise<CustomerSearchResponse>;
        })
        .then((payload) => {
          if (requestId !== requestRef.current) return;
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
          setNextCursor(payload.nextCursor ?? null);
          setSearchError(incoming.length === 0 && !cursor ? "No se encontraron clientes activos." : null);
        })
        .catch((error) => {
          if (requestId !== requestRef.current) return;
          if (error instanceof Error && error.name === "AbortError") return;
          setResults([]);
          setNextCursor(null);
          setSearchError("No se pudo consultar el catálogo de clientes.");
        })
        .finally(() => {
          if (requestId === requestRef.current) {
            setIsLoading(false);
          }
        });
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [cursor, shouldSearch, trimmedQuery]);

  const helperText = useMemo(() => {
    if (disabled) return "Campo deshabilitado.";
    if (!trimmedQuery) return `Escribe al menos ${minChars} caracteres para buscar.`;
    if (trimmedQuery.length < minChars) return `Escribe al menos ${minChars} caracteres para buscar.`;
    return null;
  }, [disabled, minChars, trimmedQuery]);

  const showList = isOpen && results.length > 0;
  const showRequiredHint = required && !selectedId;

  return (
    <div className="space-y-3">
      <input type="hidden" name={name} value={selectedId} required={required} />

      <label className="space-y-1">
        <span className="text-sm text-slate-400">{label}</span>
        <input
          value={query}
          disabled={disabled}
          onChange={(event) => {
            const value = event.target.value;
            setQuery(value);
            setIsOpen(true);
            setCursor(null);
            setNextCursor(null);
            setSearchError(null);
            if (selectedId) {
              setSelectedId("");
              setSelected(null);
            }
          }}
          onFocus={() => {
            if (!disabled) setIsOpen(true);
          }}
          onBlur={() => {
            blurTimerRef.current = setTimeout(() => setIsOpen(false), 140);
          }}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white disabled:opacity-60 disabled:cursor-not-allowed"
          placeholder={placeholder}
        />
      </label>

      {isLoading ? <p className="text-xs text-slate-500">Buscando clientes...</p> : null}
      {!isLoading && helperText ? <p className="text-xs text-slate-500">{helperText}</p> : null}
      {searchError ? <p className="text-xs text-amber-300">{searchError}</p> : null}
      {showRequiredHint ? <p className="text-xs text-amber-300">Selecciona un cliente del catálogo para continuar.</p> : null}

      {showList ? (
        <div className="grid gap-2">
          {results.map((option) => (
            <button
              key={option.id}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setSelected(option);
                setSelectedId(option.id);
                setQuery(customerLabel(option));
                setResults([]);
                setCursor(null);
                setNextCursor(null);
                setSearchError(null);
                setIsOpen(false);
              }}
              className="rounded-lg border border-white/10 p-3 text-left hover:border-cyan-400/50 hover:bg-white/5"
            >
              <p className="text-xs font-mono text-cyan-300">{option.code}</p>
              <p className="text-sm text-slate-100">{option.name}</p>
              <p className="text-xs text-slate-500">{option.taxId ?? option.email ?? "Sin RFC/email"}</p>
            </button>
          ))}
          {nextCursor ? (
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setCursor(nextCursor)}
              className="rounded-lg border border-white/10 p-3 text-left text-sm text-cyan-300 hover:border-cyan-400/50 hover:bg-white/5"
              disabled={isLoading}
            >
              {isLoading ? "Cargando..." : "Mostrar más coincidencias"}
            </button>
          ) : null}
        </div>
      ) : null}

      {selected ? (
        <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-cyan-300 font-mono">{selected.code}</p>
              <p className="text-sm text-slate-100">{selected.name}</p>
              <p className="text-xs text-slate-300">{selected.taxId ?? selected.email ?? "Sin datos de contacto"}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelected(null);
                setSelectedId("");
                setQuery("");
                setIsOpen(false);
                setResults([]);
                setCursor(null);
                setNextCursor(null);
              }}
              className="text-xs rounded border border-white/10 px-2 py-1 text-slate-300 hover:text-white"
            >
              Limpiar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
