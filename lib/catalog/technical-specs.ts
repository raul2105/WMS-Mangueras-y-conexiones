import { normalizeTechnicalText } from "@/lib/product-attributes";

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

function toText(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item)).join(", ");
  return value === null || value === undefined ? "" : String(value).trim();
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
    const value = toText(rawValue);
    if (!value || rows.has(key)) continue;
    const definition = definitionsByKey.get(key);
    rows.set(key, {
      family,
      key,
      value,
      normalizedValue: normalizeTechnicalText(value),
      unit: definition?.unit ?? null,
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
  const match = normalized.match(/^-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : Number.NaN;
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

  for (const row of rows) {
    if (numericKeys.has(row.key) && !Number.isFinite(numericValue(row))) {
      errors.push(`${row.key}: debe contener un valor numérico válido`);
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
