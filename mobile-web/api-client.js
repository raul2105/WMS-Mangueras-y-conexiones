function getConfig() {
  return window.__WMS_MOBILE_CONFIG__ || { apiBaseUrl: "" };
}

function makeUrl(path) {
  const baseUrl = String(getConfig().apiBaseUrl || "").replace(/\/+$/, "");
  return baseUrl ? `${baseUrl}${path}` : path;
}

async function request(path, token) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(makeUrl(path), { headers });
  const payload = await response.json().catch(() => ({ ok: false, error: "Invalid JSON" }));
  return { status: response.status, payload };
}

export function fetchHealth() {
  return request("/v1/mobile/health");
}

export function fetchVersion() {
  return request("/v1/mobile/version");
}

export function fetchMePermissions(token) {
  return request("/v1/mobile/me/permissions", token);
}
