import { json, nowIso } from "../shared/response.mjs";
import { ddbScanPlainItems } from "../shared/ddb-client.mjs";
import { hasPermission, resolveMobileAccess } from "../shared/feature-gates.mjs";
import { normalizeText, parsePositiveInt, requireEnv } from "../shared/request-validators.mjs";
import { filterCatalogItems, normalizeCatalogItem, toAvailabilityItem } from "../shared/sales-catalog-read-models.mjs";

export async function handler(event) {
  const access = resolveMobileAccess(event);
  if (!access.ok) {
    return json(access.statusCode, { ok: false, error: access.error });
  }

  if (!hasPermission(access, "sales.view")) {
    return json(403, { ok: false, error: "Forbidden" });
  }

  const tableName = requireEnv("MOBILE_DDB_CATALOG_TABLE");
  const params = event?.queryStringParameters || {};
  const query = normalizeText(params.q);
  const warehouseCode = String(params.warehouseCode || "").trim();
  const limit = parsePositiveInt(params.limit, 20, 100);

  const items = await ddbScanPlainItems({ tableName, limit: 300 });
  const normalizedItems = items.map(normalizeCatalogItem);
  const rows = filterCatalogItems(normalizedItems, query)
    .map((item) => toAvailabilityItem(item, warehouseCode))
    .filter((row) => row.total > 0 || row.available > 0 || !warehouseCode)
    .slice(0, limit);

  return json(200, {
    ok: true,
    apiVersion: "v1",
    query,
    warehouseCode,
    items: rows,
    total: rows.length,
    timestamp: nowIso(),
  });
}
