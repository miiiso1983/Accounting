"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await signIn("credentials", {
      email,
      password,
      redirect: true,
      callbackUrl: "/app/dashboard",
    });
    // next-auth redirects; if it doesn't, show message
    if (res?.error) setError("Invalid email or password");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 via-white to-sky-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-3xl border bg-white p-8 shadow-lg shadow-sky-100/60 ring-1 ring-zinc-200">
        <div className="mb-6">
          <div className="inline-flex items-center rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
            Secure sign-in
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900">Welcome back</h1>
          <p className="mt-1 text-sm text-zinc-600">Use your admin email and password to access the dashboard.</p>
        </div>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="text-sm font-medium text-zinc-700">Email</label>
            <input
              className="mt-1 w-full rounded-2xl border px-3 py-2 outline-none ring-0 focus:border-sky-300 focus:ring-2 focus:ring-sky-200"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium text-zinc-700">Password</label>
            <input
              className="mt-1 w-full rounded-2xl border px-3 py-2 outline-none ring-0 focus:border-sky-300 focus:ring-2 focus:ring-sky-200"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <button
            className="w-full rounded-2xl bg-gradient-to-r from-indigo-600 to-sky-600 px-3 py-2.5 text-sm font-medium text-white shadow-sm hover:from-indigo-500 hover:to-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
            type="submit"
          >
            Sign in
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-zinc-500">
          If you don’t have credentials yet, run the Prisma seed to create the initial admin user.
        </p>
      </div>
    </div>
  );
}
