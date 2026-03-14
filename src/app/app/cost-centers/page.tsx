import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export default async function CostCentersIndexPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  if (!hasPermission(session, PERMISSIONS.COST_CENTERS_READ)) {
    return <div className="rounded-2xl border bg-white p-5 text-sm">Not authorized.</div>;
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  const companyId = user?.companyId;
  if (!companyId) return <div className="rounded-2xl border bg-white p-5 text-sm">No company assigned.</div>;

  const canWrite = hasPermission(session, PERMISSIONS.COST_CENTERS_WRITE);

  const centers = await prisma.costCenter.findMany({
    where: { companyId },
    orderBy: [{ isActive: "desc" }, { code: "asc" }],
    take: 1000,
  });

  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-zinc-500">Accounting / المحاسبة</div>
          <div className="mt-1 text-base font-medium text-zinc-900">Cost Centers / مراكز التكلفة</div>
        </div>
        {canWrite ? (
          <Link className="rounded-xl bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-800" href="/app/cost-centers/new">
            + New / جديد
          </Link>
        ) : null}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-zinc-500">
            <tr className="border-b">
              <th className="py-2 pr-3">Code / الرمز</th>
              <th className="py-2 pr-3">Name / الاسم</th>
              <th className="py-2 pr-3">Status / الحالة</th>
            </tr>
          </thead>
          <tbody>
            {centers.map((c) => (
              <tr key={c.id} className={`border-b last:border-b-0 ${!c.isActive ? "opacity-50" : ""}`}>
                <td className="py-2 pr-3 font-mono text-zinc-900">
                  <Link className="underline" href={`/app/cost-centers/${c.id}`}>
                    {c.code}
                  </Link>
                </td>
                <td className="py-2 pr-3 text-zinc-900">{c.name}</td>
                <td className="py-2 pr-3">
                  {c.isActive ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">Active / نشط</span>
                  ) : (
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">Inactive / غير نشط</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {centers.length === 0 ? (
          <div className="mt-4 text-sm text-zinc-600">No cost centers yet. / لا توجد مراكز تكلفة بعد.</div>
        ) : null}
      </div>
    </div>
  );
}
