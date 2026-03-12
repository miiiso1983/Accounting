import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-sky-600 to-emerald-600">
      <main className="mx-auto max-w-5xl px-6 py-16">
        <div className="rounded-3xl bg-white/90 p-10 shadow-xl ring-1 ring-white/20 backdrop-blur">
          <div className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
            Accounting • PWA
          </div>

          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-zinc-900">
            Accounting system for your business
          </h1>
          <p className="mt-3 max-w-2xl text-base text-zinc-600">
            Secure sign-in, roles & permissions, and a starter Chart of Accounts. Continue to the dashboard to start managing
            entries and invoices.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-indigo-600 to-sky-600 px-5 py-3 text-sm font-medium text-white shadow-sm hover:from-indigo-500 hover:to-sky-500 focus:outline-none focus:ring-2 focus:ring-white/70"
              href="/app/dashboard"
            >
              Go to dashboard
            </Link>
            <Link
              className="inline-flex items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-medium text-zinc-900 ring-1 ring-zinc-200 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-white/70"
              href="/login"
            >
              Sign in
            </Link>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-white p-5 ring-1 ring-zinc-200">
              <div className="text-sm font-medium text-zinc-900">RBAC ready</div>
              <div className="mt-1 text-sm text-zinc-600">Roles & permissions to control access.</div>
            </div>
            <div className="rounded-2xl bg-white p-5 ring-1 ring-zinc-200">
              <div className="text-sm font-medium text-zinc-900">Chart of Accounts</div>
              <div className="mt-1 text-sm text-zinc-600">Seeded starter structure (Iraq UASC).</div>
            </div>
            <div className="rounded-2xl bg-white p-5 ring-1 ring-zinc-200">
              <div className="text-sm font-medium text-zinc-900">Fast & responsive</div>
              <div className="mt-1 text-sm text-zinc-600">Modern Next.js App Router UI.</div>
            </div>
          </div>
        </div>

        <div className="mt-6 text-center text-xs text-white/80">
          Tip: after updates/deploys on Cloudways, purge Varnish so new assets load instantly.
        </div>
      </main>
    </div>
  );
}
