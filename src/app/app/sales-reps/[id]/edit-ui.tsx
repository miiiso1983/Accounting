"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  repId: string;
  initialData: { name: string; email: string; phone: string; isActive: boolean };
};

export function SalesRepEditForm({ repId, initialData }: Props) {
  const router = useRouter();
  const [name, setName] = useState(initialData.name);
  const [email, setEmail] = useState(initialData.email);
  const [phone, setPhone] = useState(initialData.phone);
  const [isActive, setIsActive] = useState(initialData.isActive);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/sales-reps/${repId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim() || undefined, phone: phone.trim() || undefined, isActive }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Failed to update");
        return;
      }

      setSuccess("Saved successfully / تم الحفظ بنجاح");
      router.refresh();
    } catch {
      setError("Failed to update");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this representative? / هل تريد حذف هذا المندوب؟")) return;

    setDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/sales-reps/${repId}`, { method: "DELETE" });
      const data = await res.json();

      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Failed to delete");
        return;
      }

      if (data.deactivated) {
        setSuccess("Deactivated (has linked invoices) / تم التعطيل (مرتبط بفواتير)");
        setIsActive(false);
        router.refresh();
      } else {
        router.push("/app/sales-reps");
        router.refresh();
      }
    } catch {
      setError("Failed to delete");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      {error ? <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}
      {success ? <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{success}</div> : null}

      <form className="grid gap-4 max-w-lg" onSubmit={handleSave}>
        <div>
          <label className="text-sm font-medium text-zinc-700">Name / الاسم *</label>
          <input className="mt-1 w-full rounded-xl border px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="text-sm font-medium text-zinc-700">Email / البريد الإلكتروني</label>
          <input className="mt-1 w-full rounded-xl border px-3 py-2" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="text-sm font-medium text-zinc-700">Phone / الهاتف</label>
          <input className="mt-1 w-full rounded-xl border px-3 py-2" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="isActive" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded" />
          <label htmlFor="isActive" className="text-sm text-zinc-700">Active / نشط</label>
        </div>

        <div className="flex items-center gap-3">
          <button className="rounded-xl bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800" type="submit" disabled={saving || !name.trim()}>
            {saving ? "Saving..." : "Save / حفظ"}
          </button>
          <button
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 hover:bg-red-100"
            type="button"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? "Deleting..." : "Delete / حذف"}
          </button>
        </div>
      </form>
    </div>
  );
}

