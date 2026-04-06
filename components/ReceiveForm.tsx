"use client";

import { useState } from "react";
import InventoryCodeField from "@/components/InventoryCodeField";
import WarehouseLocationPicker, { type WarehouseOption } from "@/components/WarehouseLocationPicker";
import Link from "next/link";
import { Button, buttonStyles } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  action: (formData: FormData) => void;
  warehouses: WarehouseOption[];
  codeSuggestions?: string[];
  referenceSuggestions?: string[];
};

type FormErrors = {
  code?: string;
  quantity?: string;
  warehouseId?: string;
  locationId?: string;
  reference?: string;
  operatorName?: string;
};

export default function ReceiveForm({ action, warehouses, codeSuggestions, referenceSuggestions }: Props) {
  const [errors, setErrors] = useState<FormErrors>({});

  return (
    <form
      action={action}
      className="panel space-y-6 p-5"
      onSubmit={(event) => {
        const formData = new FormData(event.currentTarget);
        const code = String(formData.get("code") ?? "").trim();
        const warehouseId = String(formData.get("warehouseId") ?? "").trim();
        const locationId = String(formData.get("locationId") ?? "").trim();
        const reference = String(formData.get("reference") ?? "").trim();
        const operatorName = String(formData.get("operatorName") ?? "").trim();
        const qtyRaw = String(formData.get("quantity") ?? "").trim();
        const quantity = qtyRaw ? Number(qtyRaw.replace(",", ".")) : NaN;

        const nextErrors: FormErrors = {};

        if (!code) nextErrors.code = "Campo obligatorio.";
        if (!Number.isFinite(quantity) || quantity <= 0) nextErrors.quantity = "Cantidad invalida.";
        if (!warehouseId) nextErrors.warehouseId = "Selecciona un almacen.";
        if (!locationId) nextErrors.locationId = "Selecciona una ubicacion.";
        if (!reference) nextErrors.reference = "Referencia obligatoria.";
        if (!operatorName) nextErrors.operatorName = "Operador obligatorio.";

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
          suggestions={codeSuggestions}
          showDetails
        />

        <Input name="quantity" required inputMode="decimal" label="Cantidad" placeholder="10" error={errors.quantity} />

        <WarehouseLocationPicker
          warehouses={warehouses}
          requiredWarehouse
          requiredLocation
          warehouseError={errors.warehouseId}
          locationError={errors.locationId}
        />

        <Input
          name="reference"
          required
          label="Referencia documento"
          list={referenceSuggestions && referenceSuggestions.length > 0 ? "receive-reference-options" : undefined}
          placeholder="Factura/OC/Remision"
          error={errors.reference}
        />
        {referenceSuggestions && referenceSuggestions.length > 0 && (
          <datalist id="receive-reference-options">
            {referenceSuggestions.map((reference) => (
              <option key={reference} value={reference} />
            ))}
          </datalist>
        )}

        <Input
          name="operatorName"
          required
          label="Operador"
          placeholder="Nombre del operador"
          error={errors.operatorName}
        />

        <label className="space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Archivo referencia</span>
          <input
            name="referenceFile"
            type="file"
            accept="application/pdf,image/*"
            className="field px-4 py-2.5"
          />
          <p className="text-xs text-[var(--text-muted)]">Opcional. Max 10 MB.</p>
        </label>

        <Textarea name="notes" label="Notas" textareaClassName="min-h-[96px]" rootClassName="md:col-span-2" />
      </div>

      <div className="flex items-center justify-end gap-3">
        <Link href="/inventory" className={buttonStyles({ variant: "secondary" })}>
          Cancelar
        </Link>
        <Button type="submit">Registrar entrada</Button>
      </div>
    </form>
  );
}
