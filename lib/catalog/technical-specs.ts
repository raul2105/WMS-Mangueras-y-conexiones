import { normalizeTechnicalText, syncProductTechnicalAttributes } from "@/lib/product-attributes";
import { createAuditLogRequiredWithDb } from "@/lib/audit-log";
import type { PrismaClient } from "@prisma/client";

export type TechnicalFamily = "HOSE" | "FITTING" | "ASSEMBLY" | "ACCESSORY";

export type TechnicalFieldDefinition = {
  key: string;
  label: string;
  unit?: string;
  required: boolean;
  safetyCritical: boolean;
};

export type TechnicalSpecRow = {
  family: TechnicalFamily;
  key: string;
  value: string;
  normalizedValue: string;
  unit: string | null;
  isSafetyCritical: boolean;
};

export type TechnicalValidationResult = {
  valid: boolean;
  errors: string[];
};

/**
 * A direct catalog edit supersedes any still-pending source that contains the
 * product.  Without this boundary an older source could later be approved and
 * overwrite values that were deliberately published without a source.
 */
type TechnicalSourceSupersedeDb = {
  productTechnicalSource: {
    updateMany: (args: Parameters<PrismaClient["productTechnicalSource"]["updateMany"]>[0]) => PromiseLike<unknown>;
  };
};

export async function supersedePendingTechnicalSourcesForProduct(db: TechnicalSourceSupersedeDb, productId: string) {
  return db.productTechnicalSource.updateMany({
    where: {
      status: "PENDING_REVIEW",
      OR: [
        { specCandidates: { some: { productId } } },
        { assets: { some: { productId } } },
        { compatibilityRules: { some: { OR: [{ productId }, { compatibleProductId: productId }] } } },
      ],
    },
    data: { status: "SUPERSEDED", reviewedAt: new Date() },
  });
}

const COMMON_FIELDS: TechnicalFieldDefinition[] = [
  { key: "material", label: "Material", required: true, safetyCritical: true },
  { key: "standard", label: "Norma / estándar", required: false, safetyCritical: true },
];

const FIELD_DEFINITIONS: Record<TechnicalFamily, TechnicalFieldDefinition[]> = {
  HOSE: [
    { key: "inner_diameter", label: "Diámetro interior", unit: "mm", required: true, safetyCritical: true },
    { key: "outer_diameter", label: "Diámetro exterior", unit: "mm", required: false, safetyCritical: true },
    { key: "working_pressure", label: "Presión de trabajo", unit: "bar", required: true, safetyCritical: true },
    { key: "burst_pressure", label: "Presión de ruptura", unit: "bar", required: false, safetyCritical: true },
    { key: "temperature_min", label: "Temperatura mínima", unit: "°C", required: false, safetyCritical: true },
    { key: "temperature_max", label: "Temperatura máxima", unit: "°C", required: true, safetyCritical: true },
    { key: "bend_radius", label: "Radio de curvatura", unit: "mm", required: false, safetyCritical: true },
    { key: "media", label: "Fluido / aplicación", required: true, safetyCritical: true },
    { key: "reinforcement", label: "Refuerzo", required: false, safetyCritical: true },
    ...COMMON_FIELDS,
  ],
  FITTING: [
    { key: "connection_series", label: "Serie de conexión", required: true, safetyCritical: true },
    { key: "port_size", label: "Tamaño de puerto", unit: "mm", required: true, safetyCritical: true },
    { key: "thread", label: "Rosca", required: true, safetyCritical: true },
    { key: "gender", label: "Género", required: false, safetyCritical: true },
    { key: "angle", label: "Ángulo", unit: "°", required: false, safetyCritical: true },
    { key: "seal", label: "Sello", required: false, safetyCritical: true },
    { key: "working_pressure", label: "Presión de trabajo", unit: "bar", required: true, safetyCritical: true },
    { key: "temperature_max", label: "Temperatura máxima", unit: "°C", required: false, safetyCritical: true },
    ...COMMON_FIELDS,
  ],
  ASSEMBLY: [
    { key: "hose_length", label: "Longitud de manguera", unit: "mm", required: true, safetyCritical: true },
    { key: "entry_connection", label: "Conexión de entrada", required: true, safetyCritical: true },
    { key: "exit_connection", label: "Conexión de salida", required: true, safetyCritical: true },
    { key: "working_pressure", label: "Presión de trabajo", unit: "bar", required: true, safetyCritical: true },
    { key: "temperature_max", label: "Temperatura máxima", unit: "°C", required: true, safetyCritical: true },
    { key: "test_reference", label: "Referencia de prueba", required: false, safetyCritical: true },
    ...COMMON_FIELDS,
  ],
  ACCESSORY: [
    { key: "application", label: "Aplicación", required: true, safetyCritical: false },
    ...COMMON_FIELDS,
  ],
};

