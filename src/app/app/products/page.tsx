import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

function fmt(n: unknown) {
  const x = typeof n === "string" ? Number(n) : typeof n === "number" ? n : Number(String(n));
  if (!Number.isFinite(x)) return "-";
  return x.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default async function ProductsIndexPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  if (!hasPermission(session, PERMISSIONS.INVOICE_READ)) {
    return <div className="rounded-2xl border bg-white p-5 text-sm">Not authorized.</div>;
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  const companyId = user?.companyId;
  if (!companyId) return <div className="rounded-2xl border bg-white p-5 text-sm">No company assigned.</div>;

  const products = await prisma.product.findMany({
    where: { companyId },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    take: 500,
  });

  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-zinc-500">Sales / المبيعات</div>
          <div className="mt-1 text-base font-medium text-zinc-900">Products / المنتجات</div>
        </div>
        <Link className="rounded-xl bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-800" href="/app/products/new">
          + New Product / منتج جديد
        </Link>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-zinc-500">
            <tr className="border-b">
              <th className="py-2 pr-3">Name / الاسم</th>
              <th className="py-2 pr-3">Description / الوصف</th>
              <th className="py-2 pr-3 text-right">Unit Price / سعر الوحدة</th>
              <th className="py-2 pr-3">Currency / العملة</th>
              <th className="py-2 pr-3">Status / الحالة</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className={`border-b last:border-b-0 ${!p.isActive ? "opacity-50" : ""}`}>
                <td className="py-2 pr-3 text-zinc-900">
                  <Link className="underline" href={`/app/products/${p.id}`}>
                    {p.name}
                  </Link>
                </td>
                <td className="py-2 pr-3 text-zinc-700">{p.description ?? "-"}</td>
                <td className="py-2 pr-3 text-right font-mono text-zinc-900">{fmt(p.unitPrice)}</td>
                <td className="py-2 pr-3 text-zinc-700">{p.currencyCode}</td>
                <td className="py-2 pr-3">
                  {p.isActive ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">Active / نشط</span>
                  ) : (
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">Inactive / غير نشط</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {products.length === 0 ? <div className="mt-4 text-sm text-zinc-600">No products yet. / لا توجد منتجات بعد.</div> : null}
      </div>
    </div>
  );
}

