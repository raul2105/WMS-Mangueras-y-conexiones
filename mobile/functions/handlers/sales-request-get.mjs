import { json, nowIso } from "../shared/response.mjs";
import { ddbGetPlainItem } from "../shared/ddb-client.mjs";
import { hasPermission, resolveMobileAccess } from "../shared/feature-gates.mjs";
import { requireEnv } from "../shared/request-validators.mjs";
import { normalizeSalesRequestItem } from "../shared/sales-catalog-read-models.mjs";

export async function handler(event) {
  const access = resolveMobileAccess(event);
  if (!access.ok) {
    return json(access.statusCode, { ok: false, error: access.error });
  }

  if (!hasPermission(access, "sales.view")) {
    return json(403, { ok: false, error: "Forbidden" });
  }

  const requestId = String(event?.pathParameters?.id || "").trim();
  if (!requestId) {
    return json(400, { ok: false, error: "BadRequest", details: "Missing id" });
  }

  const tableName = requireEnv("MOBILE_DDB_SALES_REQUESTS_TABLE");
  const item = await ddbGetPlainItem({ tableName, key: { requestId } });
  if (!item) {
    return json(404, { ok: false, error: "NotFound" });
  }

  return json(200, {
    ok: true,
    apiVersion: "v1",
    item: normalizeSalesRequestItem(item),
    timestamp: nowIso(),
  });
}
