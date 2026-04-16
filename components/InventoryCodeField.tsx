"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import SkuScanner from "@/components/SkuScanner";

type Props = {
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  error?: string;
  suggestions?: string[];
  showDetails?: boolean;
};

type ProductInfo = {
  id: string;
  sku: string;
  referenceCode: string | null;
  name: string;
  brand: string | null;
  description: string | null;
  type?: string;
  subcategory?: string | null;
  category?: { name: string } | null;
  totalAvailable?: number;
};

type LookupResponse = {
  selected: ProductInfo | null;
  suggestions: ProductInfo[];
};

export default function InventoryCodeField({
  name,
  label,
  placeholder,
  required,
  error,
  suggestions,
  showDetails,
}: Props) {
  const [value, setValue] = useState("");
  const [info, setInfo] = useState<ProductInfo | null>(null);
  const [remoteSuggestions, setRemoteSuggestions] = useState<ProductInfo[]>([]);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const lookupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lookupCacheRef = useRef(new Map<string, LookupResponse>());
  const listId = useId();
  const options = useMemo(() => {
    const source = suggestions ?? [];
    return Array.from(new Set(source.map((s) => s.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [suggestions]);
  const filtered = useMemo(() => {
    if (!value) return options.slice(0, 8);
    const v = value.toLowerCase();
    return options.filter((option) => option.toLowerCase().includes(v)).slice(0, 8);
  }, [options, value]);

  const clearPendingLookup = () => {
    if (lookupTimerRef.current) {
      clearTimeout(lookupTimerRef.current);
      lookupTimerRef.current = null;
    }
    abortRef.current?.abort();
    abortRef.current = null;
  };

  useEffect(
    () => () => {
      if (lookupTimerRef.current) {
        clearTimeout(lookupTimerRef.current);
        lookupTimerRef.current = null;
      }
      abortRef.current?.abort();
      abortRef.current = null;
    },
    [],
  );

  async function lookup(code: string) {
    if (!showDetails) return;
    const trimmed = code.trim();
    if (!trimmed || trimmed.length < 3) {
      abortRef.current?.abort();
      setInfo(null);
      setRemoteSuggestions([]);
      setLookupError(null);
      return;
    }

    const cacheKey = trimmed.toLowerCase();
    const cached = lookupCacheRef.current.get(cacheKey);
    if (cached) {
      setInfo(cached.selected ?? null);
      setRemoteSuggestions(cached.suggestions ?? []);
      setLookupError(!cached.selected && (cached.suggestions?.length ?? 0) === 0 ? "No se encontraron coincidencias." : null);
      return;
    }

    setLookupError(null);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`/api/products/lookup?code=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal,
      });
      if (!res.ok) {
        setInfo(null);
        setRemoteSuggestions([]);
        return;
      }
      const data = (await res.json()) as LookupResponse;
      lookupCacheRef.current.set(cacheKey, data);
      setInfo(data.selected ?? null);
      setRemoteSuggestions(data.suggestions ?? []);
      if (!data.selected && (data.suggestions?.length ?? 0) === 0) {
        setLookupError("No se encontraron coincidencias.");
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      setLookupError("No se pudo consultar el SKU.");
    }
  }

  return (
    <div className="space-y-3 md:col-span-2">
      <SkuScanner
        onDetected={(text) => {
          setValue(text);
          clearPendingLookup();
          lookupTimerRef.current = setTimeout(() => lookup(text), 400);
        }}
      />

      <label className="space-y-1 block">
        <span className="text-sm text-slate-400">{label}</span>
        <input
          name={name}
          required={required}
          value={value}
          onChange={(e) => {
            const next = e.target.value;
            setValue(next);
            clearPendingLookup();
            lookupTimerRef.current = setTimeout(() => lookup(next), 400);
          }}
          list={options.length > 0 ? listId : undefined}
          className="w-full px-4 py-3 glass rounded-lg font-mono"
          placeholder={placeholder}
        />
        {options.length > 0 && (
          <datalist id={listId}>
            {options.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        )}
        {error && <p className="text-xs text-red-400">{error}</p>}
      </label>

      {filtered.length > 0 && remoteSuggestions.length === 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {filtered.map((option) => (
            <button
              type="button"
              key={`pick-${option}`}
              className="px-2 py-1 rounded border border-white/10 text-slate-300 hover:text-white hover:border-cyan-400/40"
              onClick={() => {
                setValue(option);
                clearPendingLookup();
                lookupTimerRef.current = setTimeout(() => lookup(option), 400);
              }}
            >
              {option}
            </button>
          ))}
        </div>
      )}

      {remoteSuggestions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">Coincidencias operativas</p>
          <div className="grid grid-cols-1 gap-2">
            {remoteSuggestions.map((option) => (
              <button
                type="button"
                key={`match-${option.id}`}
                className="text-left p-3 rounded-lg border border-white/10 hover:border-cyan-400/40 hover:bg-white/5 transition-colors"
                onClick={() => {
                  setValue(option.sku);
                  setInfo(option);
                  setRemoteSuggestions([]);
                  setLookupError(null);
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm text-cyan-300">{option.sku}</p>
                    <p className="text-sm text-slate-200 truncate">{option.name}</p>
                    <p className="text-xs text-slate-500">
                      {[option.referenceCode, option.brand, option.category?.name, option.subcategory].filter(Boolean).join(" • ")}
                    </p>
                  </div>
                  <span className={`text-xs font-semibold ${typeof option.totalAvailable === "number" && option.totalAvailable > 0 ? "text-green-400" : "text-slate-500"}`}>
                    {typeof option.totalAvailable === "number" ? `${option.totalAvailable} disp.` : "--"}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {showDetails && (
        <div className="glass p-3 rounded-lg text-sm">
          {info ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div>
                <p className="text-xs text-slate-400">Marca</p>
                <p className="text-slate-200">{info.brand ?? "--"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Descripción</p>
                <p className="text-slate-200">{info.description ?? info.name}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Disponible</p>
                <p className="text-slate-200">{typeof info.totalAvailable === "number" ? info.totalAvailable : "--"}</p>
              </div>
            </div>
          ) : (
            <p className="text-slate-500">{lookupError ?? "Escribe al menos 3 caracteres para ver coincidencias."}</p>
          )}
        </div>
      )}
    </div>
  );
}
