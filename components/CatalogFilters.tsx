"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";

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

  const pushWithParams = (next: URLSearchParams) => {
    const qs = next.toString();
    router.push(qs ? `/catalog?${qs}` : "/catalog");
  };

  const handleFilterClick = (type: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (type) {
      params.set("type", type);
    } else {
      params.delete("type");
    }
    params.delete("page");
    pushWithParams(params);
  };

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    const normalized = searchValue.trim();
    if (normalized) {
      params.set("q", normalized);
    } else {
      params.delete("q");
    }
    params.delete("page");
    pushWithParams(params);
  };

  const handleSelectChange = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }

    if (key === "attrKey" && !value) {
      params.delete("attrValue");
    }

    params.delete("page");
    pushWithParams(params);
  };

  const handleClearAdvanced = () => {
    const params = new URLSearchParams(searchParams.toString());
    ["q", "brand", "category", "subcategory", "attrKey", "attrValue", "page"].forEach((k) => params.delete(k));
    pushWithParams(params);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {FILTERS.map((filter) => {
          const isActive = currentType === filter.type || (!currentType && !filter.type);
          const count = filter.type ? counts[filter.type] || 0 : counts.total || 0;

          return (
            <button
              key={filter.label}
              onClick={() => handleFilterClick(filter.type)}
              className={`glass p-4 rounded-xl text-left transition-all group ${
                isActive ? "bg-cyan-500/20 border-cyan-500/50" : "hover:bg-white/5"
              }`}
            >
              <span
                className={`text-sm block uppercase tracking-wider font-semibold ${
                  isActive ? "text-cyan-400" : "text-slate-400 group-hover:text-cyan-400"
                }`}
              >
                {filter.label}
              </span>
              <span className="text-2xl font-bold text-white mt-1">{count}</span>
            </button>
          );
        })}
      </div>

      <form onSubmit={handleSearchSubmit} className="glass-card p-4 grid grid-cols-1 md:grid-cols-7 gap-3 items-end">
        <label className="space-y-1 md:col-span-2">
          <span className="text-xs uppercase tracking-wide text-slate-400">Buscar</span>
          <input
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder="SKU, nombre, referencia, descripción..."
            className="w-full px-3 py-2 glass rounded-lg"
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs uppercase tracking-wide text-slate-400">Categoría</span>
          <select
            value={searchParams.get("category") ?? ""}
            onChange={(e) => handleSelectChange("category", e.target.value)}
            className="w-full px-3 py-2 glass rounded-lg"
          >
            <option value="">Todas</option>
            {categories.map((option) => (
              <option key={option.value} value={option.value}>
                {option.value} ({option.count})
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-xs uppercase tracking-wide text-slate-400">Marca</span>
          <select
            value={searchParams.get("brand") ?? ""}
            onChange={(e) => handleSelectChange("brand", e.target.value)}
            className="w-full px-3 py-2 glass rounded-lg"
          >
            <option value="">Todas</option>
            {brands.map((option) => (
              <option key={option.value} value={option.value}>
                {option.value} ({option.count})
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-xs uppercase tracking-wide text-slate-400">Subcategoría</span>
          <select
            value={searchParams.get("subcategory") ?? ""}
            onChange={(e) => handleSelectChange("subcategory", e.target.value)}
            className="w-full px-3 py-2 glass rounded-lg"
          >
            <option value="">Todas</option>
            {subcategories.map((option) => (
              <option key={option.value} value={option.value}>
                {option.value} ({option.count})
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-xs uppercase tracking-wide text-slate-400">Atributo</span>
          <select
            value={searchParams.get("attrKey") ?? ""}
            onChange={(e) => handleSelectChange("attrKey", e.target.value)}
            className="w-full px-3 py-2 glass rounded-lg"
          >
            <option value="">Ninguno</option>
            {attributeKeys.map((option) => (
              <option key={option.value} value={option.value}>
                {option.value} ({option.count})
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-xs uppercase tracking-wide text-slate-400">Valor</span>
          <select
            value={searchParams.get("attrValue") ?? ""}
            onChange={(e) => handleSelectChange("attrValue", e.target.value)}
            disabled={attributeValues.length === 0}
            className="w-full px-3 py-2 glass rounded-lg disabled:opacity-50"
          >
            <option value="">Cualquiera</option>
            {attributeValues.map((option) => (
              <option key={option.value} value={option.value}>
                {option.value} ({option.count})
              </option>
            ))}
          </select>
        </label>

        <div className="flex gap-2 md:col-span-7 justify-end">
          <button type="button" onClick={handleClearAdvanced} className="px-3 py-2 glass rounded-lg text-slate-300 hover:text-white">
            Limpiar filtros
          </button>
          <button type="submit" className="btn-primary">
            Aplicar búsqueda
          </button>
        </div>
      </form>
    </div>
  );
}
