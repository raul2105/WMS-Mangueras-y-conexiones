import { clearSession, getSession, setSession } from "./session-store.js";

const PKCE_KEY = "wms-mobile-pkce-verifier";
const OAUTH_STATE_KEY = "wms-mobile-oauth-state";

function normalizeDomain(input) {
  const raw = String(input || "").trim();
  return raw.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

function getConfig() {
  const provided = window.__WMS_MOBILE_CONFIG__ || {};
  return {
    authMode: provided.authMode || "mock",
    environment: provided.environment || "dev",
    cognito: {
      domain: normalizeDomain(provided.cognito?.domain || ""),
      clientId: provided.cognito?.clientId || "",
      redirectUri: provided.cognito?.redirectUri || window.location.href,
      logoutUri: provided.cognito?.logoutUri || window.location.href,
      scope: provided.cognito?.scope || "openid email profile",
    },
  };
}

function base64UrlEncode(bytes) {
  const str = btoa(String.fromCharCode(...bytes));
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(input) {
  const bytes = new TextEncoder().encode(input);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

function generateRandomString(length = 64) {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const values = new Uint8Array(length);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => charset[value % charset.length]).join("");
}

function parseJwt(token) {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload;
  } catch {
    return null;
  }
}

function getCodeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("code");
}

function getAuthErrorFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const error = params.get("error");
  if (!error) return null;
  const description = params.get("error_description");
  return {
    error,
    description: description ? decodeURIComponent(description) : "",
  };
}

function validateStateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const stateFromUrl = params.get("state");
  const expectedState = sessionStorage.getItem(OAUTH_STATE_KEY);
  if (!stateFromUrl || !expectedState || stateFromUrl !== expectedState) {
    throw new Error("OAuth state mismatch");
  }
}

function clearAuthCodeFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("code");
  url.searchParams.delete("state");
  url.searchParams.delete("error");
  url.searchParams.delete("error_description");
  window.history.replaceState({}, "", url.toString());
}

async function exchangeCodeForToken(code, cfg) {
  const verifier = sessionStorage.getItem(PKCE_KEY);
  if (!verifier) {
    throw new Error("Missing PKCE verifier");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: cfg.clientId,
    code,
    redirect_uri: cfg.redirectUri,
    code_verifier: verifier,
  });

  const response = await fetch(`https://${cfg.domain}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!response.ok) {
    throw new Error(`Token exchange failed (${response.status})`);
  }
  return response.json();
}

export async function restoreSession() {
  const cfg = getConfig();
  if (cfg.authMode === "mock") {
    const existing = getSession();
    if (existing) return existing;
    const mockSession = {
      authMode: "mock",
      token: "mock-token",
      displayName: "Mock Session",
      userId: "mock-manager",
      email: "manager@scmayher.com",
      roleCodes: ["MANAGER"],
    };
    setSession(mockSession);
    return mockSession;
  }

  const existing = getSession();
  if (existing) return existing;

  const authError = getAuthErrorFromUrl();
  if (authError) {
    clearAuthCodeFromUrl();
    throw new Error(`Cognito login error: ${authError.error}${authError.description ? ` (${authError.description})` : ""}`);
  }

  const code = getCodeFromUrl();
  if (!code) return null;

  validateStateFromUrl();

  const tokenResult = await exchangeCodeForToken(code, cfg.cognito);
  clearAuthCodeFromUrl();
  sessionStorage.removeItem(OAUTH_STATE_KEY);
  const idClaims = tokenResult.id_token ? parseJwt(tokenResult.id_token) : null;
  const accessClaims = tokenResult.access_token ? parseJwt(tokenResult.access_token) : null;
  const claims = idClaims || accessClaims || {};
  const session = {
    authMode: "cognito",
    token: tokenResult.id_token || tokenResult.access_token,
    displayName: claims.name || claims.email || "Mobile User",
    userId: claims.sub || "",
    email: claims.email || "",
    roleCodes: typeof claims["custom:role_codes"] === "string"
      ? claims["custom:role_codes"].split(",").map((value) => value.trim()).filter(Boolean)
      : typeof claims["custom:role_code"] === "string" && claims["custom:role_code"].trim()
      ? [claims["custom:role_code"].trim()]
      : Array.isArray(claims["cognito:groups"])
      ? claims["cognito:groups"].map((value) => String(value).trim()).filter(Boolean)
      : [],
  };
  setSession(session);
  return session;
}

export async function startLogin() {
  const cfg = getConfig();
  if (cfg.authMode === "mock") {
    const mockSession = {
      authMode: "mock",
      token: "mock-token",
      displayName: "Mock Session",
      userId: "mock-manager",
      email: "manager@scmayher.com",
      roleCodes: ["MANAGER"],
    };
    setSession(mockSession);
    return;
  }
  if (!cfg.cognito.domain || !cfg.cognito.clientId) {
    throw new Error("Missing Cognito config");
  }

  const verifier = generateRandomString(64);
  const challenge = base64UrlEncode(await sha256(verifier));
  const state = generateRandomString(24);
  sessionStorage.setItem(PKCE_KEY, verifier);
  sessionStorage.setItem(OAUTH_STATE_KEY, state);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: cfg.cognito.clientId,
    redirect_uri: cfg.cognito.redirectUri,
    scope: cfg.cognito.scope || "openid email profile",
    code_challenge_method: "S256",
    code_challenge: challenge,
    state,
  });
  window.location.assign(`https://${cfg.cognito.domain}/oauth2/authorize?${params.toString()}`);
}

export function logout() {
  const cfg = getConfig();
  clearSession();
  sessionStorage.removeItem(PKCE_KEY);
  sessionStorage.removeItem(OAUTH_STATE_KEY);

  if (cfg.authMode !== "cognito") return;

  const params = new URLSearchParams({
    client_id: cfg.cognito.clientId,
    logout_uri: cfg.cognito.logoutUri,
  });
  window.location.assign(`https://${cfg.cognito.domain}/logout?${params.toString()}`);
}
