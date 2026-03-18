import { getServerSession } from "next-auth";
import * as XLSX from "xlsx";

import { formatJournalEntryNumber, isPaymentReferenceType } from "@/lib/accounting/journal/utils";
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

const DOC_TYPE_LABELS: Record<string, string> = {
	JOURNAL: "قيد يدوي / Manual Journal Entry",
	SYSTEM: "قيد نظامي / System Journal Entry",
  INVOICE: "مبيعات / Sales Invoice",
  EXPENSE: "مشتريات / Expense",
  PAYMENT: "سند قبض / Payment",
  FUND_TRANSFER: "سند تحويل / Fund Transfer",
};

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.REPORTS_READ)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  if (!user?.companyId) return Response.json({ error: "No company" }, { status: 400 });
  const companyId = user.companyId;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const docType = searchParams.get("docType") ?? undefined;
  const status = searchParams.get("status") ?? undefined;

  const fromDate = parseDateStart(from);
  const toDate = parseDateEnd(to);
  const entryDateWhere = fromDate || toDate ? { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } : undefined;

  const jeWhere: Record<string, unknown> = { companyId };
  if (entryDateWhere) jeWhere.entryDate = entryDateWhere;
  if (status && ["DRAFT", "POSTED", "VOID"].includes(status)) jeWhere.status = status;
	if (docType === "JOURNAL") jeWhere.type = "MANUAL";
  else if (docType === "FUND_TRANSFER") jeWhere.referenceType = "FUND_TRANSFER";
  else if (docType === "INVOICE") jeWhere.referenceType = "INVOICE";
  else if (docType === "EXPENSE") jeWhere.referenceType = "EXPENSE";
	else if (docType === "PAYMENT") jeWhere.referenceType = { in: ["PAYMENT", "INVOICE_PAYMENT"] };

  const journalEntries = await prisma.journalEntry.findMany({
    where: jeWhere,
    orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
    take: 5000,
    select: {
      id: true,
      entryNumber: true,
      type: true,
      entryDate: true,
      description: true,
      status: true,
      referenceType: true,
      lines: { select: { dc: true, amountBase: true } },
      invoices: { select: { id: true, invoiceNumber: true, status: true } },
      expenses: { select: { id: true, expenseNumber: true, status: true } },
      invoicePayments: { select: { id: true } },
    },
  });

  let grandDebit = 0;
  let grandCredit = 0;

  const rows = journalEntries.map((je, idx) => {
    const totalDebit = je.lines.filter((l) => l.dc === "DEBIT").reduce((s, l) => s + Number(l.amountBase), 0);
    const totalCredit = je.lines.filter((l) => l.dc === "CREDIT").reduce((s, l) => s + Number(l.amountBase), 0);
    grandDebit += totalDebit;
    grandCredit += totalCredit;

	    let docTypeKey = je.type === "MANUAL" ? "JOURNAL" : "SYSTEM";
	    let reference = formatJournalEntryNumber(je.entryNumber, je.type, je.id);
    let displayStatus: string = je.status;

    if (je.referenceType === "FUND_TRANSFER") {
      docTypeKey = "FUND_TRANSFER";
      reference = `TRF-${je.entryNumber || je.id.slice(-6)}`;
    } else if (je.referenceType === "INVOICE" && je.invoices.length > 0) {
      docTypeKey = "INVOICE";
      reference = je.invoices[0].invoiceNumber;
      displayStatus = je.invoices[0].status;
    } else if (je.referenceType === "EXPENSE" && je.expenses.length > 0) {
      docTypeKey = "EXPENSE";
      reference = je.expenses[0].expenseNumber || `EXP-${je.id.slice(-6)}`;
      displayStatus = je.expenses[0].status;
	    } else if (isPaymentReferenceType(je.referenceType)) {
      docTypeKey = "PAYMENT";
      reference = `PMT-${je.entryNumber || je.id.slice(-6)}`;
    }

    return {
      "#": idx + 1,
      "Date / التاريخ": je.entryDate.toISOString().slice(0, 10),
      "Document / الوثيقة": DOC_TYPE_LABELS[docTypeKey] || docTypeKey,
      "Reference / رقمها": reference,
      "Notes / ملاحظة": je.description || "",
      "Total Debit / إجمالي المدين": totalDebit,
      "Total Credit / إجمالي الدائن": totalCredit,
      "Status / الحالة": displayStatus,
    };
  });

  // Summary row
  rows.push({
    "#": rows.length + 1,
    "Date / التاريخ": "",
    "Document / الوثيقة": "",
    "Reference / رقمها": "",
    "Notes / ملاحظة": "المجموع / Total",
    "Total Debit / إجمالي المدين": grandDebit,
    "Total Credit / إجمالي الدائن": grandCredit,
    "Status / الحالة": "",
  });

  const ws = XLSX.utils.json_to_sheet(rows.length > 1 ? rows : [{ Message: "(no data)" }]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "All Transactions");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const filename = `all-transactions${from ? `-${from}` : ""}${to ? `-to-${to}` : ""}.xlsx`;

  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

