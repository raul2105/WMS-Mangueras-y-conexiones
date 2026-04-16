import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import authConfig from "@/auth.config";
import type { NextAuthRequest } from "next-auth";

const { auth } = NextAuth(authConfig);

function isPublicPath(pathname: string) {
  return (
    pathname === "/login" ||
    pathname === "/logout" ||
    pathname === "/forbidden" ||
    pathname === "/api/health" ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/api/auth/")
  );
}

function unauthorizedResponse(pathname: string, requestUrl: string, requestId: string) {
  if (pathname.startsWith("/api/")) {
    const response = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    response.headers.set("x-request-id", requestId);
    return response;
  }

  const loginUrl = new URL("/login", requestUrl);
  loginUrl.searchParams.set("callbackUrl", pathname);
  const response = NextResponse.redirect(loginUrl);
  response.headers.set("x-request-id", requestId);
  return response;
}

export default auth((request: NextAuthRequest) => {
  const { pathname } = request.nextUrl;
  const startedAt = Date.now();
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  response.headers.set("x-pathname", pathname);
  response.headers.set("x-request-id", requestId);

  if (isPublicPath(pathname)) {
    console.info("[perf] proxy.auth_check", {
      requestId,
      pathname,
      isPublicPath: true,
      durationMs: Date.now() - startedAt,
    });
    return response;
  }

  if (!request.auth?.user) {
    console.info("[perf] proxy.auth_check", {
      requestId,
      pathname,
      isPublicPath: false,
      authorized: false,
      durationMs: Date.now() - startedAt,
    });
    return unauthorizedResponse(pathname, request.url, requestId);
  }

  console.info("[perf] proxy.auth_check", {
    requestId,
    pathname,
    isPublicPath: false,
    authorized: true,
    durationMs: Date.now() - startedAt,
  });
  return response;
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login|logout|forbidden|api/auth|api/health).*)"],
};
