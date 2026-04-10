function getConfig() {
  return window.__WMS_MOBILE_CONFIG__ || { apiBaseUrl: "" };
}

function makeUrl(path) {
  const baseUrl = String(getConfig().apiBaseUrl || "").replace(/\/+$/, "");
  return baseUrl ? `${baseUrl}${path}` : path;
}

function buildPath(path, query) {
  if (!query || typeof query !== "object") return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const queryString = params.toString();
  return queryString ? `${path}?${queryString}` : path;
}

async function request(path, options = {}) {
  const { token, method = "GET", body, query } = options;
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(makeUrl(buildPath(path, query)), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => ({ ok: false, error: "Invalid JSON" }));
  return {
    ok: response.ok,
    status: response.status,
    payload,
  };
}

export function fetchHealth() {
  return request("/v1/mobile/health");
}

export function fetchVersion() {
  return request("/v1/mobile/version");
}

export function fetchMePermissions(token) {
  return request("/v1/mobile/me/permissions", { token });
}

export function fetchCatalog(token, params) {
  return request("/v1/mobile/catalog", { token, query: params });
}

export function fetchCatalogItem(token, productId) {
  return request(`/v1/mobile/catalog/${encodeURIComponent(productId)}`, { token });
}

export function searchInventory(token, params) {
  return request("/v1/mobile/inventory/search", { token, query: params });
}

export function fetchSalesRequests(token, params) {
  return request("/v1/mobile/sales-requests", { token, query: params });
}

export function fetchSalesRequest(token, requestId) {
  return request(`/v1/mobile/sales-requests/${encodeURIComponent(requestId)}`, { token });
}

export function createSalesRequest(token, payload) {
  return request("/v1/mobile/sales-requests", {
    token,
    method: "POST",
    body: payload,
  });
}

export function fetchAvailability(token, params) {
  return request("/v1/mobile/availability", { token, query: params });
}

export function fetchEquivalences(token, params) {
  return request("/v1/mobile/equivalences", { token, query: params });
}

export function createAssemblyRequest(token, payload) {
  return request("/v1/mobile/assembly-requests", {
    token,
    method: "POST",
    body: payload,
  });
}

export function fetchAssemblyRequest(token, requestId) {
  return request(`/v1/mobile/assembly-requests/${encodeURIComponent(requestId)}`, {
    token,
  });
}

export function createProductDraft(token, payload) {
  return request("/v1/mobile/product-drafts", {
    token,
    method: "POST",
    body: payload,
  });
}
