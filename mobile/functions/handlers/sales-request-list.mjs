import { json, nowIso } from "../shared/response.mjs";
import { ddbScanPlainItems } from "../shared/ddb-client.mjs";
import { hasPermission, resolveMobileAccess } from "../shared/feature-gates.mjs";
import { parsePositiveInt, requireEnv } from "../shared/request-validators.mjs";
import {
  filterSalesRequestItems,
  normalizeSalesRequestItem,
  summarizeSalesRequests,
} from "../shared/sales-catalog-read-models.mjs";

export async function handler(event) {
  const access = resolveMobileAccess(event);
  if (!access.ok) {
    return json(access.statusCode, { ok: false, error: access.error });
  }

  if (!hasPermission(access, "sales.view")) {
    return json(403, { ok: false, error: "Forbidden" });
  }

  const tableName = requireEnv("MOBILE_DDB_SALES_REQUESTS_TABLE");
  const params = event?.queryStringParameters || {};
  const statusFilter = String(params.status || "").trim().toUpperCase();
  const limit = parsePositiveInt(params.limit, 20, 100);
  const items = await ddbScanPlainItems({ tableName, limit: 300 });
  const normalizedItems = items
    .map(normalizeSalesRequestItem)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const filteredItems = filterSalesRequestItems(normalizedItems, statusFilter).slice(0, limit);

  return json(200, {
    ok: true,
    apiVersion: "v1",
    statusFilter,
    items: filteredItems,
    summary: summarizeSalesRequests(normalizedItems),
    timestamp: nowIso(),
  });
}
