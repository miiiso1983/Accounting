import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { CostCenterForm } from "./ui";

export default async function NewCostCenterPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  if (!hasPermission(session, PERMISSIONS.COST_CENTERS_WRITE)) {
    return <div className="rounded-2xl border bg-white p-5 text-sm">Not authorized.</div>;
  }

  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
	          <div className="text-sm text-zinc-500">Cost Centers / مراكز التكلفة</div>
	          <div className="mt-1 text-base font-medium text-zinc-900">New Cost Center / مركز تكلفة جديد</div>
        </div>
        <Link className="text-sm underline text-zinc-700" href="/app/cost-centers">
	          Back / رجوع
        </Link>
      </div>

      <div className="mt-4">
        <CostCenterForm />
      </div>
    </div>
  );
}
