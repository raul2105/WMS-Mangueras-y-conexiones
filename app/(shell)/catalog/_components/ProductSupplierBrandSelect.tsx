"use client";

import { useState } from "react";

type Brand = { id: string; name: string };
type Supplier = {
  id: string;
  name: string;
  businessName: string | null;
  brands: Brand[];
};

type Props = {
  suppliers: Supplier[];
  defaultSupplierId?: string | null;
  defaultBrandId?: string | null;
  required?: boolean;
};

export function ProductSupplierBrandSelect({
  suppliers,
  defaultSupplierId,
  defaultBrandId,
  required = false,
}: Props) {
  const [selectedSupplierId, setSelectedSupplierId] = useState(defaultSupplierId ?? "");

  const selectedSupplier = suppliers.find((s) => s.id === selectedSupplierId);
  const brands = selectedSupplier?.brands ?? [];

  const selectClass = "w-full px-4 py-3 glass rounded-lg text-sm";
  const labelClass = "block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] mb-1.5";

  return (
    <>
      <div className="space-y-1.5">
        <label htmlFor="primarySupplierId" className={labelClass}>
          Proveedor principal{required && " *"}
        </label>
        <select
          id="primarySupplierId"
          name="primarySupplierId"
          required={required}
          value={selectedSupplierId}
          onChange={(e) => setSelectedSupplierId(e.target.value)}
          className={selectClass}
        >
          <option value="">Seleccionar proveedor…</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.businessName ?? s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="supplierBrandId" className={labelClass}>
          Marca del proveedor{required && " *"}
        </label>
        <select
          id="supplierBrandId"
          name="supplierBrandId"
          required={required && selectedSupplierId !== ""}
          defaultValue={defaultBrandId ?? ""}
          key={selectedSupplierId}
          className={selectClass}
          disabled={brands.length === 0}
        >
          <option value="">
            {selectedSupplierId === ""
              ? "Selecciona un proveedor primero"
              : brands.length === 0
                ? "Sin marcas registradas"
                : "Seleccionar marca…"}
          </option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        {selectedSupplierId !== "" && brands.length === 0 && (
          <p className="text-xs text-[var(--text-muted)]">
            Este proveedor no tiene marcas. Agrégalas en{" "}
            <a href={`/purchasing/suppliers/${selectedSupplierId}`} className="underline hover:text-white">
              su ficha
            </a>
            .
          </p>
        )}
      </div>
    </>
  );
}
