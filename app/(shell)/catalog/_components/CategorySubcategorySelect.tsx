"use client";

import { useState } from "react";

type Props = {
  taxonomy: Record<string, string[]>;
  defaultCategory?: string | null;
  defaultSubcategory?: string | null;
};

export function CategorySubcategorySelect({
  taxonomy,
  defaultCategory,
  defaultSubcategory,
}: Props) {
  const [selectedCategory, setSelectedCategory] = useState(defaultCategory ?? "");

  const subcategories = selectedCategory ? (taxonomy[selectedCategory] ?? []) : [];
  const categories = Object.keys(taxonomy);

  const selectClass = "w-full px-4 py-3 glass rounded-lg text-sm";
  const labelClass = "block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] mb-1.5";

  return (
    <>
      <div className="space-y-1.5">
        <label htmlFor="category" className={labelClass}>
          Categoría
        </label>
        <select
          id="category"
          name="category"
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className={selectClass}
        >
          <option value="">Sin categoría</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="subcategory" className={labelClass}>
          Subcategoría
        </label>
        <select
          id="subcategory"
          name="subcategory"
          key={selectedCategory}
          defaultValue={subcategories.includes(defaultSubcategory ?? "") ? (defaultSubcategory ?? "") : ""}
          className={selectClass}
          disabled={subcategories.length === 0}
        >
          <option value="">
            {selectedCategory === "" ? "Selecciona una categoría primero" : "Sin subcategoría"}
          </option>
          {subcategories.map((sub) => (
            <option key={sub} value={sub}>
              {sub}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
