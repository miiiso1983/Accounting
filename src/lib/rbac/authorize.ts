import type { PermissionKey } from "@/lib/rbac/permissions";

export type SessionAuthz = {
  user?: {
    id: string;
    roleKeys?: string[];
    permissionKeys?: string[];
  };
};

export function hasPermission(session: SessionAuthz | null | undefined, permission: PermissionKey) {
  const keys = session?.user?.permissionKeys ?? [];
  return keys.includes(permission) || keys.includes("admin:all");
}
