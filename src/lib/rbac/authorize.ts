import type { PermissionKey } from "@/lib/rbac/permissions";

export type SessionAuthz = {
  user?: {
    id: string;
    roleKeys?: string[];
    permissionKeys?: string[];
    isActive?: boolean;
  };
};

export function hasPermission(session: SessionAuthz | null | undefined, permission: PermissionKey) {
  if (session?.user?.isActive === false) return false;
  const keys = session?.user?.permissionKeys ?? [];
  return keys.includes(permission) || keys.includes("admin:all");
}
