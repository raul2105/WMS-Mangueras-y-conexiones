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
  callbacks: {
    ...authConfig.callbacks,
    async jwt(args) {
      const token = await authConfig.callbacks.jwt(args);
      const userId = String(token.uid ?? token.sub ?? "");
      if (!userId) return null;

      // Tokens identify the account; the database remains authoritative for
      // deactivation and role revocation on every server session validation.
      const currentUser = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true, name: true, email: true, isActive: true,
          userRoles: {
            where: { role: { isActive: true } },
            select: { role: { select: { code: true } } },
          },
        },
      });
      if (!currentUser?.isActive) return null;

      const roles = currentUser.userRoles.map((entry) => entry.role.code);
      token.uid = currentUser.id;
      token.name = currentUser.name;
      token.email = currentUser.email;
      token.roles = roles;
      token.permVersion = [...roles].sort().join("|");
      return token;
    },
  },
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

        // Authenticate before fetching roles so invalid attempts use only one
        // database operation and do not occupy both serverless pool slots.
        const userPerf = startPerf("auth.authorize.user_minimal");
        const user = await prisma.user.findUnique({
            where: { email },
            select: {
              id: true,
              name: true,
              email: true,
              isActive: true,
              passwordHash: true,
            },
          });
        userPerf.end({ found: Boolean(user) });

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

        const rolePerf = startPerf("auth.authorize.roles");
        const userRoles = await prisma.userRole.findMany({
          where: { userId: user.id, role: { isActive: true } },
          select: { role: { select: { code: true } } },
        });
        rolePerf.end({ roleCount: userRoles.length });
        const roles = userRoles.map((entry) => entry.role.code);
        const authUser = buildAuthUser(user, roles);
        perf.end({ ok: true, roleCount: authUser.roles.length, permissionCount: authUser.permissions.length });
        return authUser;
      },
    }),
  ],
});
