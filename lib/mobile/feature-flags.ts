import type { MobileFeatureFlags } from "@/lib/mobile/contracts";

export const DEFAULT_MOBILE_FEATURE_FLAGS: MobileFeatureFlags = {
  mobile_enabled: false,
  inventory_search_enabled: false,
  assembly_requests_enabled: false,
  product_drafts_enabled: false,
};

export type MobileCapability =
  | "base"
  | "inventory_search"
  | "assembly_requests"
  | "product_drafts";

export function parseEnvBoolean(value: string | undefined, fallback: boolean) {
  if (value == null) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

export function readMobileFeatureFlags(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): MobileFeatureFlags {
  const inventorySearchRaw = env.INVENTORY_SEARCH_ENABLED ?? env.MOBILE_INVENTORY_READ_ENABLED;
  const assemblyRequestsRaw = env.ASSEMBLY_REQUESTS_ENABLED ?? env.MOBILE_ASSEMBLY_REQUESTS_ENABLED;
  const productDraftsRaw = env.PRODUCT_DRAFTS_ENABLED ?? env.MOBILE_PRODUCT_DRAFTS_ENABLED;

  return {
    mobile_enabled: parseEnvBoolean(env.MOBILE_ENABLED, DEFAULT_MOBILE_FEATURE_FLAGS.mobile_enabled),
    inventory_search_enabled: parseEnvBoolean(
      inventorySearchRaw,
      DEFAULT_MOBILE_FEATURE_FLAGS.inventory_search_enabled,
    ),
    assembly_requests_enabled: parseEnvBoolean(
      assemblyRequestsRaw,
      DEFAULT_MOBILE_FEATURE_FLAGS.assembly_requests_enabled,
    ),
    product_drafts_enabled: parseEnvBoolean(
      productDraftsRaw,
      DEFAULT_MOBILE_FEATURE_FLAGS.product_drafts_enabled,
    ),
  };
}

export function isMobileCapabilityEnabled(capability: MobileCapability, flags: MobileFeatureFlags) {
  if (!flags.mobile_enabled) return false;

  switch (capability) {
    case "base":
      return true;
    case "inventory_search":
      return flags.inventory_search_enabled;
    case "assembly_requests":
      return flags.assembly_requests_enabled;
    case "product_drafts":
      return flags.product_drafts_enabled;
    default:
      return false;
  }
}
