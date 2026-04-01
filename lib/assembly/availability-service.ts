import type { Prisma, PrismaClient } from "@prisma/client";
import { InventoryServiceError } from "@/lib/inventory-service";
import type {
  AssemblyAvailabilityPreview,
  AssemblyConfigInput,
  AssemblyRequirement,
} from "@/lib/assembly/types";

type Tx = Prisma.TransactionClient;
type Db = PrismaClient | Tx;

function validateAssemblyInput(input: AssemblyConfigInput) {
  if (!input.warehouseId) {
    throw new InventoryServiceError("WAREHOUSE_REQUIRED", "Warehouse is required");
  }
  if (!input.entryFittingProductId || !input.hoseProductId || !input.exitFittingProductId) {
    throw new InventoryServiceError("COMPONENT_REQUIRED", "All three assembly components are required");
  }
  if (!Number.isFinite(input.hoseLength) || input.hoseLength <= 0) {
    throw new InventoryServiceError("INVALID_LENGTH", "Hose length must be greater than zero");
  }
  if (!Number.isFinite(input.assemblyQuantity) || input.assemblyQuantity <= 0) {
    throw new InventoryServiceError("INVALID_QTY", "Assembly quantity must be greater than zero");
  }
}

export function buildAssemblyRequirements(input: AssemblyConfigInput): AssemblyRequirement[] {
  validateAssemblyInput(input);
  const quantity = input.assemblyQuantity;
  const hoseRequired = input.hoseLength * quantity;
  return [
    {
      role: "ENTRY_FITTING",
      productId: input.entryFittingProductId,
      requiredQty: quantity,
      perAssemblyQty: 1,
      unitLabel: "pieza",
    },
    {
      role: "HOSE",
      productId: input.hoseProductId,
      requiredQty: hoseRequired,
      perAssemblyQty: input.hoseLength,
      unitLabel: "longitud",
    },
    {
      role: "EXIT_FITTING",
      productId: input.exitFittingProductId,
      requiredQty: quantity,
      perAssemblyQty: 1,
      unitLabel: "pieza",
    },
  ];
}

export async function previewAssemblyAvailability(db: Db, input: AssemblyConfigInput): Promise<AssemblyAvailabilityPreview> {
  const requirements = buildAssemblyRequirements(input);
  const productIds = Array.from(new Set(requirements.map((row) => row.productId)));
  const inventoryRows = await db.inventory.findMany({
    where: {
      productId: { in: productIds },
      available: { gt: 0 },
      location: {
        warehouseId: input.warehouseId,
        isActive: true,
        usageType: "STORAGE",
      },
    },
    select: {
      productId: true,
      available: true,
      locationId: true,
      location: {
        select: {
          code: true,
          name: true,
          warehouseId: true,
          zone: true,
          aisle: true,
          rack: true,
          level: true,
        },
      },
    },
    orderBy: [
      { location: { zone: "asc" } },
      { location: { aisle: "asc" } },
      { location: { rack: "asc" } },
      { location: { level: "asc" } },
      { location: { code: "asc" } },
    ],
  });

  const byProduct = new Map<string, typeof inventoryRows>();
  for (const row of inventoryRows) {
    if (!byProduct.has(row.productId)) {
      byProduct.set(row.productId, []);
    }
    byProduct.get(row.productId)?.push(row);
  }

  const allocations: AssemblyAvailabilityPreview["allocations"] = [];
  const shortages: AssemblyAvailabilityPreview["shortages"] = [];

  for (const requirement of requirements) {
    const rows = (byProduct.get(requirement.productId) ?? []).map((row) => ({
      ...row,
      remaining: row.available,
    }));
    let pending = requirement.requiredQty;

    for (const row of rows) {
      if (pending <= 0) break;
      const take = Math.min(row.remaining, pending);
      if (take <= 0) continue;
      allocations.push({
        role: requirement.role,
        productId: requirement.productId,
        locationId: row.locationId,
        locationCode: row.location.code,
        locationName: row.location.name,
        warehouseId: row.location.warehouseId,
        requestedQty: take,
      });
      pending -= take;
      row.remaining -= take;
    }

    if (pending > 0) {
      const allocatableQty = requirement.requiredQty - pending;
      shortages.push({
        role: requirement.role,
        productId: requirement.productId,
        requiredQty: requirement.requiredQty,
        allocatableQty,
        shortQty: pending,
      });
    }
  }

  return {
    exact: shortages.length === 0,
    shortages,
    requirements,
    allocations,
  };
}
