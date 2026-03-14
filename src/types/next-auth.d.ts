import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      roleKeys: string[];
      permissionKeys: string[];
      isActive: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    roleKeys?: string[];
    permissionKeys?: string[];
    isActive?: boolean;
  }
}

export {};
