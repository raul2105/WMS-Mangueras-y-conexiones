import { clearSession, getSession, setSession } from "./session-store.js";

const PKCE_KEY = "wms-mobile-pkce-verifier";

function getConfig() {
  const provided = window.__WMS_MOBILE_CONFIG__ || {};
  return {
    authMode: provided.authMode || "mock",
    cognito: {
      domain: provided.cognito?.domain || "",
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

function clearAuthCodeFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("code");
  url.searchParams.delete("state");
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
    };
    setSession(mockSession);
    return mockSession;
  }

  const existing = getSession();
  if (existing) return existing;

  const code = getCodeFromUrl();
  if (!code) return null;

  const tokenResult = await exchangeCodeForToken(code, cfg.cognito);
  clearAuthCodeFromUrl();
  const idClaims = tokenResult.id_token ? parseJwt(tokenResult.id_token) : null;
  const accessClaims = tokenResult.access_token ? parseJwt(tokenResult.access_token) : null;
  const claims = idClaims || accessClaims || {};
  const session = {
    authMode: "cognito",
    token: tokenResult.id_token || tokenResult.access_token,
    displayName: claims.name || claims.email || "Mobile User",
    userId: claims.sub || "",
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
    };
    setSession(mockSession);
    return;
  }
  if (!cfg.cognito.domain || !cfg.cognito.clientId) {
    throw new Error("Missing Cognito config");
  }

  const verifier = generateRandomString(64);
  const challenge = base64UrlEncode(await sha256(verifier));
  sessionStorage.setItem(PKCE_KEY, verifier);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: cfg.cognito.clientId,
    redirect_uri: cfg.cognito.redirectUri,
    scope: cfg.cognito.scope || "openid email profile",
    code_challenge_method: "S256",
    code_challenge: challenge,
  });
  window.location.assign(`https://${cfg.cognito.domain}/login?${params.toString()}`);
}

export function logout() {
  const cfg = getConfig();
  clearSession();
  sessionStorage.removeItem(PKCE_KEY);

  if (cfg.authMode !== "cognito") return;

  const params = new URLSearchParams({
    client_id: cfg.cognito.clientId,
    logout_uri: cfg.cognito.logoutUri,
  });
  window.location.assign(`https://${cfg.cognito.domain}/logout?${params.toString()}`);
}
