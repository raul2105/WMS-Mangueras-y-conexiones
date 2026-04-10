import { json, nowIso } from "../shared/response.mjs";

export async function handler() {
  return json(200, {
    ok: true,
    service: process.env.MOBILE_SERVICE_NAME || "wms-mobile-edge",
    apiVersion: "v1",
    timestamp: nowIso(),
  });
}
