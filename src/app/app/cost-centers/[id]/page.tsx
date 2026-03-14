import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { CostCenterEditForm } from "./edit-ui";

export default async function CostCenterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  if (!hasPermission(session, PERMISSIONS.COST_CENTERS_READ)) {
    return <div className="rounded-2xl border bg-white p-5 text-sm">Not authorized.</div>;
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  const companyId = user?.companyId;
  if (!companyId) return <div className="rounded-2xl border bg-white p-5 text-sm">No company assigned.</div>;

  const cc = await prisma.costCenter.findFirst({ where: { id, companyId } });
  if (!cc) return <div className="rounded-2xl border bg-white p-5 text-sm">Not found.</div>;

  const canWrite = hasPermission(session, PERMISSIONS.COST_CENTERS_WRITE);

  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
					<div className="text-sm text-zinc-500">Cost Centers / مراكز التكلفة</div>
          <div className="mt-1 text-base font-medium text-zinc-900">
						{cc.code} — {cc.name}
          </div>
          <div className="mt-0.5 text-xs text-zinc-500">
						{cc.isActive ? "Active / نشط" : "Inactive / غير نشط"} · Created {cc.createdAt.toISOString().slice(0, 10)}
          </div>
        </div>
        <Link className="text-sm underline text-zinc-700" href="/app/cost-centers">
					Back / رجوع
        </Link>
      </div>

      {canWrite ? (
        <div className="mt-6 rounded-2xl border p-4">
					<div className="mb-3 text-sm font-medium text-zinc-900">Edit / تعديل</div>
          <CostCenterEditForm costCenter={{ id: cc.id, code: cc.code, name: cc.name, isActive: cc.isActive }} />
        </div>
      ) : null}
    </div>
  );
}
