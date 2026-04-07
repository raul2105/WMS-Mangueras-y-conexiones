import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import type { User as NextAuthUser } from "next-auth";
import authConfig from "@/auth.config";
import prisma from "@/lib/prisma";
function buildAuthUser(
  user: {
    id: string;
    name: string | null;
    email: string;
    userRoles: Array<{
      role: {
        code: string;
        rolePermissions: Array<{ permission: { code: string } }>;
      };
    }>;
  },
): NextAuthUser {
  const roles = Array.from(new Set(user.userRoles.map((ur) => ur.role.code)));
  const permissions = Array.from(
    new Set(user.userRoles.flatMap((ur) => ur.role.rolePermissions.map((rp) => rp.permission.code))),
  );
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
        const email = String(credentials?.email ?? "").trim().toLowerCase();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({
          where: { email },
          include: {
            userRoles: {
              include: {
                role: {
                  include: {
                    rolePermissions: {
                      include: { permission: true },
                    },
                  },
                },
              },
            },
          },
        });

        if (!user || !user.isActive) return null;
        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) return null;

        return buildAuthUser(user);
      },
    }),
  ],
});
