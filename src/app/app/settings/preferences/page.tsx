import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { getCachedBranches } from "@/lib/db/cached-queries";

import { DefaultBranchForm } from "./default-branch-form";

export default async function PreferencesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { companyId: true, defaultBranchId: true },
  });
  const companyId = user?.companyId;
  if (!companyId)
    return <div className="rounded-2xl border bg-white dark:bg-zinc-950 dark:border-zinc-700 p-5 text-sm">No company assigned.</div>;

  const branches = await getCachedBranches(companyId);

  return (
    <div className="rounded-2xl border bg-white dark:bg-zinc-950 dark:border-zinc-700 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-zinc-500 dark:text-zinc-400">Settings / الإعدادات</div>
          <div className="mt-1 text-base font-medium text-zinc-900 dark:text-zinc-100">
            My Preferences / تفضيلاتي
          </div>
        </div>
        <Link className="text-sm underline text-zinc-700 dark:text-zinc-300" href="/app/settings">
          Back / رجوع
        </Link>
      </div>

      <div className="mt-6 max-w-md">
        <DefaultBranchForm
          branches={branches.map((b) => ({ id: b.id, code: b.code, name: b.name }))}
          currentBranchId={user.defaultBranchId ?? ""}
        />
      </div>
    </div>
  );
}

