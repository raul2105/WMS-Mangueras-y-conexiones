const FALLBACK_CALLBACK_URL = "/";

export function sanitizeCallbackUrl(rawValue: string | null | undefined): string {
  const value = String(rawValue ?? "").trim();
  if (!value) return FALLBACK_CALLBACK_URL;

  if (!value.startsWith("/")) return FALLBACK_CALLBACK_URL;
  if (value.startsWith("//")) return FALLBACK_CALLBACK_URL;

  try {
    const normalized = new URL(value, "http://localhost");
    if (normalized.origin !== "http://localhost") return FALLBACK_CALLBACK_URL;
    if (!normalized.pathname.startsWith("/")) return FALLBACK_CALLBACK_URL;
    return `${normalized.pathname}${normalized.search}${normalized.hash}`;
  } catch {
    return FALLBACK_CALLBACK_URL;
  }
}
