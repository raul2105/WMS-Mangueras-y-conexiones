import type { NextAuthConfig } from "next-auth";
import { getPermissionsForRoles } from "@/lib/rbac/role-permissions";

const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.roles = Array.isArray(user.roles) ? user.roles : [];
        token.permVersion = Array.isArray(user.roles)
          ? [...user.roles].sort().join("|")
          : "";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const roles = Array.isArray(token.roles) ? token.roles : [];
        session.user.id = String(token.uid ?? "");
        session.user.roles = roles;
        session.user.permissions = getPermissionsForRoles(roles);
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;

export default authConfig;
