import { getServerSession } from "next-auth";
import * as XLSX from "xlsx";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

function toNum(d: unknown) {
  const n = Number(String(d));
  return Number.isFinite(n) ? n : 0;
}

function fmtEntryNumber(n: number) {
  return `JE-${String(n).padStart(3, "0")}`;
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.JOURNAL_READ)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  if (!user?.companyId) return Response.json({ error: "No company" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const q = searchParams.get("q") ?? undefined;
  const referenceType = searchParams.get("referenceType") ?? undefined;
  const accountCode = searchParams.get("accountCode") ?? undefined;

  const entries = await prisma.journalEntry.findMany({
    where: {
      companyId: user.companyId,
      ...(q
        ? {
            OR: [
              { description: { contains: q, mode: "insensitive" } },
              { referenceId: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(referenceType
        ? referenceType === "MANUAL"
          ? { referenceType: null }
          : { referenceType }
        : {}),
      ...((from || to)
        ? {
            entryDate: {
              ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
              ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
      ...(accountCode
        ? {
            lines: {
              some: {
                account: {
                  code: { contains: accountCode, mode: "insensitive" as const },
                },
              },
            },
          }
        : {}),
    },
    orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
    include: {
      lines: {
        include: { account: { select: { code: true, name: true } } },
      },
    },
    take: 5000,
  });

  const rows: Record<string, unknown>[] = [];

  for (const e of entries) {
    for (const l of e.lines) {
      rows.push({
        "Entry #": e.entryNumber ? fmtEntryNumber(e.entryNumber) : e.id.slice(0, 8),
        Date: e.entryDate.toISOString().slice(0, 10),
        Description: e.description ?? "",
        Status: e.status,
        Reference: e.referenceType ?? "MANUAL",
        "Account Code": l.account.code,
        "Account Name": l.account.name,
        Debit: l.dc === "DEBIT" ? toNum(l.amount) : "",
        Credit: l.dc === "CREDIT" ? toNum(l.amount) : "",
        Currency: l.currencyCode,
        "Debit (base)": l.dc === "DEBIT" ? toNum(l.amountBase) : "",
        "Credit (base)": l.dc === "CREDIT" ? toNum(l.amountBase) : "",
        Note: l.description ?? "",
      });
    }
  }

  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Message: "(no data)" }]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Journal Entries");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const filename = `journal-entries-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

