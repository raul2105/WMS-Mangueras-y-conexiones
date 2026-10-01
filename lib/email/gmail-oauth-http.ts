import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session-context";
import { GMAIL_OAUTH_STATE_COOKIE, GMAIL_OAUTH_STATE_TTL_SECONDS } from "@/lib/email/gmail-oauth-state";

export type GmailManagerAccess =
  | { allowed: true; userId: string }
  | { allowed: false; reason: "unauthenticated" | "forbidden" };

export const GMAIL_OAUTH_STATE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: GMAIL_OAUTH_STATE_TTL_SECONDS,
};

export function getGmailOAuthStateSecret() {
  return process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "";
}

export function getWmsOrigin() {
  const baseUrl = process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? process.env.NEXT_PUBLIC_APP_BASE_URL;
  if (!baseUrl) return null;

  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "https:" && url.hostname !== "localhost") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function isSameOriginPost(request: Request, expectedOrigin = getWmsOrigin()) {
  const requestOrigin = new URL(request.url).origin;
  const originHeader = request.headers.get("origin");
  return Boolean(expectedOrigin && originHeader && originHeader === expectedOrigin && requestOrigin === expectedOrigin);
}

export async function getGmailManagerAccess(): Promise<GmailManagerAccess> {
  const context = await getSessionContext();
  if (!context.isAuthenticated || !context.user?.id) return { allowed: false, reason: "unauthenticated" };
  if (!context.roles.includes("MANAGER") || !context.permissions.includes("purchasing.manage")) {
    return { allowed: false, reason: "forbidden" };
  }
  return { allowed: true, userId: context.user.id };
}

export type GmailSettingsResult = "connected" | "disconnected" | "error" | "unavailable" | "expired";

export function settingsResultRedirect(result: GmailSettingsResult) {
  const origin = getWmsOrigin();
  if (!origin) {
    const response = new NextResponse("No se pudo validar la URL segura del WMS.", { status: 503 });
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  }

  const response = NextResponse.redirect(new URL(`/purchasing/email?result=${encodeURIComponent(result)}`, origin), 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export function settingsRedirect(path: "/login?callbackUrl=%2Fpurchasing%2Femail" | "/forbidden?from=%2Fpurchasing%2Femail") {
  const origin = getWmsOrigin();
  if (!origin) {
    const response = new NextResponse("No se pudo validar la URL segura del WMS.", { status: 503 });
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  }

  const response = NextResponse.redirect(new URL(path, origin), 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export function clearGmailOAuthStateCookie(response: NextResponse) {
  response.cookies.set(GMAIL_OAUTH_STATE_COOKIE, "", {
    ...GMAIL_OAUTH_STATE_COOKIE_OPTIONS,
    maxAge: 0,
    expires: new Date(0),
  });
  return response;
}

export function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
