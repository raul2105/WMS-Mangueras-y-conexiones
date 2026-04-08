import { json, nowIso } from "../shared/response.mjs";
import { ddbScanPlainItems } from "../shared/ddb-client.mjs";
import { hasPermission, resolveMobileAccess } from "../shared/feature-gates.mjs";
import { normalizeText, parsePositiveInt, requireEnv } from "../shared/request-validators.mjs";
import { filterCatalogItems, normalizeCatalogItem } from "../shared/sales-catalog-read-models.mjs";

export async function handler(event) {
  const access = resolveMobileAccess(event);
  if (!access.ok) {
    return json(access.statusCode, { ok: false, error: access.error });
  }

  if (!hasPermission(access, "catalog.view")) {
    return json(403, { ok: false, error: "Forbidden" });
  }

  const tableName = requireEnv("MOBILE_DDB_CATALOG_TABLE");
  const params = event?.queryStringParameters || {};
  const query = normalizeText(params.q);
  const limit = parsePositiveInt(params.limit, 20, 100);
  const items = await ddbScanPlainItems({ tableName, limit: 200 });
  const normalizedItems = items.map(normalizeCatalogItem);
  const filteredItems = filterCatalogItems(normalizedItems, query).slice(0, limit);

  return json(200, {
    ok: true,
    apiVersion: "v1",
    query,
    items: filteredItems,
    total: filteredItems.length,
    timestamp: nowIso(),
  });
}