const KEY_ALIASES: Record<string, string> = {
  diametro: "inner_diameter",
  diametro_interior: "inner_diameter",
  id: "inner_diameter",
  diametro_exterior: "outer_diameter",
  od: "outer_diameter",
  presion: "working_pressure",
  presion_trabajo: "working_pressure",
  presion_de_trabajo: "working_pressure",
  pressure_psi: "working_pressure",
  working_pressure_bar: "working_pressure",
  presion_ruptura: "burst_pressure",
  temperatura_maxima: "temperature_max",
  temperatura_minima: "temperature_min",
  radio_curvatura: "bend_radius",
  uso: "media",
  fluido: "media",
  conexion: "connection_series",
  serie: "connection_series",
  medida: "port_size",
  genero: "gender",
  angulo: "angle",
  material: "material",
  norma: "standard",
  estandar: "standard",
  refuerzo: "reinforcement",
};

function parseAttributes(attributesRaw: string | null | undefined) {
  if (!attributesRaw) return {} as Record<string, unknown>;
  try {
    const parsed = JSON.parse(attributesRaw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

/**
 * Validates the JSON envelope before a catalog form writes it.  Read paths keep
 * the tolerant parser above so a legacy malformed record does not take down a
 * product page, but write paths must never interpret malformed input as an
 * intentional empty specification set.
 */
export function validateTechnicalAttributesJson(attributesRaw: string | null | undefined) {
  const raw = String(attributesRaw ?? "").trim();
  if (!raw) return { valid: true, error: null as string | null };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { valid: false, error: "Las especificaciones técnicas deben ser un objeto JSON" };
    }
    return { valid: true, error: null as string | null };
  } catch {
    return { valid: false, error: "Las especificaciones técnicas contienen JSON inválido" };
  }
}

function toText(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item)).join(", ");
  return value === null || value === undefined ? "" : String(value).trim();
}

type SourceUnit = "mm" | "cm" | "m" | "in" | "ft" | "bar" | "psi" | "mpa" | "kpa" | "c" | "f";

function normalizeSourceUnit(unit: string | undefined): SourceUnit | null {
  const normalized = String(unit ?? "")
    .trim()
    .toLowerCase()
    .replace(/[°º]/g, "")
    .replace(/μ/g, "u");
  if (["mm", "millimeter", "milimetro", "milímetros", "milimetros"].includes(normalized)) return "mm";
  if (["cm", "centimeter", "centimetro", "centímetros", "centimetros"].includes(normalized)) return "cm";
  if (["m", "meter", "metro", "metros"].includes(normalized)) return "m";
  if (["in", "inch", "inches", "pulg", "pulgada", "pulgadas"].includes(normalized)) return "in";
  if (["ft", "foot", "feet", "pie", "pies"].includes(normalized)) return "ft";
  if (["bar", "bars"].includes(normalized)) return "bar";
  if (["psi", "psig", "lb/in2", "lb/in²"].includes(normalized)) return "psi";
  if (["mpa"].includes(normalized)) return "mpa";
  if (["kpa"].includes(normalized)) return "kpa";
  if (["c", "°c", "celsius"].includes(normalized)) return "c";
  if (["f", "°f", "fahrenheit"].includes(normalized)) return "f";
  return null;
}

