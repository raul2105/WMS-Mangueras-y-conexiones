"use client";

import { useMemo, useState } from "react";

type InventoryOption = {
  productId: string;
  productSku: string;
  productName: string;
  locationId: string;
  locationCode: string;
  locationName: string;
  available: number;
};

type Props = {
  orderId: string;
  inventoryOptions: InventoryOption[];
  action: (formData: FormData) => void;
};

export default function ProductionOrderItemForm({ orderId, inventoryOptions, action }: Props) {
  const [productId, setProductId] = useState("");

  const products = useMemo(() => {
    const map = new Map<string, { id: string; sku: string; name: string }>();
    for (const row of inventoryOptions) {
      if (!map.has(row.productId)) {
        map.set(row.productId, { id: row.productId, sku: row.productSku, name: row.productName });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [inventoryOptions]);

  const locations = useMemo(() => {
    return inventoryOptions
      .filter((row) => row.productId === productId)
      .sort((a, b) => a.locationCode.localeCompare(b.locationCode));
  }, [inventoryOptions, productId]);

  return (
    <form action={action} className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <input type="hidden" name="orderId" value={orderId} />

      <label className="space-y-1 md:col-span-2">
        <span className="text-sm text-slate-400">Producto *</span>
        <select
          name="productId"
          required
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          className="w-full px-4 py-3 glass rounded-lg"
        >
          <option value="">Selecciona un producto</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.sku} - {product.name}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-1">
        <span className="text-sm text-slate-400">Ubicacion *</span>
        <select
          name="locationId"
          required
          disabled={!productId || locations.length === 0}
          className="w-full px-4 py-3 glass rounded-lg"
        >
          <option value="">Selecciona ubicacion</option>
          {locations.map((location) => (
            <option key={location.locationId} value={location.locationId}>
              {location.locationCode} - {location.locationName} (Disp: {location.available})
            </option>
          ))}
        </select>
        {productId && locations.length === 0 && (
          <p className="text-xs text-slate-500">Sin ubicaciones con stock disponible.</p>
        )}
      </label>

      <label className="space-y-1">
        <span className="text-sm text-slate-400">Cantidad *</span>
        <input
          name="quantity"
          required
          inputMode="decimal"
          className="w-full px-4 py-3 glass rounded-lg"
          placeholder="1"
        />
      </label>

      <div className="md:col-span-4 flex justify-end">
        <button type="submit" className="btn-primary">
          Agregar material
        </button>
      </div>
    </form>
  );
}
