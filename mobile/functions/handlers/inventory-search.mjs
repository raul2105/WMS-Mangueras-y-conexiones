import { json, nowIso } from "../shared/response.mjs";
import { ddbQueryByWarehousePrefix } from "../shared/ddb-client.mjs";
import { hasPermission, resolveMobileAccess } from "../shared/feature-gates.mjs";
import { normalizeText, parsePositiveInt, requireEnv } from "../shared/request-validators.mjs";

function normalizeInventoryItems(items) {
  return (items || []).map((item) => ({
    sku: item.sku || null,
    name: item.name || null,
    availableQty: Number(item.availableQty ?? 0),
    warehouseCode: item.warehouseCode || null,
    updatedAt: item.updatedAt || null,
  }));
}

export async function handler(event) {
  const access = resolveMobileAccess(event);
  if (!access.ok) {
    return json(access.statusCode, { ok: false, error: access.error });
  }

  if (!hasPermission(access, "inventory.search")) {
    return json(403, { ok: false, error: "Forbidden" });
  }

  const tableName = requireEnv("MOBILE_DDB_INVENTORY_TABLE");
  const params = event?.queryStringParameters || {};
  const query = normalizeText(params.q);
  const warehouseCode = String(params.warehouseCode || access.profile.preferredWarehouseCode || "WH-MAIN").trim();
  const limit = parsePositiveInt(params.limit, 20, 50);

  const items = await ddbQueryByWarehousePrefix({
    tableName,
    warehouseCode,
    searchPrefix: `Q#${query}`,
    limit,
  });

  return json(200, {
    ok: true,
    apiVersion: "v1",
    query,
    items: normalizeInventoryItems(items),
    timestamp: nowIso(),
  });
}
