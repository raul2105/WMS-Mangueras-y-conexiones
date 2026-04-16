import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import type { User as NextAuthUser } from "next-auth";
import authConfig from "@/auth.config";
import prisma from "@/lib/prisma";
import { startPerf } from "@/lib/perf";
import { getPermissionsForRoles } from "@/lib/rbac/role-permissions";
function buildAuthUser(
  user: {
    id: string;
    name: string;
    email: string;
  },
  roles: string[],
): NextAuthUser {
  const permissions = getPermissionsForRoles(roles);
  return { id: user.id, name: user.name, email: user.email, roles, permissions };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials): Promise<NextAuthUser | null> {
        const perf = startPerf("auth.authorize");
        const email = String(credentials?.email ?? "").trim().toLowerCase();
        const password = String(credentials?.password ?? "");
        if (!email || !password) {
          perf.end({ ok: false, reason: "missing_credentials" });
          return null;
        }

        // Fetch user and roles in parallel — roles query uses email filter
        // so it can run concurrently before we have the userId.
        const userPerf = startPerf("auth.authorize.user_minimal");
        const rolePerf = startPerf("auth.authorize.roles");
        const [user, userRoles] = await Promise.all([
          prisma.user.findUnique({
            where: { email },
            select: {
              id: true,
              name: true,
              email: true,
              isActive: true,
              passwordHash: true,
            },
          }),
          prisma.userRole.findMany({
            where: {
              user: { email },
              role: { isActive: true },
            },
            select: {
              role: {
                select: {
                  code: true,
                },
              },
            },
          }),
        ]);
        userPerf.end({ found: Boolean(user) });
        rolePerf.end({ roleCount: userRoles.length });

        if (!user || !user.isActive) {
          perf.end({ ok: false, reason: "user_not_active" });
          return null;
        }

        const bcryptPerf = startPerf("auth.authorize.bcrypt");
        const isValid = await bcrypt.compare(password, user.passwordHash);
        bcryptPerf.end({ ok: isValid });
        if (!isValid) {
          perf.end({ ok: false, reason: "invalid_password" });
          return null;
        }

        const roles = userRoles.map((entry) => entry.role.code);
        const authUser = buildAuthUser(user, roles);
        perf.end({ ok: true, roleCount: authUser.roles.length, permissionCount: authUser.permissions.length });
        return authUser;
      },
    }),
  ],
});
