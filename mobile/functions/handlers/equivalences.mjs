import { json, nowIso } from "../shared/response.mjs";
import { ddbScanPlainItems } from "../shared/ddb-client.mjs";
import { hasPermission, resolveMobileAccess } from "../shared/feature-gates.mjs";
import { normalizeText, parsePositiveInt, requireEnv } from "../shared/request-validators.mjs";
import { filterCatalogItems, normalizeCatalogItem, toEquivalenceGroup } from "../shared/sales-catalog-read-models.mjs";

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
  const limit = parsePositiveInt(params.limit, 12, 24);

  if (!query) {
    return json(200, {
      ok: true,
      apiVersion: "v1",
      query,
      items: [],
      timestamp: nowIso(),
    });
  }

  const items = await ddbScanPlainItems({ tableName, limit: 300 });
  const normalizedItems = items.map(normalizeCatalogItem);
  const catalogMap = new Map(normalizedItems.map((item) => [item.productId, item]));
  const groups = filterCatalogItems(normalizedItems, query)
    .slice(0, limit)
    .map((item) => toEquivalenceGroup(item, catalogMap, warehouseCode));

  return json(200, {
    ok: true,
    apiVersion: "v1",
    query,
    items: groups,
    timestamp: nowIso(),
  });
}
