"use client";

import { useState } from "react";
import InventoryCodeField from "@/components/InventoryCodeField";
import WarehouseLocationPicker, { type WarehouseOption } from "@/components/WarehouseLocationPicker";
import Link from "next/link";

type Props = {
  action: (formData: FormData) => void;
  warehouses: WarehouseOption[];
};

type FormErrors = {
  code?: string;
  quantity?: string;
  warehouseId?: string;
  locationId?: string;
  reference?: string;
};

export default function ReceiveForm({ action, warehouses }: Props) {
  const [errors, setErrors] = useState<FormErrors>({});

  return (
    <form
      action={action}
      className="glass-card space-y-6"
      encType="multipart/form-data"
      onSubmit={(event) => {
        const formData = new FormData(event.currentTarget);
        const code = String(formData.get("code") ?? "").trim();
        const warehouseId = String(formData.get("warehouseId") ?? "").trim();
        const locationId = String(formData.get("locationId") ?? "").trim();
        const reference = String(formData.get("reference") ?? "").trim();
        const qtyRaw = String(formData.get("quantity") ?? "").trim();
        const quantity = qtyRaw ? Number(qtyRaw.replace(",", ".")) : NaN;

        const nextErrors: FormErrors = {};

        if (!code) nextErrors.code = "Campo obligatorio.";
        if (!Number.isFinite(quantity) || quantity <= 0) nextErrors.quantity = "Cantidad invalida.";
        if (!warehouseId) nextErrors.warehouseId = "Selecciona un almacen.";
        if (!locationId) nextErrors.locationId = "Selecciona una ubicacion.";
        if (!reference) nextErrors.reference = "Referencia obligatoria.";

        if (Object.keys(nextErrors).length > 0) {
          event.preventDefault();
          setErrors(nextErrors);
          return;
        }

        setErrors({});
      }}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <InventoryCodeField
          name="code"
          label="SKU o Referencia *"
          placeholder="CON-R1AT-04"
          required
          error={errors.code}
        />

        <label className="space-y-1">
          <span className="text-sm text-slate-400">Cantidad *</span>
          <input
            name="quantity"
            required
            inputMode="decimal"
            className="w-full px-4 py-3 glass rounded-lg"
            placeholder="10"
          />
          {errors.quantity && <p className="text-xs text-red-400">{errors.quantity}</p>}
        </label>

        <WarehouseLocationPicker
          warehouses={warehouses}
          requiredWarehouse
          requiredLocation
          warehouseError={errors.warehouseId}
          locationError={errors.locationId}
        />

        <label className="space-y-1">
          <span className="text-sm text-slate-400">Referencia documento *</span>
          <input
            name="reference"
            required
            className="w-full px-4 py-3 glass rounded-lg"
            placeholder="Factura/OC/Remision"
          />
          {errors.reference && <p className="text-xs text-red-400">{errors.reference}</p>}
        </label>

        <label className="space-y-1">
          <span className="text-sm text-slate-400">Archivo referencia (PDF/imagen)</span>
          <input
            name="referenceFile"
            type="file"
            accept="application/pdf,image/*"
            className="w-full px-4 py-3 glass rounded-lg"
          />
          <p className="text-xs text-slate-500">Opcional. Max 10 MB.</p>
        </label>

        <label className="space-y-1 md:col-span-2">
          <span className="text-sm text-slate-400">Notas</span>
          <textarea name="notes" className="w-full px-4 py-3 glass rounded-lg min-h-[96px]" />
        </label>
      </div>

      <div className="flex items-center justify-end gap-3">
        <Link href="/inventory" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">
          Cancelar
        </Link>
        <button type="submit" className="btn-primary">Registrar entrada</button>
      </div>
    </form>
  );
}
