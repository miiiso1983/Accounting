import Link from "next/link";

export default function DashboardPage() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-2xl border bg-white p-5">
        <div className="text-sm text-zinc-500">Status</div>
        <div className="mt-1 text-base font-medium text-zinc-900">Foundation scaffolded</div>
        <p className="mt-2 text-sm text-zinc-600">
          Next: Chart of Accounts, journal posting engine, invoices, expenses, and reports.
        </p>


				<div className="mt-3 flex flex-col gap-2">
					<Link className="inline-flex text-sm underline text-zinc-700" href="/app/coa">
						View Chart of Accounts
					</Link>
					<Link className="inline-flex text-sm underline text-zinc-700" href="/app/journal">
						Journal Entries
					</Link>
					<Link className="inline-flex text-sm underline text-zinc-700" href="/app/customers">
						Customers
					</Link>
					<Link className="inline-flex text-sm underline text-zinc-700" href="/app/invoices">
						Invoices
					</Link>
				</div>
      </div>
      <div className="rounded-2xl border bg-white p-5">
        <div className="text-sm text-zinc-500">Currencies</div>
        <div className="mt-1 text-base font-medium text-zinc-900">IQD / USD</div>
        <p className="mt-2 text-sm text-zinc-600">Exchange rates will be managed per company.</p>
      </div>
    </div>
  );
}
