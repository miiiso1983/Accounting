import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { getCachedCostCenters, getCachedPostingGlAccounts } from "@/lib/db/cached-queries";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { ProductEditForm } from "./edit-ui";

type CostCenterOption = { id: string; code: string; name: string };

function fmt(n: unknown) {
  const x = typeof n === "string" ? Number(n) : typeof n === "number" ? n : Number(String(n));
  if (!Number.isFinite(x)) return "-";
  return x.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  if (!hasPermission(session, PERMISSIONS.INVOICE_READ)) {
    return <div className="rounded-2xl border bg-white p-5 text-sm">Not authorized.</div>;
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  const companyId = user?.companyId;
  if (!companyId) return <div className="rounded-2xl border bg-white p-5 text-sm">No company assigned.</div>;

  const [product, costCenters, revenueAccounts] = await Promise.all([
    prisma.product.findFirst({
      where: { id, companyId },
      include: {
        costCenter: { select: { id: true, code: true, name: true } },
        revenueAccount: { select: { id: true, code: true, name: true } },
      },
    }),
    getCachedCostCenters(companyId),
		getCachedPostingGlAccounts(companyId),
  ]);
  if (!product) return <div className="rounded-2xl border bg-white p-5 text-sm">Not found.</div>;

  const costCenterLabel = product.costCenter ? `${product.costCenter.code} — ${product.costCenter.name}` : "-";
  const revenueAccountLabel = product.revenueAccount ? `${product.revenueAccount.code} — ${product.revenueAccount.name}` : "— None / بدون —";

  const canWrite = hasPermission(session, PERMISSIONS.INVOICE_WRITE);

  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-zinc-500">Products / المنتجات</div>
          <div className="mt-1 text-base font-medium text-zinc-900">{product.name}</div>
          <div className="mt-0.5 text-xs text-zinc-500">
            {product.isActive ? "Active / نشط" : "Inactive / غير نشط"} · Created {product.createdAt.toISOString().slice(0, 10)}
          </div>
        </div>
        <Link className="text-sm underline text-zinc-700" href="/app/products">
          Back / رجوع
        </Link>
      </div>

      {/* Read-only summary */}
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border p-3">
          <div className="text-xs text-zinc-500">Unit Price / سعر الوحدة</div>
          <div className="mt-1 font-mono text-sm text-zinc-900">{fmt(product.unitPrice)} {product.currencyCode}</div>
        </div>
        <div className="rounded-xl border p-3">
          <div className="text-xs text-zinc-500">Description / الوصف</div>
          <div className="mt-1 text-sm text-zinc-900">{product.description || "-"}</div>
        </div>
        <div className="rounded-xl border p-3">
          <div className="text-xs text-zinc-500">Status / الحالة</div>
          <div className="mt-1 text-sm text-zinc-900">{product.isActive ? "Active / نشط" : "Inactive / غير نشط"}</div>
        </div>

        <div className="rounded-xl border p-3">
          <div className="text-xs text-zinc-500">Default Cost Center / مركز الكلفة الافتراضي</div>
          <div className="mt-1 text-sm text-zinc-900">{costCenterLabel}</div>
        </div>
        <div className="rounded-xl border p-3 md:col-span-2">
          <div className="text-xs text-zinc-500">Revenue Account / حساب الإيرادات</div>
          <div className="mt-1 text-sm text-zinc-900">{revenueAccountLabel}</div>
        </div>
      </div>

      {/* Edit form */}
      {canWrite && (
        <div className="mt-6 rounded-2xl border p-4">
          <div className="text-sm font-medium text-zinc-900 mb-3">Edit Product / تعديل المنتج</div>
          <ProductEditForm
            product={{
              id: product.id,
              name: product.name,
              description: product.description ?? "",
              unitPrice: String(product.unitPrice),
              currencyCode: product.currencyCode,
              isActive: product.isActive,
              costCenterId: product.costCenterId ?? "",
              revenueAccountId: product.revenueAccountId ?? "",
            }}
            costCenters={costCenters as CostCenterOption[]}
            revenueAccounts={revenueAccounts}
          />
        </div>
      )}
    </div>
  );
}

