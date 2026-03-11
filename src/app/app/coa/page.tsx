import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

type TreeNode = {
  id: string;
  code: string;
  name: string;
  children: TreeNode[];
};

export default async function CoaPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  if (!hasPermission(session, PERMISSIONS.COA_READ)) {
    return <div className="rounded-2xl border bg-white p-5 text-sm">Not authorized.</div>;
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  const companyId = user?.companyId;
  if (!companyId) return <div className="rounded-2xl border bg-white p-5 text-sm">No company assigned.</div>;

  const accounts = await prisma.glAccount.findMany({
    where: { companyId },
    orderBy: [{ code: "asc" }],
    select: { id: true, code: true, name: true, parentId: true },
  });

  const byId = new Map<string, TreeNode>();
  for (const a of accounts) byId.set(a.id, { id: a.id, code: a.code, name: a.name, children: [] });

  const roots: TreeNode[] = [];
  for (const a of accounts) {
    const node = byId.get(a.id)!;
    if (a.parentId) byId.get(a.parentId)?.children.push(node);
    else roots.push(node);
  }

  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="text-sm text-zinc-500">Chart of Accounts</div>
      <div className="mt-1 text-base font-medium text-zinc-900">Unified Accounting System (starter)</div>
      <div className="mt-4 space-y-1 text-sm">
        {roots.map((r) => (
          <Tree key={r.id} node={r} depth={0} />
        ))}
      </div>
    </div>
  );
}

function Tree({ node, depth }: { node: TreeNode; depth: number }) {
  return (
    <div>
      <div className="flex gap-3" style={{ paddingLeft: depth * 16 }}>
        <div className="w-20 font-mono text-zinc-500">{node.code}</div>
        <div className="text-zinc-900">{node.name}</div>
      </div>
      {node.children.map((c) => (
        <Tree key={c.id} node={c} depth={depth + 1} />
      ))}
    </div>
  );
}
