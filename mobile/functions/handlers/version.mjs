import { json, nowIso } from "../shared/response.mjs";
import { readFlags } from "../shared/flags.mjs";

export async function handler() {
  return json(200, {
    ok: true,
    apiVersion: "v1",
    build: process.env.MOBILE_BUILD || "dev",
    releaseDate: process.env.MOBILE_RELEASE_DATE || nowIso().slice(0, 10),
    flags: readFlags(),
    timestamp: nowIso(),
  });
}
