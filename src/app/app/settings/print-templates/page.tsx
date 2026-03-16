import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { PRINT_TEMPLATE_TYPE_LABELS } from "@/lib/settings/print-templates";

export default async function PrintTemplatesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  if (!hasPermission(session, PERMISSIONS.SETTINGS_WRITE)) {
    return <div className="rounded-2xl border bg-white p-5 text-sm">Not authorized.</div>;
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  const companyId = user?.companyId;
  if (!companyId) return <div className="rounded-2xl border bg-white p-5 text-sm">No company assigned.</div>;

  const templates = await prisma.printTemplate.findMany({
    where: { companyId },
    orderBy: [{ type: "asc" }, { isDefault: "desc" }, { name: "asc" }],
  });

  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-zinc-500">Settings / الإعدادات</div>
          <div className="mt-1 text-base font-medium text-zinc-900">Print Templates / نماذج الطباعة</div>
        </div>
        <Link className="rounded-xl bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-800" href="/app/settings/print-templates/new">
          + New Template / قالب جديد
        </Link>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-zinc-500">
            <tr className="border-b">
              <th className="py-2 pr-3">Name / الاسم</th>
              <th className="py-2 pr-3">Type / النوع</th>
              <th className="py-2 pr-3">Default / افتراضي</th>
              <th className="py-2 pr-3">Updated / التحديث</th>
              <th className="py-2 pr-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((template) => (
              <tr key={template.id} className="border-b last:border-b-0">
                <td className="py-2 pr-3 text-zinc-900">{template.name}</td>
                <td className="py-2 pr-3 text-zinc-700">{PRINT_TEMPLATE_TYPE_LABELS[template.type]}</td>
                <td className="py-2 pr-3">
                  {template.isDefault ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">Default / افتراضي</span>
                  ) : (
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">No / لا</span>
                  )}
                </td>
                <td className="py-2 pr-3 text-zinc-700">{template.updatedAt.toISOString().slice(0, 10)}</td>
                <td className="py-2 pr-3">
                  <Link className="text-sm underline text-zinc-700" href={`/app/settings/print-templates/${template.id}`}>
                    View / عرض
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {templates.length === 0 ? <div className="mt-4 text-sm text-zinc-600">No print templates yet. / لا توجد قوالب بعد.</div> : null}
      </div>
    </div>
  );
}