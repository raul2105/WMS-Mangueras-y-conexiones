import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const AUTH_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "__Host-authjs.session-token",
  "authjs.callback-url",
  "__Secure-authjs.callback-url",
  "__Host-authjs.callback-url",
  "authjs.csrf-token",
  "__Secure-authjs.csrf-token",
  "__Host-authjs.csrf-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
  "__Host-next-auth.session-token",
  "next-auth.callback-url",
  "__Secure-next-auth.callback-url",
  "__Host-next-auth.callback-url",
  "next-auth.csrf-token",
  "__Secure-next-auth.csrf-token",
  "__Host-next-auth.csrf-token",
];

function extractAuthCookieNames(request: Request): string[] {
  const cookieHeader = request.headers.get("cookie") ?? "";
  if (!cookieHeader) return [];

  const names = new Set<string>();
  for (const raw of cookieHeader.split(";")) {
    const [nameRaw] = raw.trim().split("=", 1);
    const name = (nameRaw ?? "").trim();
    if (!name) continue;

    const isAuthCookie =
      name.startsWith("authjs.") ||
      name.startsWith("__Secure-authjs.") ||
      name.startsWith("__Host-authjs.") ||
      name.startsWith("next-auth.") ||
      name.startsWith("__Secure-next-auth.") ||
      name.startsWith("__Host-next-auth.");

    if (isAuthCookie) {
      names.add(name);
    }
  }

  return Array.from(names);
}

async function performLogout(request: Request) {
  const redirectUrl = new URL("/login", request.url);

  console.info("[auth] logout requested", { path: new URL(request.url).pathname });

  const response = NextResponse.redirect(redirectUrl);
  const dynamicAuthCookies = extractAuthCookieNames(request);
  const cookieNames = Array.from(new Set([...AUTH_COOKIE_NAMES, ...dynamicAuthCookies]));

  for (const cookieName of cookieNames) {
    response.cookies.set({
      name: cookieName,
      value: "",
      maxAge: 0,
      expires: new Date(0),
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: true,
    });
  }

  console.info("[auth] logout completed", {
    path: new URL(request.url).pathname,
    clearedCookieCount: cookieNames.length,
  });

  return response;
}

export async function GET(request: Request) {
  return performLogout(request);
}

export async function POST(request: Request) {
  return performLogout(request);
}
