import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { formatDate } from "@/lib/format/date";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { SalesRepEditForm } from "./edit-ui";

export default async function SalesRepDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  if (!hasPermission(session, PERMISSIONS.SALES_REP_READ)) {
    return <div className="rounded-2xl border bg-white p-5 text-sm">Not authorized.</div>;
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  const companyId = user?.companyId;
  if (!companyId) return <div className="rounded-2xl border bg-white p-5 text-sm">No company assigned.</div>;

  const canWrite = hasPermission(session, PERMISSIONS.SALES_REP_WRITE);

  const rep = await prisma.salesRepresentative.findFirst({
    where: { id, companyId },
    include: { _count: { select: { invoices: true } } },
  });

  if (!rep) return <div className="rounded-2xl border bg-white p-5 text-sm">Not found.</div>;

  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-zinc-500">Sales Representatives / المندوبين</div>
          <div className="mt-1 text-base font-medium text-zinc-900">{rep.name}</div>
        </div>
        <Link className="text-sm underline text-zinc-700" href="/app/sales-reps">
          Back / رجوع
        </Link>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border p-3">
          <div className="text-xs text-zinc-500">Email / البريد</div>
          <div className="mt-1 text-sm text-zinc-900">{rep.email || "-"}</div>
        </div>
        <div className="rounded-xl border p-3">
          <div className="text-xs text-zinc-500">Phone / الهاتف</div>
          <div className="mt-1 text-sm text-zinc-900">{rep.phone || "-"}</div>
        </div>
        <div className="rounded-xl border p-3">
          <div className="text-xs text-zinc-500">Invoices / الفواتير</div>
          <div className="mt-1 text-sm font-mono text-zinc-900">{rep._count.invoices}</div>
        </div>
        <div className="rounded-xl border p-3">
          <div className="text-xs text-zinc-500">Status / الحالة</div>
          <div className="mt-1 text-sm">
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${rep.isActive ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500"}`}>
              {rep.isActive ? "Active / نشط" : "Inactive / غير نشط"}
            </span>
          </div>
        </div>
        <div className="rounded-xl border p-3">
          <div className="text-xs text-zinc-500">Created / تاريخ الإنشاء</div>
          <div className="mt-1 text-sm text-zinc-900">{formatDate(rep.createdAt)}</div>
        </div>
      </div>

      {canWrite ? (
        <div className="mt-6">
          <div className="text-sm font-medium text-zinc-900 mb-3">Edit / تعديل</div>
          <SalesRepEditForm
            repId={rep.id}
            initialData={{ name: rep.name, email: rep.email ?? "", phone: rep.phone ?? "", isActive: rep.isActive }}
          />
        </div>
      ) : null}
    </div>
  );
}

