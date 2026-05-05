#!/usr/bin/env node
/* eslint-disable no-console */

function getArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return "";
  return String(process.argv[idx + 1] ?? "").trim();
}

function getEnv(name) {
  return String(process.env[name] ?? "").trim();
}

function normalizeBaseUrl(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function redactEmail(email) {
  const trimmed = String(email ?? "").trim();
  if (!trimmed.includes("@")) return trimmed || "n/a";
  const [user, domain] = trimmed.split("@");
  if (!user || !domain) return trimmed;
  return `${user.slice(0, 2)}***@${domain}`;
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
  return { response, json, text };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function runAuthSmoke(baseUrl, email, password) {
  console.log(`[smoke:web] auth smoke started for ${redactEmail(email)}`);

  const csrfResponse = await fetch(`${baseUrl}/api/auth/csrf`, { method: "GET", redirect: "manual" });
  const csrfText = await csrfResponse.text();
  let csrfJson = null;
  try {
    csrfJson = csrfText ? JSON.parse(csrfText) : null;
  } catch {
    csrfJson = null;
  }
  const csrfCookie = csrfResponse.headers.get("set-cookie") ?? "";
  const sessionCookie = csrfCookie.split(",").map((chunk) => chunk.split(";")[0].trim()).filter(Boolean).join("; ");
  const csrfResult = { response: csrfResponse, json: csrfJson };
  assert(csrfResult.response.ok, `No se pudo obtener csrf token (${csrfResult.response.status})`);
  const csrfToken = csrfResult.json?.csrfToken;
  assert(typeof csrfToken === "string" && csrfToken.length > 0, "Respuesta csrf sin token válido.");

  const body = new URLSearchParams({
    csrfToken,
    email,
    password,
    callbackUrl: `${baseUrl}/`,
    json: "true",
  });

  const loginResponse = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      cookie: sessionCookie,
    },
    body: body.toString(),
    redirect: "manual",
  });
  const location = loginResponse.headers.get("location") ?? "";
  const loginAllowedCodes = new Set([200, 302, 303]);
  assert(loginAllowedCodes.has(loginResponse.status), `Login devolvió status inesperado: ${loginResponse.status}`);
  assert(!location.includes("/login?error"), `Login rechazado por credenciales o auth config: ${location}`);

  const cookieHeader = loginResponse.headers.get("set-cookie") ?? "";
  assert(cookieHeader, "Login no devolvió cookie de sesión.");
  const loginCookies = cookieHeader.split(",").map((chunk) => chunk.split(";")[0].trim()).filter(Boolean);
  const cookieJar = [sessionCookie, ...loginCookies].filter(Boolean).join("; ");

  const protectedResponse = await fetch(`${baseUrl}/`, {
    headers: { cookie: cookieJar },
    redirect: "manual",
  });
  const protectedLocation = protectedResponse.headers.get("location") ?? "";
  assert(!protectedLocation.includes("/login"), "Ruta protegida siguió redirigiendo a /login.");

  const logoutResponse = await fetch(`${baseUrl}/logout`, {
    headers: { cookie: cookieJar },
    redirect: "manual",
  });
  assert([200, 302, 303, 307].includes(logoutResponse.status), `Logout devolvió status inesperado: ${logoutResponse.status}`);
  console.log("[smoke:web] auth smoke OK");
}

async function run() {
  const baseUrl = normalizeBaseUrl(
    getArg("--base-url") || getEnv("WMS_WEB_BASE_URL") || getEnv("CLOUDFRONT_URL") || getEnv("NEXT_PUBLIC_APP_BASE_URL"),
  );
  if (!baseUrl) {
    throw new Error("Falta URL base. Usa --base-url o define WMS_WEB_BASE_URL.");
  }

  console.log(`[smoke:web] baseUrl=${baseUrl}`);
  const health = await requestJson(`${baseUrl}/api/health`);
  assert(health.response.ok, `Health check falló con status ${health.response.status}.`);
  assert(health.json?.ok === true, "Health payload no contiene ok=true.");
  assert(typeof health.json?.db === "string", "Health payload no contiene campo db.");
  console.log(`[smoke:web] health OK (db=${health.json.db})`);

  const email = getEnv("WMS_SMOKE_AUTH_EMAIL");
  const password = getEnv("WMS_SMOKE_AUTH_PASSWORD");
  if (!email || !password) {
    console.log("[smoke:web] auth smoke SKIPPED (faltan WMS_SMOKE_AUTH_EMAIL/WMS_SMOKE_AUTH_PASSWORD)");
    return;
  }

  await runAuthSmoke(baseUrl, email, password);
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[smoke:web] FAILED: ${message}`);
  process.exit(1);
});
