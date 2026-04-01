export type AssemblyConfigInput = {
  warehouseId: string;
  entryFittingProductId: string;
  hoseProductId: string;
  exitFittingProductId: string;
  hoseLength: number;
  assemblyQuantity: number;
  sourceDocumentRef?: string | null;
  notes?: string | null;
};

export type AssemblyRequirement = {
  role: "ENTRY_FITTING" | "HOSE" | "EXIT_FITTING";
  productId: string;
  requiredQty: number;
  perAssemblyQty: number;
  unitLabel: string;
};

export type AssemblyAllocation = {
  role: AssemblyRequirement["role"];
  productId: string;
  locationId: string;
  locationCode: string;
  locationName: string;
  warehouseId: string;
  requestedQty: number;
};

export type AssemblyAvailabilityPreview = {
  exact: boolean;
  shortages: Array<{
    role: AssemblyRequirement["role"];
    productId: string;
    requiredQty: number;
    allocatableQty: number;
    shortQty: number;
  }>;
  requirements: AssemblyRequirement[];
  allocations: AssemblyAllocation[];
};
