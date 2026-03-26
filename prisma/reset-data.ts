/**
 * System Reset Script — إعادة تعيين النظام
 *
 * Clears ALL transactional data while preserving master/config data.
 * يمسح جميع البيانات المعاملاتية مع الحفاظ على البيانات الرئيسية والإعدادات.
 *
 * Usage:  ALLOW_DATA_RESET=true npx tsx prisma/reset-data.ts
 *
 * Preserved (Master Data):
 *   Company, User, Account, Session, VerificationToken,
 *   Role, Permission, UserRole, UserPermission, RolePermission,
 *   GlAccount, Customer, Branch, CostCenter,
 *   Product, SalesRepresentative, PrintTemplate
 *
 * Deleted (Transactional Data) — in FK-safe order:
 *   1. Attachment
 *   2. ExpenseLineItem
 *   3. InvoiceLineItem
 *   4. InvoicePayment
 *   5. InstallmentContract
 *   6. Expense
 *   7. Invoice
 *   8. JournalLine
 *   9. JournalEntry
 *  10. ExchangeRate
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient();

async function main() {
  // ── Safety gate ──
  if (process.env.ALLOW_DATA_RESET !== "true") {
    console.error(
      "\n❌  Safety check failed / فشل فحص الأمان\n" +
        "   Set ALLOW_DATA_RESET=true to proceed.\n" +
        "   عيّن ALLOW_DATA_RESET=true للمتابعة.\n\n" +
        "   Example / مثال:\n" +
        "   ALLOW_DATA_RESET=true npx tsx prisma/reset-data.ts\n",
    );
    process.exit(1);
  }

  console.log("\n🔄  System Reset — إعادة تعيين النظام");
  console.log("━".repeat(50));
  console.log("⚠️   This will DELETE all transactional data!");
  console.log("⚠️   سيتم حذف جميع البيانات المعاملاتية!\n");

  // ── Count records before deletion ──
  const counts = {
    attachment: await prisma.attachment.count(),
    expenseLineItem: await prisma.expenseLineItem.count(),
    invoiceLineItem: await prisma.invoiceLineItem.count(),
    invoicePayment: await prisma.invoicePayment.count(),
    installmentContract: await prisma.installmentContract.count(),
    expense: await prisma.expense.count(),
    invoice: await prisma.invoice.count(),
    journalLine: await prisma.journalLine.count(),
    journalEntry: await prisma.journalEntry.count(),
    exchangeRate: await prisma.exchangeRate.count(),
  };

  const totalRecords = Object.values(counts).reduce((s, c) => s + c, 0);
  if (totalRecords === 0) {
    console.log("✅  No transactional data found. Nothing to delete.");
    console.log("✅  لا توجد بيانات معاملاتية. لا شيء للحذف.\n");
    return;
  }

  console.log("📊  Records to delete / سجلات سيتم حذفها:");
  console.log("─".repeat(40));
  for (const [table, count] of Object.entries(counts)) {
    if (count > 0) console.log(`   ${table.padEnd(25)} ${count}`);
  }
  console.log("─".repeat(40));
  console.log(`   ${"TOTAL".padEnd(25)} ${totalRecords}\n`);

  // ── Atomic deletion in FK-safe order ──
  console.log("🗑️   Deleting transactional data...");
  console.log("🗑️   جاري حذف البيانات المعاملاتية...\n");

  const result = await prisma.$transaction([
    // 1. Attachments (child of Invoice & Expense)
    prisma.attachment.deleteMany(),
    // 2. Expense line items (child of Expense)
    prisma.expenseLineItem.deleteMany(),
    // 3. Invoice line items (child of Invoice)
    prisma.invoiceLineItem.deleteMany(),
    // 4. Invoice payments (child of Invoice & JournalEntry)
    prisma.invoicePayment.deleteMany(),
    // 5. Installment contracts (references Customer but is transactional)
    prisma.installmentContract.deleteMany(),
    // 6. Expenses (references JournalEntry)
    prisma.expense.deleteMany(),
    // 7. Invoices (references JournalEntry)
    prisma.invoice.deleteMany(),
    // 8. Journal lines (child of JournalEntry)
    prisma.journalLine.deleteMany(),
    // 9. Journal entries (parent)
    prisma.journalEntry.deleteMany(),
    // 10. Exchange rates (referenced by deleted records above)
    prisma.exchangeRate.deleteMany(),
  ]);

  // ── Summary ──
  const labels = [
    "Attachment / المرفقات",
    "ExpenseLineItem / بنود المصروفات",
    "InvoiceLineItem / بنود الفواتير",
    "InvoicePayment / الدفعات",
    "InstallmentContract / عقود التقسيط",
    "Expense / المصروفات",
    "Invoice / الفواتير",
    "JournalLine / سطور القيود",
    "JournalEntry / القيود المحاسبية",
    "ExchangeRate / أسعار الصرف",
  ];

  console.log("✅  Deletion complete / تم الحذف بنجاح");
  console.log("━".repeat(50));
  console.log("📋  Summary / ملخص:");
  console.log("─".repeat(40));
  let totalDeleted = 0;
  result.forEach((r, i) => {
    if (r.count > 0) console.log(`   ${labels[i]!.padEnd(38)} ${r.count}`);
    totalDeleted += r.count;
  });
  console.log("─".repeat(40));
  console.log(`   ${"Total deleted / إجمالي المحذوف".padEnd(38)} ${totalDeleted}`);
  console.log("\n✅  Master data preserved / البيانات الرئيسية محفوظة ✅\n");
}

main()
  .catch((e) => {
    console.error("\n❌  Reset failed / فشل إعادة التعيين:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

