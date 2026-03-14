import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/db/prisma";

async function getUserAuthz(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      permissions: {
        include: {
          permission: true,
        },
      },
      roles: {
        include: {
          role: {
            include: {
              permissions: { include: { permission: true } },
            },
          },
        },
      },
    },
  });
  if (!user?.isActive) {
    return { roleKeys: [], permissionKeys: [], isActive: false };
  }
  const roleKeys = user?.roles.map((r) => r.role.key) ?? [];
  const rolePermissionKeys = user?.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.key)) ?? [];
  const directPermissionKeys = user?.permissions.map((p) => p.permission.key) ?? [];
  const permissionKeys = Array.from(new Set([...rolePermissionKeys, ...directPermissionKeys]));
  return { roleKeys, permissionKeys, isActive: true };
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.toLowerCase().trim();
        const password = credentials?.password;
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash || !user.isActive) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      const userId = typeof user?.id === "string" && user.id.length > 0 ? user.id : token.sub;
      if (typeof userId === "string" && userId.length > 0) {
        token.sub = userId;
        const authz = await getUserAuthz(userId);
        token.roleKeys = authz.roleKeys;
        token.permissionKeys = authz.permissionKeys;
        token.isActive = authz.isActive;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      session.user.roleKeys = token.roleKeys ?? [];
      session.user.permissionKeys = token.permissionKeys ?? [];
      session.user.isActive = token.isActive ?? false;
      return session;
    },
  },
};
