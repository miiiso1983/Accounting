import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { BranchEditForm } from "./edit-ui";

export default async function BranchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  if (!hasPermission(session, PERMISSIONS.BRANCHES_READ)) {
    return <div className="rounded-2xl border bg-white p-5 text-sm">Not authorized.</div>;
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  const companyId = user?.companyId;
  if (!companyId) return <div className="rounded-2xl border bg-white p-5 text-sm">No company assigned.</div>;

  const branch = await prisma.branch.findFirst({ where: { id, companyId } });
  if (!branch) return <div className="rounded-2xl border bg-white p-5 text-sm">Not found.</div>;

  const canWrite = hasPermission(session, PERMISSIONS.BRANCHES_WRITE);

  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-zinc-500">Branches / الفروع</div>
          <div className="mt-1 text-base font-medium text-zinc-900">{branch.code} — {branch.name}</div>
          <div className="mt-0.5 text-xs text-zinc-500">
            {branch.isActive ? "Active / نشط" : "Inactive / غير نشط"} · Created {branch.createdAt.toISOString().slice(0, 10)}
          </div>
        </div>
        <Link className="text-sm underline text-zinc-700" href="/app/settings/branches">
          Back / رجوع
        </Link>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border p-3">
          <div className="text-xs text-zinc-500">Phone / الهاتف</div>
          <div className="mt-1 text-sm text-zinc-900">{branch.phone || "-"}</div>
        </div>
        <div className="rounded-xl border p-3 md:col-span-2">
          <div className="text-xs text-zinc-500">Address / العنوان</div>
          <div className="mt-1 whitespace-pre-wrap text-sm text-zinc-900">{branch.address || "-"}</div>
        </div>
      </div>

      {canWrite ? (
        <div className="mt-6 rounded-2xl border p-4">
          <div className="mb-3 text-sm font-medium text-zinc-900">Edit / تعديل</div>
          <BranchEditForm
            branch={{
              id: branch.id,
              code: branch.code,
              name: branch.name,
              address: branch.address ?? "",
              phone: branch.phone ?? "",
              isActive: branch.isActive,
            }}
          />
        </div>
      ) : null}
    </div>
  );
}