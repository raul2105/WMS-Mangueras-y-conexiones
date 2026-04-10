import { json, nowIso } from "../shared/response.mjs";
import { ddbGetPlainItem } from "../shared/ddb-client.mjs";
import { hasPermission, resolveMobileAccess } from "../shared/feature-gates.mjs";
import { requireEnv } from "../shared/request-validators.mjs";
import { normalizeCatalogItem } from "../shared/sales-catalog-read-models.mjs";

export async function handler(event) {
  const access = resolveMobileAccess(event);
  if (!access.ok) {
    return json(access.statusCode, { ok: false, error: access.error });
  }

  if (!hasPermission(access, "catalog.view")) {
    return json(403, { ok: false, error: "Forbidden" });
  }

  const productId = String(event?.pathParameters?.productId || "").trim();
  if (!productId) {
    return json(400, { ok: false, error: "BadRequest", details: "Missing productId" });
  }

  const tableName = requireEnv("MOBILE_DDB_CATALOG_TABLE");
  const item = await ddbGetPlainItem({ tableName, key: { productId } });
  if (!item) {
    return json(404, { ok: false, error: "NotFound" });
  }

  return json(200, {
    ok: true,
    apiVersion: "v1",
    item: normalizeCatalogItem(item),
    timestamp: nowIso(),
  });
}
