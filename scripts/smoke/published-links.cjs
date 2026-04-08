/* eslint-disable no-console */
const REQUIRED_ENV = ["MOBILE_PUBLISHED_URL", "MOBILE_API_BASE_URL"];

function getEnv(name, fallback = "") {
  return String(process.env[name] || fallback).trim();
}

function requireEnv(name) {
  const value = getEnv(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function ensureTrailingSlashless(url) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

async function requestJson(url, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  let json = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return { response, text, json };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function run() {
  for (const envName of REQUIRED_ENV) {
    requireEnv(envName);
  }

  const publishedBase = ensureTrailingSlashless(requireEnv("MOBILE_PUBLISHED_URL"));
  const apiBase = ensureTrailingSlashless(requireEnv("MOBILE_API_BASE_URL"));
  const bearerToken = getEnv("MOBILE_AUTH_BEARER_TOKEN");

  const pwaUrl = `${publishedBase}/index.html`;
  const healthUrl = `${apiBase}/v1/mobile/health`;
  const versionUrl = `${apiBase}/v1/mobile/version`;
  const mePermissionsUrl = `${apiBase}/v1/mobile/me/permissions`;

  console.log(`[smoke] PWA URL: ${pwaUrl}`);
  console.log(`[smoke] API URL: ${apiBase}`);

  const pwa = await fetch(pwaUrl, { method: "GET" });
  assert(pwa.ok, `PWA is not reachable: ${pwa.status} ${pwa.statusText}`);
  const pwaHtml = await pwa.text();
  assert(/WMS Mobile/i.test(pwaHtml), "PWA response does not contain expected app marker");

  const health = await requestJson(healthUrl);
  assert(health.response.ok, `Health failed: ${health.response.status}`);
  assert(health.json && health.json.ok === true, "Health payload missing ok=true");

  const version = await requestJson(versionUrl);
  assert(version.response.ok, `Version failed: ${version.response.status}`);
  assert(version.json && version.json.apiVersion === "v1", "Version payload missing apiVersion=v1");

  const meHeaders = bearerToken
    ? { Authorization: `Bearer ${bearerToken}` }
    : {};
  const me = await requestJson(mePermissionsUrl, { method: "GET", headers: meHeaders });

  if (bearerToken) {
    assert(me.response.ok, `me/permissions failed with token: ${me.response.status}`);
    assert(me.json && me.json.ok === true, "me/permissions payload missing ok=true");
  } else {
    assert(
      me.response.status === 401 || me.response.status === 403,
      `me/permissions without token should return 401/403, got ${me.response.status}`,
    );
  }

  console.log("[smoke] published links OK");
}

run().catch((error) => {
  console.error(`[smoke] FAILED: ${error.message}`);
  process.exit(1);
});
