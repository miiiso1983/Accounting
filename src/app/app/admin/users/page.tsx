import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getMessages } from "@/lib/i18n/messages";
import { getRequestLocale } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translate";

import { UsersClient } from "./UsersClient";

export default async function UsersAdminPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  if (!hasPermission(session, PERMISSIONS.USERS_READ)) {
    return <div className="rounded-2xl border bg-white p-5 text-sm">Not authorized.</div>;
  }

  const locale = await getRequestLocale();
  const messages = getMessages(locale);
  const t = createTranslator(messages);

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  const companyId = user?.companyId;
  if (!companyId) return <div className="rounded-2xl border bg-white p-5 text-sm">No company assigned.</div>;

  const [users, allRoles, allPermissions] = await Promise.all([
    prisma.user.findMany({
      where: { companyId },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        permissions: {
          select: {
            permission: { select: { id: true, key: true, description: true } },
          },
        },
        roles: {
          select: {
            role: { select: { id: true, key: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.role.findMany({
      select: { id: true, key: true, name: true },
      orderBy: { key: "asc" },
    }),
    prisma.permission.findMany({
      select: { id: true, key: true, description: true },
      orderBy: { key: "asc" },
    }),
  ]);

  const labels = {
    name: t("admin.users.name"),
    email: t("admin.users.email"),
    password: t("admin.users.password"),
    confirmPassword: t("admin.users.confirmPassword"),
    permissions: t("admin.users.permissions"),
    roles: t("admin.users.roles"),
    noRoles: t("admin.users.noRoles"),
    noPermissions: t("admin.users.noPermissions"),
    saveAccess: t("admin.users.saveAccess"),
    saving: t("admin.users.saving"),
    saved: t("admin.users.saved"),
    noUsers: t("admin.users.noUsers"),
    createUser: t("admin.users.createUser"),
    createHint: t("admin.users.createHint"),
    create: t("admin.users.create"),
    creating: t("admin.users.creating"),
    createdUser: t("admin.users.createdUser"),
    failedCreate: t("admin.users.failedCreate"),
    failedSave: t("admin.users.failedSave"),
    passwordMismatch: t("admin.users.passwordMismatch"),
    passwordMin: t("admin.users.passwordMin"),
    namePlaceholder: t("admin.users.namePlaceholder"),
    emailPlaceholder: t("admin.users.emailPlaceholder"),
  };

  return (
    <div className="rounded-3xl border border-sky-200/60 bg-white/80 p-5 shadow-xl shadow-emerald-200/25 backdrop-blur ring-1 ring-sky-200/40">
      <div className="text-sm text-zinc-500">{t("admin.users.subtitle")}</div>
      <div className="mt-1 text-base font-medium text-zinc-900">{t("admin.users.title")}</div>

      <UsersClient users={users} allRoles={allRoles} allPermissions={allPermissions} labels={labels} />
    </div>
  );
}

