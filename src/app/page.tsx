export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-50">
      <main className="mx-auto flex max-w-3xl flex-col gap-4 p-10">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Accounting</h1>
        <p className="text-zinc-600">
          Foundation is in place (Prisma schema + Auth + RBAC). Continue to the app dashboard.
        </p>
        <a
          className="inline-flex w-fit items-center justify-center rounded-xl bg-zinc-900 px-4 py-2 text-white hover:bg-zinc-800"
          href="/app/dashboard"
        >
          Go to dashboard
        </a>
        <a className="text-sm text-zinc-600 underline" href="/login">
          Sign in
        </a>
      </main>
    </div>
  );
}
