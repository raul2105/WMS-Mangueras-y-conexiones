function parseBoolean(value, fallback = false) {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

export function readFlags(env = process.env) {
  const catalogRaw = env.CATALOG_ENABLED ?? env.MOBILE_CATALOG_ENABLED;
  const inventorySearchRaw = env.INVENTORY_SEARCH_ENABLED ?? env.MOBILE_INVENTORY_READ_ENABLED;
  const salesRequestsRaw = env.SALES_REQUESTS_ENABLED ?? env.MOBILE_SALES_REQUESTS_ENABLED;
  const availabilityRaw = env.AVAILABILITY_ENABLED ?? env.MOBILE_AVAILABILITY_ENABLED;
  const equivalencesRaw = env.EQUIVALENCES_ENABLED ?? env.MOBILE_EQUIVALENCES_ENABLED;
  const assemblyRequestsRaw = env.ASSEMBLY_REQUESTS_ENABLED ?? env.MOBILE_ASSEMBLY_REQUESTS_ENABLED;
  const productDraftsRaw = env.PRODUCT_DRAFTS_ENABLED ?? env.MOBILE_PRODUCT_DRAFTS_ENABLED;

  return {
    mobile_enabled: parseBoolean(env.MOBILE_ENABLED, false),
    catalog_enabled: parseBoolean(catalogRaw, false),
    inventory_search_enabled: parseBoolean(inventorySearchRaw, false),
    sales_requests_enabled: parseBoolean(salesRequestsRaw, false),
    availability_enabled: parseBoolean(availabilityRaw, false),
    equivalences_enabled: parseBoolean(equivalencesRaw, false),
    assembly_requests_enabled: parseBoolean(assemblyRequestsRaw, false),
    product_drafts_enabled: parseBoolean(productDraftsRaw, false),
  };
}