function sourceUnitFromKey(normalizedKey: string) {
  const suffix = normalizedKey.match(/(?:^|_)(psi|bar|mpa|kpa|mm|cm|in|inch|ft|m|c|f)$/)?.[1];
  return normalizeSourceUnit(suffix);
}

function sourceMeasurement(value: string) {
  const match = value.trim().match(/^(-?\d+(?:[.,]\d+)?(?:\s*\/\s*\d+(?:[.,]\d+)?)?)\s*([^\s]+)?/);
  if (!match) return null;
  const numericRaw = match[1].replace(/\s/g, "").replace(",", ".");
  const number = numericRaw.includes("/")
    ? (() => {
        const [numerator, denominator] = numericRaw.split("/").map(Number);
        return denominator > 0 ? numerator / denominator : Number.NaN;
      })()
    : Number(numericRaw);
  if (!Number.isFinite(number)) return null;
  return { number, unit: normalizeSourceUnit(match[2]) };
}

function formatCanonicalNumber(value: number) {
  return Number(value.toFixed(6)).toString();
}

function canonicalizeTechnicalValue(rawKey: string, key: string, value: string, canonicalUnit: string | undefined) {
  if (!canonicalUnit) return { value, unit: null as string | null };
  const measurement = sourceMeasurement(value);
  const sourceUnit = sourceUnitFromKey(rawKey) ?? measurement?.unit;
  if (!measurement || !sourceUnit) return { value, unit: canonicalUnit };

  let converted = measurement.number;
  if (canonicalUnit === "mm") {
    converted = sourceUnit === "in" ? converted * 25.4 : sourceUnit === "cm" ? converted * 10 : sourceUnit === "m" ? converted * 1000 : sourceUnit === "ft" ? converted * 304.8 : converted;
  } else if (canonicalUnit === "bar") {
    converted = sourceUnit === "psi" ? converted * 0.0689475729 : sourceUnit === "mpa" ? converted * 10 : sourceUnit === "kpa" ? converted * 0.01 : converted;
  } else if (canonicalUnit === "°C") {
    converted = sourceUnit === "f" ? (converted - 32) * (5 / 9) : converted;
  }

  // Store the normalized number separately from the canonical unit. The
  // catalog UI renders `value` and `unit` as two fields; embedding the unit in
  // the value would display e.g. `206.84 bar bar`.
  return { value: formatCanonicalNumber(converted), unit: canonicalUnit };
}

export function getTechnicalFieldDefinitions(type: string): TechnicalFieldDefinition[] {
  return FIELD_DEFINITIONS[(type || "ACCESSORY").toUpperCase() as TechnicalFamily] ?? FIELD_DEFINITIONS.ACCESSORY;
}

export function buildTechnicalSpecRows(
  type: string,
  attributesRaw: string | null | undefined,
): TechnicalSpecRow[] {
  const family = (type || "ACCESSORY").toUpperCase() as TechnicalFamily;
  const definitions = getTechnicalFieldDefinitions(family);
  const definitionsByKey = new Map(definitions.map((definition) => [definition.key, definition]));
  const rows = new Map<string, TechnicalSpecRow>();

  for (const [rawKey, rawValue] of Object.entries(parseAttributes(attributesRaw))) {
    const normalizedKey = normalizeTechnicalText(rawKey).replaceAll(" ", "_");
    const key = KEY_ALIASES[normalizedKey] ?? normalizedKey;
    const sourceValue = toText(rawValue);
    if (!sourceValue || rows.has(key)) continue;
    const definition = definitionsByKey.get(key);
    const canonical = canonicalizeTechnicalValue(normalizedKey, key, sourceValue, definition?.unit);
    rows.set(key, {
      family,
      key,
      value: canonical.value,
      normalizedValue: normalizeTechnicalText(canonical.value),
      unit: canonical.unit,
      isSafetyCritical: definition?.safetyCritical ?? false,
    });
  }

  return Array.from(rows.values());
}

