type ProductQuantityInput = {
  type?: string | null;
  unitLabel?: string | null;
  purchaseUnitLabel?: string | null;
  purchaseUnitFactor?: number | null;
  attributes?: string | null;
};

export type QuantityPolicy = {
  unitLabel: string;
  increment: number;
  displayDecimals: number;
  isDiscrete: boolean;
};

function readQuantityOverrides(attributes?: string | null) {
  if (!attributes) return {};
  try {
    const parsed: unknown = JSON.parse(attributes);
    if (!parsed || typeof parsed !== "object") return {};
    const record = parsed as Record<string, unknown>;
    const increment = Number(record.quantityIncrement);
    const displayDecimals = Number(record.quantityDisplayDecimals);
    return {
      increment: Number.isFinite(increment) && increment > 0 ? increment : undefined,
      displayDecimals:
        Number.isInteger(displayDecimals) && displayDecimals >= 0 && displayDecimals <= 4
          ? displayDecimals
          : undefined,
    };
  } catch {
    return {};
  }
}

export function normalizeUnitLabel(unitLabel?: string | null) {
  const normalized = String(unitLabel ?? "").trim().toLowerCase();
  if (normalized === "metro" || normalized === "metros") return "m";
  if (normalized === "pieza" || normalized === "pzas" || normalized === "pza") return "pieza";
  return normalized || "unidad";
}

export function getQuantityPolicy(product: ProductQuantityInput): QuantityPolicy {
  const unitLabel = normalizeUnitLabel(product.unitLabel);
  const isHose = String(product.type ?? "").toUpperCase() === "HOSE" || unitLabel === "m";
  const overrides = readQuantityOverrides(product.attributes);

  // Las piezas físicas no se fraccionan. Sólo los artículos medidos por longitud
  // aceptan una precisión menor, salvo que el catálogo defina otro incremento.
  const defaultIncrement = isHose ? 0.01 : 1;
  const increment = overrides.increment ?? defaultIncrement;
  const isDiscrete = increment >= 1 && !isHose;
  const defaultDecimals = isHose ? 2 : 0;

  return {
    unitLabel,
    increment,
    displayDecimals: overrides.displayDecimals ?? defaultDecimals,
    isDiscrete,
  };
}

export function getAssemblyQuantityPolicy(): QuantityPolicy {
  return { unitLabel: "ensamble", increment: 1, displayDecimals: 0, isDiscrete: true };
}

export function getPurchaseUnitPolicy(product: ProductQuantityInput): QuantityPolicy {
  const unitLabel = normalizeUnitLabel(product.purchaseUnitLabel ?? product.unitLabel);
  const factor = Number(product.purchaseUnitFactor ?? 1);
  const isLengthPurchasedDirectly = unitLabel === "m" && factor === 1;
  return {
    unitLabel,
    increment: isLengthPurchasedDirectly ? getQuantityPolicy(product).increment : 1,
    displayDecimals: isLengthPurchasedDirectly ? getQuantityPolicy(product).displayDecimals : 0,
    isDiscrete: !isLengthPurchasedDirectly,
  };
}

export function quantityValidationMessage(quantity: number, policy: QuantityPolicy) {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return "La cantidad debe ser mayor que cero";
  }

  const multiples = quantity / policy.increment;
  if (Math.abs(multiples - Math.round(multiples)) > 1e-8) {
    const increment = policy.increment.toLocaleString("es-MX", {
      minimumFractionDigits: policy.displayDecimals,
      maximumFractionDigits: policy.displayDecimals,
    });
    return policy.isDiscrete
      ? `Este artículo se maneja por ${policy.unitLabel} completa; captura números enteros`
      : `La cantidad debe avanzar en múltiplos de ${increment} ${policy.unitLabel}`;
  }

  return null;
}

export function formatQuantity(quantity: number, policy: QuantityPolicy) {
  return quantity.toLocaleString("es-MX", {
    minimumFractionDigits: policy.displayDecimals,
    maximumFractionDigits: policy.displayDecimals,
  });
}
