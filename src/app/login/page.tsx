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
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Sign in</h1>
        <p className="mt-1 text-sm text-zinc-600">Accounting system access</p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="text-sm font-medium text-zinc-700">Email</label>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium text-zinc-700">Password</label>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <button
            className="w-full rounded-xl bg-zinc-900 px-3 py-2 text-white hover:bg-zinc-800"
            type="submit"
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
