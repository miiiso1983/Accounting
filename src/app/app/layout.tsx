import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/options";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 via-white to-sky-50">
      <header className="sticky top-0 z-10 border-b bg-white/70 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-2xl bg-gradient-to-br from-indigo-600 to-sky-600 shadow-sm" />
              <div>
                <div className="text-sm font-medium text-zinc-600">Accounting</div>
                <div className="text-lg font-semibold text-zinc-900">Dashboard</div>
              </div>
            </div>
            <div className="text-sm text-zinc-600">Signed in as {session.user.email ?? "(no email)"}</div>
          </div>

          <nav className="mt-4 flex flex-wrap gap-2 text-sm">
            <Link className="rounded-xl bg-white px-3 py-2 ring-1 ring-zinc-200 hover:bg-zinc-50" href="/app/dashboard">
              Overview
            </Link>
            <Link className="rounded-xl bg-white px-3 py-2 ring-1 ring-zinc-200 hover:bg-zinc-50" href="/app/coa">
              Chart of Accounts
            </Link>
            <Link className="rounded-xl bg-white px-3 py-2 ring-1 ring-zinc-200 hover:bg-zinc-50" href="/app/journal">
              Journal
            </Link>
            <Link className="rounded-xl bg-white px-3 py-2 ring-1 ring-zinc-200 hover:bg-zinc-50" href="/app/customers">
              Customers
            </Link>
            <Link className="rounded-xl bg-white px-3 py-2 ring-1 ring-zinc-200 hover:bg-zinc-50" href="/app/invoices">
              Invoices
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-6xl p-6">{children}</div>
    </div>
  );
}
