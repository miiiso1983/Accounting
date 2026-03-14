import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { CustomerEditForm } from "./ui";

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  if (!hasPermission(session, PERMISSIONS.INVOICE_WRITE)) {
    return <div className="rounded-2xl border bg-white p-5 text-sm">Not authorized.</div>;
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  const companyId = user?.companyId;
  if (!companyId) return <div className="rounded-2xl border bg-white p-5 text-sm">No company assigned.</div>;

  const customer = await prisma.customer.findFirst({ where: { id, companyId } });
  if (!customer) return <div className="rounded-2xl border bg-white p-5 text-sm">Not found.</div>;

  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-zinc-500">Customers</div>
          <div className="mt-1 text-base font-medium text-zinc-900">Edit customer — {customer.name}</div>
        </div>
        <Link className="text-sm underline text-zinc-700" href={`/app/customers/${customer.id}`}>
          Back
        </Link>
      </div>

      <div className="mt-4">
        <CustomerEditForm
          customer={{
            id: customer.id,
            name: customer.name,
            companyName: customer.companyName ?? "",
            email: customer.email ?? "",
            phone: customer.phone ?? "",
            address1: customer.address1 ?? "",
            address2: customer.address2 ?? "",
            city: customer.city ?? "",
            country: customer.country ?? "",
          }}
        />
      </div>
    </div>
  );
}