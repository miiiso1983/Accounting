import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { CoaClient, type TreeNode, type AccountType } from "./CoaClient";

export default async function CoaPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  if (!hasPermission(session, PERMISSIONS.COA_READ)) {
    return <div className="rounded-2xl border bg-white p-5 text-sm">Not authorized.</div>;
  }

  const canWrite = hasPermission(session, PERMISSIONS.COA_WRITE);

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  const companyId = user?.companyId;
  if (!companyId) return <div className="rounded-2xl border bg-white p-5 text-sm">No company assigned.</div>;

  const accounts = await prisma.glAccount.findMany({
    where: { companyId },
    orderBy: [{ code: "asc" }],
    select: { id: true, code: true, name: true, type: true, isPosting: true, parentId: true },
  });

  const byId = new Map<string, TreeNode>();
  for (const a of accounts) {
    byId.set(a.id, { id: a.id, code: a.code, name: a.name, type: a.type as AccountType, isPosting: a.isPosting, children: [] });
  }

  const roots: TreeNode[] = [];
  for (const a of accounts) {
    const node = byId.get(a.id)!;
    if (a.parentId) byId.get(a.parentId)?.children.push(node);
    else roots.push(node);
  }

  return <CoaClient initialRoots={roots} canWrite={canWrite} />;
}
