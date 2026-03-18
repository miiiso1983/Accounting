import { getServerSession } from "next-auth";
import * as XLSX from "xlsx";

import { formatJournalEntryNumber, getJournalEntryTypeLabel, getJournalSourceLabel } from "@/lib/accounting/journal/utils";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

function toNum(d: unknown) {
  const n = Number(String(d));
  return Number.isFinite(n) ? n : 0;
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.JOURNAL_READ)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  if (!user?.companyId) return Response.json({ error: "No company" }, { status: 400 });

  const entry = await prisma.journalEntry.findFirst({
    where: { id, companyId: user.companyId },
    select: {
      id: true,
      entryNumber: true,
      type: true,
      entryDate: true,
      description: true,
      status: true,
      referenceType: true,
      referenceId: true,
      lines: {
        orderBy: [{ dc: "asc" }],
        include: { account: { select: { code: true, name: true } } },
      },
    },
  });

  if (!entry) return Response.json({ error: "Not found" }, { status: 404 });

	const entryLabel = formatJournalEntryNumber(entry.entryNumber, entry.type, entry.id);

  const rows = entry.lines.map((l) => ({
    "Entry #": entryLabel,
    "Entry Type": getJournalEntryTypeLabel(entry.type),
    Date: entry.entryDate.toISOString().slice(0, 10),
    Description: entry.description ?? "",
    Status: entry.status,
    Source: getJournalSourceLabel(entry.referenceType),
    "Source Reference": entry.referenceId ?? "",
    "Account Code": l.account.code,
    "Account Name": l.account.name,
    Debit: l.dc === "DEBIT" ? toNum(l.amount) : "",
    Credit: l.dc === "CREDIT" ? toNum(l.amount) : "",
    Currency: l.currencyCode,
    "Debit (base)": l.dc === "DEBIT" ? toNum(l.amountBase) : "",
    "Credit (base)": l.dc === "CREDIT" ? toNum(l.amountBase) : "",
    Note: l.description ?? "",
  }));

  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Message: "(no data)" }]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, entryLabel);
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const filename = `journal-entry-${entryLabel}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

