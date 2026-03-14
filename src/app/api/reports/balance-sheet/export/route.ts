import { getServerSession } from "next-auth";
import * as XLSX from "xlsx";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

type AccountType = "ASSET" | "LIABILITY" | "EQUITY";
type ANode = { id: string; code: string; name: string; type: AccountType; parentId: string | null; isPosting: boolean; balance: number; children: ANode[] };

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.REPORTS_READ)) return Response.json({ error: "Not authorized" }, { status: 403 });

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  if (!user?.companyId) return Response.json({ error: "No company" }, { status: 400 });
  const companyId = user.companyId;

  const { searchParams } = new URL(req.url);
  const asOf = searchParams.get("asOf") ?? undefined;
  const toDate = asOf ? (() => { const d = new Date(`${asOf}T23:59:59.999Z`); return isNaN(d.getTime()) ? undefined : d; })() : undefined;

  const allAccounts = await prisma.glAccount.findMany({
    where: { companyId, type: { in: ["ASSET", "LIABILITY", "EQUITY"] } },
    orderBy: [{ code: "asc" }],
    select: { id: true, code: true, name: true, type: true, parentId: true, isPosting: true },
  });

  const [debitAgg, creditAgg] = await Promise.all([
    prisma.journalLine.groupBy({
      by: ["accountId"],
      where: { dc: "DEBIT", journalEntry: { companyId, status: "POSTED", ...(toDate ? { entryDate: { lte: toDate } } : {}) }, accountId: { in: allAccounts.filter((a) => a.isPosting).map((a) => a.id) } },
      _sum: { amountBase: true },
    }),
    prisma.journalLine.groupBy({
      by: ["accountId"],
      where: { dc: "CREDIT", journalEntry: { companyId, status: "POSTED", ...(toDate ? { entryDate: { lte: toDate } } : {}) }, accountId: { in: allAccounts.filter((a) => a.isPosting).map((a) => a.id) } },
      _sum: { amountBase: true },
    }),
  ]);

  const debitMap = new Map<string, number>();
  for (const r of debitAgg) debitMap.set(r.accountId, Number(r._sum.amountBase ?? 0));
  const creditMap = new Map<string, number>();
  for (const r of creditAgg) creditMap.set(r.accountId, Number(r._sum.amountBase ?? 0));

  const byId = new Map<string, ANode>();
  for (const a of allAccounts) {
    const rawBal = (debitMap.get(a.id) ?? 0) - (creditMap.get(a.id) ?? 0);
    byId.set(a.id, { ...a, type: a.type as AccountType, balance: a.isPosting ? rawBal : 0, children: [] });
  }
  const roots: ANode[] = [];
  for (const a of allAccounts) {
    const node = byId.get(a.id)!;
    if (a.parentId && byId.has(a.parentId)) byId.get(a.parentId)!.children.push(node);
    else roots.push(node);
  }
  function rollUp(n: ANode): number { let s = 0; for (const c of n.children) s += rollUp(c); n.balance += s; return n.balance; }
  roots.forEach(rollUp);

  function displayBal(n: ANode) { return (n.type === "LIABILITY" || n.type === "EQUITY") ? -n.balance : n.balance; }

  const totalAssets = roots.filter((r) => r.type === "ASSET").reduce((s, r) => s + r.balance, 0);
  const totalLiabilities = roots.filter((r) => r.type === "LIABILITY").reduce((s, r) => s + -r.balance, 0);
  const totalEquity = roots.filter((r) => r.type === "EQUITY").reduce((s, r) => s + -r.balance, 0);
  const totalLE = totalLiabilities + totalEquity;
  const diff = totalAssets - totalLE;
  const balanced = Math.abs(diff) < 0.01;

  // Flatten tree for Excel
  const rows: { Section: string; Code: string; Account: string; Balance: number | string }[] = [];
  function flatten(nodes: ANode[], section: string, depth: number) {
    for (const n of nodes) {
      rows.push({ Section: depth === 0 ? section : "", Code: n.code, Account: "  ".repeat(depth) + n.name, Balance: displayBal(n) });
      flatten(n.children, section, depth + 1);
    }
  }
  flatten(roots.filter((r) => r.type === "ASSET"), "Assets", 0);
  rows.push({ Section: "", Code: "", Account: "Total Assets", Balance: totalAssets });
  rows.push({ Section: "", Code: "", Account: "", Balance: 0 });
  flatten(roots.filter((r) => r.type === "LIABILITY"), "Liabilities", 0);
  rows.push({ Section: "", Code: "", Account: "Total Liabilities", Balance: totalLiabilities });
  rows.push({ Section: "", Code: "", Account: "", Balance: 0 });
  flatten(roots.filter((r) => r.type === "EQUITY"), "Equity", 0);
  rows.push({ Section: "", Code: "", Account: "Total Equity", Balance: totalEquity });

  rows.push({ Section: "", Code: "", Account: "", Balance: 0 });
  rows.push({ Section: "", Code: "", Account: "Liabilities + Equity", Balance: totalLE });
  rows.push({ Section: "", Code: "", Account: "Difference (Assets - (L+E))", Balance: diff });
  rows.push({ Section: "", Code: "", Account: "Balanced?", Balance: balanced ? "YES" : "NO" });

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Balance Sheet");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="balance-sheet${asOf ? `-${asOf}` : ""}.xlsx"`,
    },
  });
}

