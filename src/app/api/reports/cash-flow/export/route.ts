import { getServerSession } from "next-auth";
import * as XLSX from "xlsx";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

function parseDateStart(ymd: string | undefined) {
  if (!ymd) return undefined;
  const d = new Date(`${ymd}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function parseDateEnd(ymd: string | undefined) {
  if (!ymd) return undefined;
  const d = new Date(`${ymd}T23:59:59.999Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";
type Category = "OPERATING" | "INVESTING" | "FINANCING";

function classifyCounterparty(a: { type: AccountType; code: string }): Category {
  if (a.type === "INCOME" || a.type === "EXPENSE") return "OPERATING";
  if (a.code.startsWith("12") || a.code.startsWith("21")) return "OPERATING";
  if (a.type === "ASSET") return "INVESTING";
  return "FINANCING";
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.REPORTS_READ)) return Response.json({ error: "Not authorized" }, { status: 403 });

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  if (!user?.companyId) return Response.json({ error: "No company" }, { status: 400 });
  const companyId = user.companyId;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const fromDate = parseDateStart(from);
  const toDate = parseDateEnd(to);
  const entryDateWhere = fromDate || toDate ? { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } : undefined;

  const cashAccounts = await prisma.glAccount.findMany({
    where: {
      companyId,
      isPosting: true,
      OR: [{ code: { startsWith: "111" } }, { code: { startsWith: "112" } }, { parent: { code: "1100" } }],
    },
    select: { id: true },
  });
  const cashIds = cashAccounts.map((a) => a.id);
  const cashIdSet = new Set(cashIds);

  const entries = cashIds.length
    ? await prisma.journalEntry.findMany({
        where: {
          companyId,
          status: "POSTED",
          ...(entryDateWhere ? { entryDate: entryDateWhere } : {}),
          lines: { some: { accountId: { in: cashIds } } },
        },
        select: {
          id: true,
          lines: {
            select: { accountId: true, dc: true, amountBase: true, account: { select: { code: true, name: true, type: true } } },
          },
        },
      })
    : [];

  const buckets: Record<Category, Map<string, { code: string; name: string; amount: number }>> = {
    OPERATING: new Map(),
    INVESTING: new Map(),
    FINANCING: new Map(),
  };

  for (const e of entries) {
    let cashDelta = 0;
    const nonCash = new Map<string, { code: string; name: string; type: AccountType; raw: number }>();
    for (const l of e.lines) {
      const v = Number(l.amountBase ?? 0);
      const raw = l.dc === "DEBIT" ? v : -v;
      if (cashIdSet.has(l.accountId)) {
        cashDelta += raw;
      } else {
        const prev = nonCash.get(l.accountId) ?? { code: l.account.code, name: l.account.name, type: l.account.type as AccountType, raw: 0 };
        prev.raw += raw;
        nonCash.set(l.accountId, prev);
      }
    }
    if (Math.abs(cashDelta) < 0.0001) continue;

    for (const [accountId, a] of nonCash.entries()) {
      const cashImpact = -a.raw;
      if (Math.abs(cashImpact) < 0.0001) continue;
      const cat = classifyCounterparty({ type: a.type, code: a.code });
      const m = buckets[cat];
      const prev = m.get(accountId) ?? { code: a.code, name: a.name, amount: 0 };
      prev.amount += cashImpact;
      m.set(accountId, prev);
    }
  }

  function bucketRows(cat: Category) {
    return [...buckets[cat].values()].sort((a, b) => a.code.localeCompare(b.code));
  }
  const operatingRows = bucketRows("OPERATING");
  const investingRows = bucketRows("INVESTING");
  const financingRows = bucketRows("FINANCING");
  const totalOperating = operatingRows.reduce((s, r) => s + r.amount, 0);
  const totalInvesting = investingRows.reduce((s, r) => s + r.amount, 0);
  const totalFinancing = financingRows.reduce((s, r) => s + r.amount, 0);
  const netChange = totalOperating + totalInvesting + totalFinancing;

  const rows: Record<string, string | number>[] = [];
  rows.push({ Section: "Operating Activities", Code: "", Account: "", "Cash impact (base)": "" });
  for (const r of operatingRows) rows.push({ Section: "", Code: r.code, Account: r.name, "Cash impact (base)": r.amount });
  rows.push({ Section: "", Code: "", Account: "Total Operating", "Cash impact (base)": totalOperating });
  rows.push({});
  rows.push({ Section: "Investing Activities", Code: "", Account: "", "Cash impact (base)": "" });
  for (const r of investingRows) rows.push({ Section: "", Code: r.code, Account: r.name, "Cash impact (base)": r.amount });
  rows.push({ Section: "", Code: "", Account: "Total Investing", "Cash impact (base)": totalInvesting });
  rows.push({});
  rows.push({ Section: "Financing Activities", Code: "", Account: "", "Cash impact (base)": "" });
  for (const r of financingRows) rows.push({ Section: "", Code: r.code, Account: r.name, "Cash impact (base)": r.amount });
  rows.push({ Section: "", Code: "", Account: "Total Financing", "Cash impact (base)": totalFinancing });
  rows.push({});
  rows.push({ Section: "", Code: "", Account: "Net Change in Cash", "Cash impact (base)": netChange });

  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Message: "(no data)" }]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Cash Flow");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const filename = `cash-flow${from ? `-${from}` : ""}${to ? `-to-${to}` : ""}.xlsx`;

  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
