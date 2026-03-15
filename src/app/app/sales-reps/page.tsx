import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export default async function SalesRepsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  if (!hasPermission(session, PERMISSIONS.SALES_REP_READ)) {
    return <div className="rounded-2xl border bg-white p-5 text-sm">Not authorized.</div>;
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  const companyId = user?.companyId;
  if (!companyId) return <div className="rounded-2xl border bg-white p-5 text-sm">No company assigned.</div>;

  const canWrite = hasPermission(session, PERMISSIONS.SALES_REP_WRITE);

  const reps = await prisma.salesRepresentative.findMany({
    where: { companyId },
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      isActive: true,
      _count: { select: { invoices: true } },
    },
  });

  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-zinc-500">Sales / المبيعات</div>
          <div className="mt-1 text-base font-medium text-zinc-900">Sales Representatives / المندوبين</div>
        </div>
        {canWrite ? (
          <Link className="rounded-xl bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-800" href="/app/sales-reps/new">
            + New Rep / مندوب جديد
          </Link>
        ) : null}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-zinc-500">
            <tr className="border-b">
              <th className="py-2 pr-3">Name / الاسم</th>
              <th className="py-2 pr-3">Email / البريد</th>
              <th className="py-2 pr-3">Phone / الهاتف</th>
              <th className="py-2 pr-3">Invoices / الفواتير</th>
              <th className="py-2 pr-3">Status / الحالة</th>
              <th className="py-2 pr-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {reps.map((rep) => (
              <tr key={rep.id} className="border-b last:border-b-0">
                <td className="py-2 pr-3 text-zinc-900">{rep.name}</td>
                <td className="py-2 pr-3 text-zinc-700">{rep.email || "-"}</td>
                <td className="py-2 pr-3 text-zinc-700">{rep.phone || "-"}</td>
                <td className="py-2 pr-3 font-mono text-zinc-700">{rep._count.invoices}</td>
                <td className="py-2 pr-3">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${rep.isActive ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500"}`}>
                    {rep.isActive ? "Active / نشط" : "Inactive / غير نشط"}
                  </span>
                </td>
                <td className="py-2 pr-3">
                  <Link className="text-sm underline text-zinc-700" href={`/app/sales-reps/${rep.id}`}>
                    View / عرض
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {reps.length === 0 ? (
          <div className="mt-4 text-sm text-zinc-600">
            No sales representatives yet. / لا يوجد مندوبين بعد.
          </div>
        ) : null}
      </div>
    </div>
  );
}

