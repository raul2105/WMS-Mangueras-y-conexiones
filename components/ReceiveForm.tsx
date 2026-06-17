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
  actorName: string;
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

export default function ReceiveForm({ action, warehouses, actorName, codeSuggestions, referenceSuggestions }: Props) {
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
      <div className="space-y-5">
        <section className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Paso 1 · Identifica el artículo</p>
          <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
            <InventoryCodeField
              name="code"
              label="SKU o Referencia *"
              placeholder="CON-R1AT-04"
              required
              error={errors.code}
              suggestions={codeSuggestions}
              showDetails
            />
            <Input name="quantity" required inputMode="decimal" label="Cantidad *" placeholder="10" error={errors.quantity} />
          </div>
        </section>

        <section className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Paso 2 · Confirma destino</p>
          <div className="mt-3">
            <WarehouseLocationPicker
              warehouses={warehouses}
              requiredWarehouse
              requiredLocation
              warehouseError={errors.warehouseId}
              locationError={errors.locationId}
            />
          </div>
        </section>

        <section className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Paso 3 · Referencia y evidencia</p>
          <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              name="reference"
              required
              label="OC, factura o remisión *"
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

            <Input
              name="operatorName"
              label="Alias operativo"
              placeholder="Alias en piso, si aplica"
              error={errors.operatorName}
            />

            <Textarea name="notes" label="Notas operativas" textareaClassName="min-h-[96px]" rootClassName="md:col-span-2" />
          </div>
        </section>

        <section className="rounded-[var(--radius-lg)] border border-[color-mix(in oklab,var(--accent) 20%,var(--border-subtle))] bg-[color-mix(in oklab,var(--accent) 8%,var(--surface-subtle))] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Paso 4 · Revisión</p>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            El movimiento quedará atribuido a <span className="font-semibold text-[var(--text-primary)]">{actorName}</span>.
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Si capturas un alias operativo, se guardará como referencia complementaria y no reemplaza al usuario autenticado.</p>
        </section>
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