export function getTechnicalCompleteness(type: string, rows: Array<Pick<TechnicalSpecRow, "key">>) {
  const required = getTechnicalFieldDefinitions(type).filter((field) => field.required);
  const available = new Set(rows.map((row) => row.key));
  const missing = required.filter((field) => !available.has(field.key));
  return {
    complete: missing.length === 0,
    missing: missing.map((field) => field.label),
    requiredCount: required.length,
    availableCount: required.filter((field) => available.has(field.key)).length,
  };
}

export function getTechnicalFieldLabel(type: string, key: string) {
  return getTechnicalFieldDefinitions(type).find((field) => field.key === key)?.label ?? key.replaceAll("_", " ");
}

function numericValue(row: TechnicalSpecRow) {
  const normalized = row.value.trim().replace(",", ".");
  const match = normalized.match(/^-?\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?/);
  if (!match) return Number.NaN;
  const value = match[0].replace(/\s/g, "");
  if (!value.includes("/")) return Number(value);
  const [numeratorRaw, denominatorRaw] = value.split("/");
  const numerator = Number(numeratorRaw);
  const denominator = Number(denominatorRaw);
  return denominator > 0 ? numerator / denominator : Number.NaN;
}

/**
 * Validates contradictions that would make a technical specification unsafe
 * to use in compatibility or assembly decisions. Missing fields remain a
 * completeness warning so legacy catalog records can still be edited.
 */
export function validateTechnicalSpecRows(rows: TechnicalSpecRow[]): TechnicalValidationResult {
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const errors: string[] = [];
  const numericKeys = new Set([
    "inner_diameter",
    "outer_diameter",
    "working_pressure",
    "burst_pressure",
    "temperature_min",
    "temperature_max",
    "bend_radius",
    "port_size",
    "angle",
    "hose_length",
  ]);
  const positivePhysicalKeys = new Set([
    "inner_diameter",
    "outer_diameter",
    "working_pressure",
    "burst_pressure",
    "bend_radius",
    "port_size",
    "hose_length",
  ]);

  for (const row of rows) {
    if (!numericKeys.has(row.key)) continue;
    const value = numericValue(row);
    if (!Number.isFinite(value)) {
      errors.push(`${row.key}: debe contener un valor numérico válido`);
      continue;
    }
    if (positivePhysicalKeys.has(row.key) && value <= 0) {
      errors.push(`${row.key}: debe ser mayor que cero`);
    }
  }

  const innerDiameter = byKey.get("inner_diameter");
  const outerDiameter = byKey.get("outer_diameter");
  if (innerDiameter && outerDiameter && Number.isFinite(numericValue(innerDiameter)) && Number.isFinite(numericValue(outerDiameter)) && numericValue(outerDiameter) < numericValue(innerDiameter)) {
    errors.push("El diámetro exterior no puede ser menor que el diámetro interior");
  }

  const temperatureMin = byKey.get("temperature_min");
  const temperatureMax = byKey.get("temperature_max");
  if (temperatureMin && temperatureMax && Number.isFinite(numericValue(temperatureMin)) && Number.isFinite(numericValue(temperatureMax)) && numericValue(temperatureMin) > numericValue(temperatureMax)) {
    errors.push("La temperatura mínima no puede ser mayor que la máxima");
  }

  const workingPressure = byKey.get("working_pressure");
  const burstPressure = byKey.get("burst_pressure");
  if (workingPressure && burstPressure && Number.isFinite(numericValue(workingPressure)) && Number.isFinite(numericValue(burstPressure)) && numericValue(burstPressure) < numericValue(workingPressure)) {
    errors.push("La presión de ruptura no puede ser menor que la presión de trabajo");
  }

  return { valid: errors.length === 0, errors };
}

type TechnicalSpecDbClient = {
  productTechnicalSpec: {
    deleteMany: (args: { where: { productId: string; key?: { notIn: string[] } } }) => Promise<unknown>;
    upsert: (args: {
      where: { productId_key: { productId: string; key: string } };
      create: {
        productId: string;
        family: string;
        key: string;
        value: string;
        normalizedValue: string;
        unit: string | null;
        isSafetyCritical: boolean;
        sourceId: string | null;
      };
      update: {
        family: string;
        value: string;
        normalizedValue: string;
        unit: string | null;
        isSafetyCritical: boolean;
        sourceId?: string | null;
      };
    }) => Promise<unknown>;
  };
};

