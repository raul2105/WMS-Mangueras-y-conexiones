"use client";

import { useRouter, useSearchParams } from "next/navigation";

interface FilterButton {
  label: string;
  type: string | null;
}

const FILTERS: FilterButton[] = [
  { label: "Todos", type: null },
  { label: "Mangueras", type: "HOSE" },
  { label: "Conexiones", type: "FITTING" },
  { label: "Ensambles", type: "ASSEMBLY" },
];

export default function CatalogFilters({ counts }: { counts: Record<string, number> }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentType = searchParams.get("type");

  const handleFilterClick = (type: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (type) {
      params.set("type", type);
    } else {
      params.delete("type");
    }
    router.push(`/catalog?${params.toString()}`);
  };

  return (
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
  );
}
