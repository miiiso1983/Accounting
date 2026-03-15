"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

export default function NewSalesRepPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/sales-reps", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim() || undefined, phone: phone.trim() || undefined }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Failed to create sales representative");
        return;
      }

      router.push("/app/sales-reps");
      router.refresh();
    } catch {
      setError("Failed to create sales representative");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-zinc-500">Sales Representatives / المندوبين</div>
          <div className="mt-1 text-base font-medium text-zinc-900">New Sales Rep / مندوب جديد</div>
        </div>
        <Link className="text-sm underline text-zinc-700" href="/app/sales-reps">
          Back / رجوع
        </Link>
      </div>

      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}

      <form className="mt-4 grid gap-4 max-w-lg" onSubmit={handleSubmit}>
        <div>
          <label className="text-sm font-medium text-zinc-700">Name / الاسم *</label>
          <input
            className="mt-1 w-full rounded-xl border px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="اسم المندوب"
            required
            autoFocus
          />
        </div>

        <div>
          <label className="text-sm font-medium text-zinc-700">Email / البريد الإلكتروني</label>
          <input
            className="mt-1 w-full rounded-xl border px-3 py-2"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@example.com"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-zinc-700">Phone / الهاتف</label>
          <input
            className="mt-1 w-full rounded-xl border px-3 py-2"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+964..."
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            className="rounded-xl bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800"
            type="submit"
            disabled={saving || !name.trim()}
          >
            {saving ? "Saving..." : "Save / حفظ"}
          </button>
          <Link className="rounded-xl border px-4 py-2 text-sm hover:bg-zinc-50" href="/app/sales-reps">
            Cancel / إلغاء
          </Link>
        </div>
      </form>
    </div>
  );
}

