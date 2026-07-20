"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Toolbar, ToolbarGroup } from "@/components/ui/toolbar";
import { cn } from "@/lib/cn";

interface FilterButton {
  label: string;
  type: string | null;
}

type FacetOption = {
  value: string;
  count: number;
};

const FILTERS: FilterButton[] = [
  { label: "Todos", type: null },
  { label: "Mangueras", type: "HOSE" },
  { label: "Conexiones", type: "FITTING" },
  { label: "Ensambles", type: "ASSEMBLY" },
];

function hasAdvancedFilters(searchParams: URLSearchParams) {
  return (
    searchParams.get("brand") ||
    searchParams.get("category") ||
    searchParams.get("subcategory") ||
    searchParams.get("attrKey") ||
    searchParams.get("attrValue")
  );
}

export default function CatalogFilters({
  counts,
  brands,
  categories,
  subcategories,
  attributeKeys,
  attributeValues,
}: {
  counts: Record<string, number>;
  brands: FacetOption[];
  categories: FacetOption[];
  subcategories: FacetOption[];
  attributeKeys: FacetOption[];
  attributeValues: FacetOption[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentType = searchParams.get("type");
  const currentQ = searchParams.get("q") ?? "";
  const [searchValue, setSearchValue] = useState(currentQ);
  const [showAdvanced, setShowAdvanced] = useState(Boolean(hasAdvancedFilters(searchParams)));

  const pushWithParams = (next: URLSearchParams) => {
    const qs = next.toString();
    router.push(qs ? `/catalog?${qs}` : "/catalog");
  };

  const handleFilterClick = (type: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (type) params.set("type", type);
    else params.delete("type");
    params.delete("page");
    pushWithParams(params);
  };

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    const normalized = searchValue.trim();
    if (normalized) params.set("q", normalized);
    else params.delete("q");
    params.delete("page");
    pushWithParams(params);
  };

  const handleSelectChange = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    if (key === "attrKey" && !value) params.delete("attrValue");
    params.delete("page");
    pushWithParams(params);
  };

  const handleClearAdvanced = () => {
    const params = new URLSearchParams(searchParams.toString());
    ["q", "brand", "category", "subcategory", "attrKey", "attrValue", "page"].forEach((k) => params.delete(k));
    pushWithParams(params);
  };

  const handleClearAll = () => {
    const params = new URLSearchParams();
    if (currentType) params.set("type", currentType);
    pushWithParams(params);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {FILTERS.map((filter) => {
          const active = currentType === filter.type || (!currentType && !filter.type);
          const count = filter.type ? counts[filter.type] || 0 : counts.total || 0;
          return (
            <button
              key={filter.label}
              type="button"
              onClick={() => handleFilterClick(filter.type)}
              className={cn(
                "surface rounded-lg px-3 py-2 text-left transition-colors",
                active
                  ? "border-(--accent) bg-(--accent-soft)"
                  : "hover:bg-(--bg-subtle)",
              )}
            >
              <p className="text-xs uppercase tracking-wide text-(--text-muted)">{filter.label}</p>
              <p className="text-xl font-semibold text-(--text-primary)">{count}</p>
            </button>
          );
        })}
      </div>

      <form onSubmit={handleSearchSubmit} className="space-y-3">
        {/* Primary search row - always visible */}
        <div className="panel grid grid-cols-1 gap-3 p-4 md:grid-cols-7">
          <Input
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            rootClassName="md:col-span-5"
            label="Buscar producto"
            placeholder="SKU, nombre, referencia, descripción"
          />

          <Toolbar className="md:col-span-7" align="end">
            <ToolbarGroup>
              <Button type="button" onClick={() => setShowAdvanced((value) => !value)} variant="ghost" size="sm">
                {showAdvanced ? "Ocultar filtros técnicos" : "Más filtros técnicos"}
              </Button>
              <Button type="button" onClick={handleClearAdvanced} variant="ghost" size="sm">Limpiar</Button>
              <Button type="submit" size="sm">Buscar</Button>
            </ToolbarGroup>
          </Toolbar>
        </div>

        {showAdvanced && (
          <div className="panel grid grid-cols-1 gap-3 p-4 md:grid-cols-7 animate-in fade-in slide-in-from-top-2 duration-200">
            <Select label="Categoria" value={searchParams.get("category") ?? ""} onChange={(e) => handleSelectChange("category", e.target.value)} placeholder="Todas">
              {categories.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.value} ({option.count})
                </option>
              ))}
            </Select>
            <Select label="Marca" value={searchParams.get("brand") ?? ""} onChange={(e) => handleSelectChange("brand", e.target.value)} placeholder="Todas">
              {brands.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.value} ({option.count})
                </option>
              ))}
            </Select>
            <Select
              label="Subcategoria"
              value={searchParams.get("subcategory") ?? ""}
              onChange={(e) => handleSelectChange("subcategory", e.target.value)}
              placeholder="Todas"
            >
              {subcategories.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.value} ({option.count})
                </option>
              ))}
            </Select>
            <Select label="Atributo" value={searchParams.get("attrKey") ?? ""} onChange={(e) => handleSelectChange("attrKey", e.target.value)} placeholder="Ninguno">
              {attributeKeys.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.value} ({option.count})
                </option>
              ))}
            </Select>

            <Select
              label="Valor"
              value={searchParams.get("attrValue") ?? ""}
              onChange={(e) => handleSelectChange("attrValue", e.target.value)}
              disabled={attributeValues.length === 0}
              placeholder="Cualquiera"
              selectClassName="disabled:opacity-50"
            >
              {attributeValues.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.value} ({option.count})
                </option>
              ))}
            </Select>

            <Toolbar className="md:col-span-7" align="end">
              <ToolbarGroup>
                <Button type="button" onClick={handleClearAll} variant="ghost">Limpiar todo</Button>
                <Button type="submit">Aplicar filtros</Button>
              </ToolbarGroup>
            </Toolbar>
          </div>
        )}
      </form>
    </div>
  );
}
