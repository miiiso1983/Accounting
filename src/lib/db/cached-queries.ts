import { unstable_cache } from "next/cache";
import { prisma } from "./prisma";

// ── Revalidation durations (seconds) ──────────────────────────────
const SHORT = 30;   // 30s — for data that changes sometimes (customers, products)
const MEDIUM = 120;  // 2min — for slower-changing data (cost centers, sales reps, GL accounts)

// ── Customers ─────────────────────────────────────────────────────
export function getCachedCustomers(companyId: string) {
  return unstable_cache(
    () =>
      prisma.customer.findMany({
        where: { companyId },
        orderBy: [{ name: "asc" }],
        select: { id: true, name: true, companyName: true },
        take: 500,
      }),
    [`customers-${companyId}`],
    { revalidate: SHORT, tags: [`customers-${companyId}`] },
  )();
}

// ── Products (active only) ────────────────────────────────────────
export function getCachedProducts(companyId: string) {
  return unstable_cache(
    () =>
      prisma.product.findMany({
        where: { companyId, isActive: true },
        orderBy: [{ name: "asc" }],
        select: { id: true, name: true, description: true, unitPrice: true, currencyCode: true, costCenterId: true },
        take: 500,
      }),
    [`products-${companyId}`],
    { revalidate: SHORT, tags: [`products-${companyId}`] },
  )();
}

// ── Cost Centers (active only) ────────────────────────────────────
export function getCachedCostCenters(companyId: string) {
  return unstable_cache(
    () =>
      prisma.costCenter.findMany({
        where: { companyId, isActive: true },
        orderBy: [{ code: "asc" }],
        select: { id: true, code: true, name: true },
        take: 500,
      }),
    [`cost-centers-${companyId}`],
    { revalidate: MEDIUM, tags: [`cost-centers-${companyId}`] },
  )();
}

// ── Sales Representatives (active only) ───────────────────────────
export function getCachedSalesReps(companyId: string) {
  return unstable_cache(
    () =>
      prisma.salesRepresentative.findMany({
        where: { companyId, isActive: true },
        orderBy: [{ name: "asc" }],
        select: { id: true, name: true },
        take: 500,
      }),
    [`sales-reps-${companyId}`],
    { revalidate: MEDIUM, tags: [`sales-reps-${companyId}`] },
  )();
}

// ── GL Accounts by type (posting only) ────────────────────────────
export function getCachedGlAccounts(companyId: string, type: "INCOME" | "EXPENSE") {
  return unstable_cache(
    () =>
      prisma.glAccount.findMany({
        where: { companyId, type, isPosting: true },
        orderBy: [{ code: "asc" }],
        select: { id: true, code: true, name: true },
        take: 1000,
      }),
    [`gl-accounts-${type}-${companyId}`],
    { revalidate: MEDIUM, tags: [`gl-accounts-${companyId}`] },
  )();
}

// ── Payment accounts (cash/bank/AP codes) ─────────────────────────
export function getCachedPaymentAccounts(companyId: string) {
  return unstable_cache(
    () =>
      prisma.glAccount.findMany({
        where: {
          companyId,
          isPosting: true,
          code: { in: ["1110", "1111", "1120", "1121", "2100"] },
        },
        orderBy: [{ code: "asc" }],
        select: { id: true, code: true, name: true },
        take: 20,
      }),
    [`payment-accounts-${companyId}`],
    { revalidate: MEDIUM, tags: [`gl-accounts-${companyId}`] },
  )();
}

// ── Company info ──────────────────────────────────────────────────
export function getCachedCompany(companyId: string) {
  return unstable_cache(
    () =>
      prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true, name: true, baseCurrencyCode: true, secondaryCurrency: true },
      }),
    [`company-${companyId}`],
    { revalidate: MEDIUM, tags: [`company-${companyId}`] },
  )();
}

// ── Dashboard stats (short cache for aggregate queries) ───────────
export function getCachedDashboardCounts(companyId: string) {
  return unstable_cache(
    () =>
      Promise.all([
        prisma.glAccount.count({ where: { companyId } }),
        prisma.customer.count({ where: { companyId } }),
        prisma.invoice.count({ where: { companyId } }),
        prisma.journalEntry.count({ where: { companyId, status: "POSTED" } }),
      ]),
    [`dashboard-counts-${companyId}`],
    { revalidate: SHORT, tags: [`dashboard-${companyId}`] },
  )();
}

