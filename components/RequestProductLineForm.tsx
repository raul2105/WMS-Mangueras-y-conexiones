"use client";

import { useMemo, useState } from "react";
import ProductSearchField from "@/components/ProductSearchField";

type Props = {
  orderId: string;
  warehouseId: string;
  disabled?: boolean;
  action: (formData: FormData) => void | Promise<void>;
};

function parsePositiveDecimal(value: string) {
  if (!value) return null;
  const parsed = Number(String(value).replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export default function RequestProductLineForm({
  orderId,
  warehouseId,
  disabled = false,
  action,
}: Props) {
  const [requestedQty, setRequestedQty] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const requiredQty = useMemo(() => parsePositiveDecimal(requestedQty), [requestedQty]);
  const submitDisabled = disabled || !selectedProductId || !requiredQty;

  return (
    <form action={action} className="grid gap-4 md:grid-cols-[1.4fr_0.7fr]">
      <input type="hidden" name="orderId" value={orderId} />
      <div className="space-y-1 md:col-span-2">
        <ProductSearchField
          fieldKey="request-product"
          name="productId"
          label="Producto"
          warehouseId={warehouseId}
          requiredQty={requiredQty}
          disabled={disabled || !warehouseId}
          placeholder="Busca por SKU, referencia o nombre"
          emptyWarehouseMessage="El pedido requiere un almacén asignado para buscar productos."
          requiredLabel="Requerido para pedido"
          searchErrorMessage="No se pudo consultar el catálogo del pedido."
          insufficientMessage="La selección se conserva, pero ya no cumple con el stock suficiente para la cantidad solicitada."
          onSelectedIdChange={setSelectedProductId}
        />
      </div>

      <label className="space-y-1">
        <span className="text-sm text-slate-400">Cantidad</span>
        <input
          name="requestedQty"
          type="number"
          min={0.0001}
          step="0.0001"
          value={requestedQty}
          onChange={(event) => setRequestedQty(event.target.value)}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white"
        />
      </label>
      <label className="space-y-1">
        <span className="text-sm text-slate-400">Notas</span>
        <input
          name="notes"
          className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white"
          placeholder="Opcional"
        />
      </label>
      <div className="md:col-span-2 flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          Selecciona un producto de la lista para habilitar el alta de la línea.
        </p>
        <button type="submit" className="btn-primary" disabled={submitDisabled}>
          Agregar producto
        </button>
      </div>
    </form>
  );
}
