import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import authConfig from "@/auth.config";
import { getRequiredPermissionForPath } from "@/lib/rbac/route-permissions";
import { isSystemAdmin } from "@/lib/rbac/permissions";
import type { NextAuthRequest } from "next-auth";

const { auth } = NextAuth(authConfig);

function isPublicPath(pathname: string) {
  return (
    pathname === "/login" ||
    pathname === "/forbidden" ||
    pathname === "/api/health" ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/api/auth/")
  );
}

function unauthorizedResponse(pathname: string, requestUrl: string) {
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", requestUrl);
  loginUrl.searchParams.set("callbackUrl", pathname);
  return NextResponse.redirect(loginUrl);
}

function forbiddenResponse(pathname: string, requestUrl: string) {
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const deniedUrl = new URL("/forbidden", requestUrl);
  deniedUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(deniedUrl);
}

export default auth((request: NextAuthRequest) => {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    // Pass x-pathname header so PageGuard can read the current path
    const response = NextResponse.next();
    response.headers.set("x-pathname", pathname);
    return response;
  }

  const sessionUser = request.auth?.user;
  if (!sessionUser) {
    return unauthorizedResponse(pathname, request.url);
  }

  const requiredPermission = getRequiredPermissionForPath(pathname);

  // Access custom session fields — augmented via types/next-auth.d.ts
  const user = sessionUser as typeof sessionUser & { roles?: string[]; permissions?: string[] };
  const userRoles = user.roles ?? [];
  const userPermissions = user.permissions ?? [];

  if (!requiredPermission || isSystemAdmin(userRoles) || userPermissions.includes(requiredPermission)) {
    const response = NextResponse.next();
    response.headers.set("x-pathname", pathname);
    return response;
  }

  return forbiddenResponse(pathname, request.url);
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
