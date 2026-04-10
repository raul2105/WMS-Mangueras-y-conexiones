import { randomUUID } from "node:crypto";
import { json, nowIso } from "../shared/response.mjs";
import { ddbPutPlainItem, sqsSend } from "../shared/ddb-client.mjs";
import { hasPermission, resolveMobileAccess } from "../shared/feature-gates.mjs";
import { parseBody, requireEnv, validateRequiredFields } from "../shared/request-validators.mjs";

export async function handler(event) {
  const access = resolveMobileAccess(event);
  if (!access.ok) {
    return json(access.statusCode, { ok: false, error: access.error });
  }

  if (!hasPermission(access, "assembly_requests.create")) {
    return json(403, { ok: false, error: "Forbidden" });
  }

  const payload = parseBody(event);
  const validation = validateRequiredFields(payload, ["warehouseCode"]);
  if (!validation.ok) {
    return json(400, { ok: false, error: "BadRequest", details: `Missing field ${validation.missingField}` });
  }

  const requestId = randomUUID();
  const createdAt = nowIso();
  const item = {
    requestId,
    kind: "ASSEMBLY_REQUEST",
    status: "PENDING_LOCAL_SYNC",
    createdAt,
    updatedAt: createdAt,
    createdByUserId: access.profile.userId,
    createdByDisplayName: access.profile.displayName,
    warehouseCode: String(payload.warehouseCode).trim(),
    source: "mobile-cloud",
    payload,
  };

  const tableName = requireEnv("MOBILE_DDB_ASSEMBLY_REQUESTS_TABLE");
  const queueUrl = requireEnv("MOBILE_INTEGRATION_QUEUE_URL");

  await ddbPutPlainItem({
    tableName,
    item,
    conditionExpression: "attribute_not_exists(requestId)",
  });

  await sqsSend({
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify({
      eventType: "assembly_request.created",
      requestId,
      createdAt,
      warehouseCode: item.warehouseCode,
      userId: access.profile.userId,
    }),
  });

  return json(201, {
    ok: true,
    apiVersion: "v1",
    requestId,
    status: item.status,
    createdAt,
  });
}
