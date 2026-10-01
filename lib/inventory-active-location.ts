import { Prisma } from "@prisma/client";
import { InventoryServiceError } from "@/lib/inventory-service";

type TxClient = Prisma.TransactionClient;
type LockedLocation = { id: string; code: string; warehouseId: string; isActive: boolean };
type LockedWarehouse = { id: string; isActive: boolean };

/**
 * Lock location and warehouse rows until the caller's transaction commits.
 * All callers acquire location locks by sorted id, then warehouse locks by
 * sorted id, so multi-location operations use a consistent lock order.
 */
export async function lockAndAssertActiveInventoryLocations(
  tx: TxClient,
  locationIds: readonly string[],
): Promise<LockedLocation[]> {
  const ids = [...new Set(locationIds.map((id) => id.trim()).filter(Boolean))].sort();
  if (ids.length === 0) {
    throw new InventoryServiceError("LOCATION_NOT_FOUND", "Ubicación no encontrada");
  }

  const locations = await tx.$queryRaw<LockedLocation[]>(Prisma.sql`
    SELECT "id", "code", "warehouseId", "isActive"
    FROM "Location"
    WHERE "id" IN (${Prisma.join(ids)})
    ORDER BY "id"
    FOR SHARE
  `);
  if (locations.length !== ids.length) {
    throw new InventoryServiceError("LOCATION_NOT_FOUND", "Ubicación no encontrada");
  }

  const warehouseIds = [...new Set(locations.map((location) => location.warehouseId))].sort();
  const warehouses = await tx.$queryRaw<LockedWarehouse[]>(Prisma.sql`
    SELECT "id", "isActive"
    FROM "Warehouse"
    WHERE "id" IN (${Prisma.join(warehouseIds)})
    ORDER BY "id"
    FOR SHARE
  `);
  const warehousesById = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse]));

  for (const location of locations) {
    if (!location.isActive) {
      throw new InventoryServiceError("LOCATION_INACTIVE", `La ubicación ${location.code} está inactiva`);
    }
    if (!warehousesById.get(location.warehouseId)?.isActive) {
      throw new InventoryServiceError("WAREHOUSE_INACTIVE", `El almacén de la ubicación ${location.code} está inactivo`);
    }
  }

  return locations;
}
