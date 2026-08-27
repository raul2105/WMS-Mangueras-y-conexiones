import type { Prisma, PrismaClient } from "@prisma/client";
import { getAssemblyCompatibilityDecision } from "@/lib/catalog/compatibility";
import { InventoryServiceError } from "@/lib/inventory-service";

type Db = PrismaClient | Prisma.TransactionClient;

export type AssemblyCompatibilityStage = "RELEASE_PICK_LIST" | "CONFIRM_PICK" | "CLOSE_ASSEMBLY";

export type AssemblyCompatibilityRevalidation = {
  applicability: "CONFIGURED" | "LEGACY_NOT_APPLICABLE";
  stage: AssemblyCompatibilityStage;
  status: "APPROVED" | "REQUIRES_REVIEW" | "LEGACY_NOT_APPLICABLE";
  reasonCode: string;
  explanation: string;
  productIds: string[];
  overrideReused: boolean;
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map(canonicalize)
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

export function compatibilityRulesFingerprint(value: unknown) {
  // Match the representation persisted by JSON.stringify (Date, Decimal, etc.)
  // before sorting keys and rule order.
  return JSON.stringify(canonicalize(JSON.parse(JSON.stringify(value)) as unknown));
}

function parseStoredRules(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

/**
 * Revalidates the components that are actually present on the work order.
 * Configured orders fail closed. Historical records without AssemblyConfiguration
 * remain operable, but are explicitly classified as legacy and cannot certify KAN-20.
 */
export async function assertAssemblyOperationalCompatibility(
  db: Db,
  productionOrderId: string,
  stage: AssemblyCompatibilityStage,
): Promise<AssemblyCompatibilityRevalidation> {
  const order = await db.productionOrder.findUnique({
    where: { id: productionOrderId },
    select: {
      id: true,
      assemblyConfiguration: {
        select: {
          compatibilityStatus: true,
          compatibilityReviewApproved: true,
          compatibilityReviewReason: true,
          compatibilityReviewedByUserId: true,
          compatibilityReviewRules: true,
        },
      },
      assemblyWorkOrder: {
        select: {
          lines: {
            select: { componentRole: true, productId: true },
          },
        },
      },
    },
  });

  if (!order?.assemblyWorkOrder) {
    throw new InventoryServiceError("ORDER_NOT_FOUND", "Assembly order not found");
  }

  if (!order.assemblyConfiguration) {
    return {
      applicability: "LEGACY_NOT_APPLICABLE",
      stage,
      status: "LEGACY_NOT_APPLICABLE",
      reasonCode: "MISSING_LEGACY_CONFIGURATION",
      explanation: "Orden histórica sin configuración técnica estructurada; requiere regularización para certificación.",
      productIds: [],
      overrideReused: false,
    };
  }

  const productsByRole = new Map(order.assemblyWorkOrder.lines.map((line) => [line.componentRole, line.productId]));
  const productIds = [
    productsByRole.get("ENTRY_FITTING"),
    productsByRole.get("HOSE"),
    productsByRole.get("EXIT_FITTING"),
  ].filter((value): value is string => Boolean(value));

  if (productIds.length !== 3 || new Set(productIds).size < 2) {
    throw new InventoryServiceError(
      "COMPATIBILITY_REVIEW_REQUIRED",
      "La orden configurada no conserva los tres componentes requeridos para revalidar su compatibilidad técnica.",
    );
  }

  const decision = await getAssemblyCompatibilityDecision(db, productIds);
  if (decision.status === "BLOCKED") {
    throw new InventoryServiceError("INCOMPATIBLE_COMPONENTS", decision.explanation);
  }

  let overrideReused = false;
  if (decision.status === "REQUIRES_REVIEW") {
    const storedRules = parseStoredRules(order.assemblyConfiguration.compatibilityReviewRules);
    const reviewReason = order.assemblyConfiguration.compatibilityReviewReason?.trim() ?? "";
    const matchingApprovedOverride =
      decision.reviewOverrideAllowed
      && order.assemblyConfiguration.compatibilityStatus === "REQUIRES_REVIEW"
      && order.assemblyConfiguration.compatibilityReviewApproved
      && Boolean(order.assemblyConfiguration.compatibilityReviewedByUserId)
      && reviewReason.length >= 10
      && storedRules !== null
      && compatibilityRulesFingerprint(storedRules) === compatibilityRulesFingerprint(decision.matchedRules);

    if (!matchingApprovedOverride) {
      throw new InventoryServiceError("COMPATIBILITY_REVIEW_REQUIRED", decision.explanation);
    }
    overrideReused = true;
  }

  return {
    applicability: "CONFIGURED",
    stage,
    status: decision.status,
    reasonCode: decision.reasonCode,
    explanation: decision.explanation,
    productIds,
    overrideReused,
  };
}
