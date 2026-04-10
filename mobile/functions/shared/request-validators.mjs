export function parsePositiveInt(value, fallback, max = 50) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

export function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

export function requireEnv(name, env = process.env) {
  const value = env[name];
  if (!value || String(value).trim().length === 0) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return String(value).trim();
}

export function parseBody(event) {
  if (!event?.body) return {};
  if (typeof event.body === "string") {
    try {
      return JSON.parse(event.body);
    } catch {
      return {};
    }
  }
  return event.body;
}

export function validateRequiredFields(payload, requiredFields) {
  for (const key of requiredFields) {
    const value = payload[key];
    if (value == null || String(value).trim().length === 0) {
      return { ok: false, missingField: key };
    }
  }
  return { ok: true };
}
