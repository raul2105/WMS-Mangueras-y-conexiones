import { randomUUID } from "node:crypto";
import { json, nowIso } from "../shared/response.mjs";
import { ddbPutPlainItem, sqsSend } from "../shared/ddb-client.mjs";
import { hasPermission, resolveMobileAccess } from "../shared/feature-gates.mjs";
import { parseBody, requireEnv, validateRequiredFields } from "../shared/request-validators.mjs";

function buildSalesRequestCode(createdAt, requestId) {
  const date = new Date(createdAt);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const suffix = requestId.slice(0, 6).toUpperCase();
  return `SUR-${y}${m}${d}-${suffix}`;
}

export async function handler(event) {
  const access = resolveMobileAccess(event);
  if (!access.ok) {
    return json(access.statusCode, { ok: false, error: access.error });
  }

  if (!hasPermission(access, "sales.view")) {
    return json(403, { ok: false, error: "Forbidden" });
  }

  const payload = parseBody(event);
  const validation = validateRequiredFields(payload, ["customerName", "warehouseCode", "dueDate"]);
  if (!validation.ok) {
    return json(400, { ok: false, error: "BadRequest", details: `Missing field ${validation.missingField}` });
  }

  const requestId = randomUUID();
  const createdAt = nowIso();
  const code = buildSalesRequestCode(createdAt, requestId);
  const item = {
    requestId,
    code,
    kind: "SALES_REQUEST",
    status: "BORRADOR",
    syncStatus: "PENDING_LOCAL_SYNC",
    createdAt,
    updatedAt: createdAt,
    createdByUserId: access.profile.userId,
    createdByDisplayName: access.profile.displayName,
    requestedBy: access.profile.displayName,
    customerName: String(payload.customerName).trim(),
    warehouseCode: String(payload.warehouseCode).trim(),
    dueDate: String(payload.dueDate).trim(),
    notes: payload.notes ? String(payload.notes).trim() : null,
    lineCount: 0,
    linkedAssemblyCount: 0,
    directPickActive: false,
    source: "mobile-cloud",
    payload,
  };

  const tableName = requireEnv("MOBILE_DDB_SALES_REQUESTS_TABLE");
  const queueUrl = requireEnv("MOBILE_INTEGRATION_QUEUE_URL");

  await ddbPutPlainItem({
    tableName,
    item,
    conditionExpression: "attribute_not_exists(requestId)",
  });

  await sqsSend({
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify({
      eventType: "sales_request.created",
      requestId,
      createdAt,
      code,
      warehouseCode: item.warehouseCode,
      userId: access.profile.userId,
    }),
  });

  return json(201, {
    ok: true,
    apiVersion: "v1",
    requestId,
    code,
    status: item.status,
    createdAt,
  });
}