type TechnicalSpecCandidateDbClient = {
  productTechnicalSpecCandidate: {
    deleteMany: (args: { where: { productId: string; sourceId: string } }) => Promise<unknown>;
    upsert: (args: {
      where: { productId_sourceId_key: { productId: string; sourceId: string; key: string } };
      create: {
        productId: string;
        sourceId: string;
        family: string;
        key: string;
        value: string;
        normalizedValue: string;
        unit: string | null;
        isSafetyCritical: boolean;
      };
      update: {
        family: string;
        value: string;
        normalizedValue: string;
        unit: string | null;
        isSafetyCritical: boolean;
      };
    }) => Promise<unknown>;
  };
};

export async function syncProductTechnicalSpecCandidates(
  db: TechnicalSpecCandidateDbClient,
  productId: string,
  type: string,
  attributesRaw: string | null | undefined,
  sourceId: string,
) {
  const rows = buildTechnicalSpecRows(type, attributesRaw);
  await db.productTechnicalSpecCandidate.deleteMany({ where: { productId, sourceId } });
  for (const row of rows) {
    await db.productTechnicalSpecCandidate.upsert({
      where: { productId_sourceId_key: { productId, sourceId, key: row.key } },
      create: { productId, sourceId, ...row },
      update: {
        family: row.family,
        value: row.value,
        normalizedValue: row.normalizedValue,
        unit: row.unit,
        isSafetyCritical: row.isSafetyCritical,
      },
    });
  }
}

