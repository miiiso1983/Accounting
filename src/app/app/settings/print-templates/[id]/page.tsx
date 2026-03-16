import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { PRINT_TEMPLATE_TYPE_LABELS } from "@/lib/settings/print-templates";

import { PrintTemplateEditForm } from "./edit-ui";

export default async function PrintTemplateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  if (!hasPermission(session, PERMISSIONS.SETTINGS_WRITE)) {
    return <div className="rounded-2xl border bg-white p-5 text-sm">Not authorized.</div>;
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  const companyId = user?.companyId;
  if (!companyId) return <div className="rounded-2xl border bg-white p-5 text-sm">No company assigned.</div>;

  const template = await prisma.printTemplate.findFirst({ where: { id, companyId } });
  if (!template) return <div className="rounded-2xl border bg-white p-5 text-sm">Not found.</div>;

  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-zinc-500">Print Templates / نماذج الطباعة</div>
          <div className="mt-1 text-base font-medium text-zinc-900">{template.name}</div>
          <div className="mt-0.5 text-xs text-zinc-500">Updated {template.updatedAt.toISOString().slice(0, 10)}</div>
        </div>
        <Link className="text-sm underline text-zinc-700" href="/app/settings/print-templates">
          Back / رجوع
        </Link>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border p-3">
          <div className="text-xs text-zinc-500">Type / النوع</div>
          <div className="mt-1 text-sm text-zinc-900">{PRINT_TEMPLATE_TYPE_LABELS[template.type]}</div>
        </div>
        <div className="rounded-xl border p-3">
          <div className="text-xs text-zinc-500">Default / افتراضي</div>
          <div className="mt-1 text-sm text-zinc-900">{template.isDefault ? "Yes / نعم" : "No / لا"}</div>
        </div>
        <div className="rounded-xl border p-3">
          <div className="text-xs text-zinc-500">Logo URL / رابط الشعار</div>
          <div className="mt-1 truncate text-sm text-zinc-900">{template.logoUrl || "-"}</div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border p-4">
        <div className="mb-3 text-sm font-medium text-zinc-900">Edit / تعديل</div>
        <PrintTemplateEditForm
          template={{
            id: template.id,
            name: template.name,
            type: template.type,
            headerHtml: template.headerHtml,
            footerHtml: template.footerHtml,
            logoUrl: template.logoUrl ?? "",
            isDefault: template.isDefault,
          }}
        />
      </div>
    </div>
  );
}