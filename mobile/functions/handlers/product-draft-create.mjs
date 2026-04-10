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

  if (!hasPermission(access, "product_drafts.create")) {
    return json(403, { ok: false, error: "Forbidden" });
  }

  const payload = parseBody(event);
  const validation = validateRequiredFields(payload, ["name", "draftType"]);
  if (!validation.ok) {
    return json(400, { ok: false, error: "BadRequest", details: `Missing field ${validation.missingField}` });
  }

  const draftId = randomUUID();
  const createdAt = nowIso();
  const item = {
    draftId,
    kind: "PRODUCT_DRAFT",
    status: "PENDING_LOCAL_SYNC",
    createdAt,
    updatedAt: createdAt,
    createdByUserId: access.profile.userId,
    createdByDisplayName: access.profile.displayName,
    source: "mobile-cloud",
    payload,
  };

  const tableName = requireEnv("MOBILE_DDB_PRODUCT_DRAFTS_TABLE");
  const queueUrl = requireEnv("MOBILE_INTEGRATION_QUEUE_URL");

  await ddbPutPlainItem({
    tableName,
    item,
    conditionExpression: "attribute_not_exists(draftId)",
  });

  await sqsSend({
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify({
      eventType: "product_draft.created",
      draftId,
      createdAt,
      userId: access.profile.userId,
    }),
  });

  return json(201, {
    ok: true,
    apiVersion: "v1",
    draftId,
    status: item.status,
    createdAt,
  });
}