export async function promoteProductTechnicalSource(
  prisma: PrismaClient,
  args: { sourceId: string; reviewerUserId: string },
) {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.productTechnicalSource.updateMany({
      where: { id: args.sourceId, status: "PENDING_REVIEW" },
      data: { status: "APPROVING" },
    });
    if (claimed.count !== 1) throw new Error("La fuente técnica ya fue procesada o no está pendiente");

    const source = await tx.productTechnicalSource.findUnique({
      where: { id: args.sourceId },
      select: { id: true, status: true, createdAt: true },
    });
    if (!source) throw new Error("Fuente técnica no encontrada");
    if (source.status !== "APPROVING") {
      throw new Error("Sólo una fuente pendiente puede aprobarse");
    }

    const candidates = await tx.productTechnicalSpecCandidate.findMany({
      where: { sourceId: source.id },
      orderBy: [{ productId: "asc" }, { key: "asc" }],
    });
    const pendingAssets = await tx.productAsset.findMany({
      where: { sourceId: source.id, validationStatus: "PENDING" },
      select: { productId: true, url: true, kind: true, createdAt: true },
    });
    if (candidates.length === 0 && pendingAssets.length === 0) {
      throw new Error("La fuente no tiene especificaciones ni activos pendientes");
    }

    const productIds = Array.from(new Set(candidates.map((candidate) => candidate.productId)));
    const affectedProductIds = Array.from(new Set([...productIds, ...pendingAssets.map((asset) => asset.productId)]));
    const [currentSpecs, currentAssets] = affectedProductIds.length
      ? await Promise.all([
          tx.productTechnicalSpec.findMany({
            where: { productId: { in: affectedProductIds }, sourceId: { not: null } },
            select: { sourceId: true },
          }),
          tx.productAsset.findMany({
            where: { productId: { in: affectedProductIds }, validationStatus: "APPROVED", sourceId: { not: null } },
            select: { sourceId: true },
          }),
        ])
      : [[], []];
    const currentSourceIds = Array.from(new Set([
      ...currentSpecs.map((row) => row.sourceId).filter((id): id is string => Boolean(id)),
      ...currentAssets.map((row) => row.sourceId).filter((id): id is string => Boolean(id)),
    ]));
    if (currentSourceIds.length > 0) {
      const newerApprovedSource = await tx.productTechnicalSource.findFirst({
        where: {
          id: { in: currentSourceIds },
          status: "APPROVED",
          createdAt: { gt: source.createdAt },
        },
        select: { id: true },
      });
      if (newerApprovedSource) {
        throw new Error("La fuente técnica está obsoleta frente a una aprobación más reciente");
      }
    }

    for (const productId of productIds) {
      const rows = candidates.filter((candidate) => candidate.productId === productId);
      const keys = rows.map((row) => row.key);
      await tx.productTechnicalSpec.deleteMany({
        where: { productId, ...(keys.length > 0 ? { key: { notIn: keys } } : {}) },
      });
      for (const row of rows) {
        await tx.productTechnicalSpec.upsert({
          where: { productId_key: { productId, key: row.key } },
          create: {
            productId,
            family: row.family,
            key: row.key,
            value: row.value,
            normalizedValue: row.normalizedValue,
            unit: row.unit,
            isSafetyCritical: row.isSafetyCritical,
            sourceId: source.id,
          },
          update: {
            family: row.family,
            value: row.value,
            normalizedValue: row.normalizedValue,
            unit: row.unit,
            isSafetyCritical: row.isSafetyCritical,
            sourceId: source.id,
          },
        });
      }
      const publishedAttributes = JSON.stringify(Object.fromEntries(rows.map((row) => [row.key, row.value])));
      await tx.product.update({ where: { id: productId }, data: { attributes: publishedAttributes } });
      await syncProductTechnicalAttributes(tx, productId, publishedAttributes);
    }

    const reviewedAt = new Date();
    await tx.productAsset.updateMany({
      where: { sourceId: source.id, validationStatus: "PENDING" },
      data: { validationStatus: "APPROVED", reviewedAt },
    });
    for (const productId of new Set(pendingAssets.map((asset) => asset.productId))) {
      const primaryAsset = pendingAssets
        .filter((asset) => asset.productId === productId && asset.kind === "PRIMARY_IMAGE")
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];
      if (primaryAsset) {
        await tx.product.update({ where: { id: productId }, data: { imageUrl: primaryAsset.url } });
      }
    }

    await tx.productTechnicalSource.update({
      where: { id: source.id },
      data: { status: "APPROVED", reviewedAt, reviewedByUserId: args.reviewerUserId },
    });
    await tx.productTechnicalSpecCandidate.deleteMany({ where: { sourceId: source.id } });
    await createAuditLogRequiredWithDb({
      entityType: "PRODUCT_TECHNICAL_SOURCE",
      entityId: source.id,
      action: "APPROVE",
      actorUserId: args.reviewerUserId,
      source: "catalog/technical-sources/approve",
      after: {
        sourceId: source.id,
        productCount: affectedProductIds.length,
        specCount: candidates.length,
        status: "APPROVED",
      },
    }, tx);
    return {
      sourceId: source.id,
      productCount: affectedProductIds.length,
      specCount: candidates.length,
    };
  });
}

export async function syncProductTechnicalSpecs(
  db: TechnicalSpecDbClient,
  productId: string,
  type: string,
  attributesRaw: string | null | undefined,
  sourceId?: string | null,
) {
  const rows = buildTechnicalSpecRows(type, attributesRaw);
  const keys = rows.map((row) => row.key);
  await db.productTechnicalSpec.deleteMany({
    where: {
      productId,
      ...(keys.length > 0 ? { key: { notIn: keys } } : {}),
    },
  });
  for (const row of rows) {
    await db.productTechnicalSpec.upsert({
      where: { productId_key: { productId, key: row.key } },
      create: {
        productId,
        family: row.family,
        key: row.key,
        value: row.value,
        normalizedValue: row.normalizedValue,
        unit: row.unit,
        isSafetyCritical: row.isSafetyCritical,
        sourceId: sourceId ?? null,
      },
      update: {
        family: row.family,
        value: row.value,
        normalizedValue: row.normalizedValue,
        unit: row.unit,
        isSafetyCritical: row.isSafetyCritical,
        ...(sourceId === undefined ? {} : { sourceId }),
      },
    });
  }
}
