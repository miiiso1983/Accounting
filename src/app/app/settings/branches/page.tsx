import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export default async function BranchesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  if (!hasPermission(session, PERMISSIONS.BRANCHES_READ)) {
    return <div className="rounded-2xl border bg-white p-5 text-sm">Not authorized.</div>;
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  const companyId = user?.companyId;
  if (!companyId) return <div className="rounded-2xl border bg-white p-5 text-sm">No company assigned.</div>;

  const canWrite = hasPermission(session, PERMISSIONS.BRANCHES_WRITE);
  const branches = await prisma.branch.findMany({
    where: { companyId },
    orderBy: [{ isActive: "desc" }, { code: "asc" }],
  });

  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-zinc-500">Settings / الإعدادات</div>
          <div className="mt-1 text-base font-medium text-zinc-900">Branches / الفروع</div>
        </div>
        {canWrite ? (
          <Link className="rounded-xl bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-800" href="/app/settings/branches/new">
            + New Branch / فرع جديد
          </Link>
        ) : null}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-zinc-500">
            <tr className="border-b">
              <th className="py-2 pr-3">Code / الرمز</th>
              <th className="py-2 pr-3">Name / الاسم</th>
              <th className="py-2 pr-3">Phone / الهاتف</th>
              <th className="py-2 pr-3">Status / الحالة</th>
              <th className="py-2 pr-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {branches.map((branch) => (
              <tr key={branch.id} className={`border-b last:border-b-0 ${!branch.isActive ? "opacity-50" : ""}`}>
                <td className="py-2 pr-3 font-mono text-zinc-900">{branch.code}</td>
                <td className="py-2 pr-3 text-zinc-900">{branch.name}</td>
                <td className="py-2 pr-3 text-zinc-700">{branch.phone || "-"}</td>
                <td className="py-2 pr-3">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${branch.isActive ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500"}`}>
                    {branch.isActive ? "Active / نشط" : "Inactive / غير نشط"}
                  </span>
                </td>
                <td className="py-2 pr-3">
                  <Link className="text-sm underline text-zinc-700" href={`/app/settings/branches/${branch.id}`}>
                    View / عرض
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {branches.length === 0 ? <div className="mt-4 text-sm text-zinc-600">No branches yet. / لا توجد فروع بعد.</div> : null}
      </div>
    </div>
  );
}