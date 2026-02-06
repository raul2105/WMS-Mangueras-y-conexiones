"use client";

import { useMemo, useState } from "react";

type LocationOption = {
  id: string;
  code: string;
  name: string;
  warehouseId: string;
};

export type WarehouseOption = {
  id: string;
  code: string;
  name: string;
  locations: LocationOption[];
};

type Props = {
  warehouses: WarehouseOption[];
  requiredWarehouse?: boolean;
  requiredLocation?: boolean;
  warehouseError?: string;
  locationError?: string;
};

export default function WarehouseLocationPicker({
  warehouses,
  requiredWarehouse,
  requiredLocation,
  warehouseError,
  locationError,
}: Props) {
  const [warehouseId, setWarehouseId] = useState("");

  const locations = useMemo(() => {
    return warehouses.find((w) => w.id === warehouseId)?.locations ?? [];
  }, [warehouseId, warehouses]);

  return (
    <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
      <label className="space-y-1">
        <span className="text-sm text-slate-400">Almacen</span>
        <select
          name="warehouseId"
          value={warehouseId}
          onChange={(e) => setWarehouseId(e.target.value)}
          required={requiredWarehouse}
          className="w-full px-4 py-3 glass rounded-lg"
        >
          <option value="">Selecciona un almacen</option>
          {warehouses.map((warehouse) => (
            <option key={warehouse.id} value={warehouse.id}>
              {warehouse.name} ({warehouse.code})
            </option>
          ))}
        </select>
        {warehouseError && <p className="text-xs text-red-400">{warehouseError}</p>}
      </label>

      <label className="space-y-1">
        <span className="text-sm text-slate-400">Ubicacion</span>
        <select
          name="locationId"
          key={warehouseId}
          disabled={!warehouseId || locations.length === 0}
          required={requiredLocation}
          className="w-full px-4 py-3 glass rounded-lg"
        >
          <option value="">Sin ubicacion</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.code} - {location.name}
            </option>
          ))}
        </select>
        {locationError && <p className="text-xs text-red-400">{locationError}</p>}
        {warehouseId && locations.length === 0 && (
          <p className="text-xs text-slate-500">No hay ubicaciones activas en este almacen.</p>
        )}
      </label>
    </div>
  );
}
