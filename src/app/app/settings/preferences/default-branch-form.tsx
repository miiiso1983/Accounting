"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type BranchOption = { id: string; code: string; name: string };

export function DefaultBranchForm({
  branches,
  currentBranchId,
}: {
  branches: BranchOption[];
  currentBranchId: string;
}) {
  const router = useRouter();
  const [branchId, setBranchId] = useState(currentBranchId);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/me/default-branch", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ defaultBranchId: branchId || "" }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setMessage({ type: "err", text: data?.error ?? "Failed to save" });
      } else {
        setMessage({ type: "ok", text: "Saved successfully / تم الحفظ بنجاح ✓" });
        router.refresh();
      }
    } catch {
      setMessage({ type: "err", text: "Network error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium text-zinc-700">
          Default Branch / الفرع الافتراضي
        </label>
        <p className="mt-0.5 text-xs text-zinc-500">
          This branch will be auto-selected when creating new invoices and journal entries.
          <br />
          سيتم اختيار هذا الفرع تلقائياً عند إنشاء فواتير وقيود جديدة.
        </p>
        <select
          className="mt-2 w-full rounded-xl border px-3 py-2 text-sm"
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
          disabled={branches.length === 0}
        >
          <option value="">— None / بدون —</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.code} — {b.name}
            </option>
          ))}
        </select>
        {branches.length === 0 && (
          <p className="mt-1 text-xs text-zinc-400">
            No branches available. Create branches first in Settings → Branches.
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          className="rounded-xl bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800 disabled:opacity-50"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving… / جارِ الحفظ…" : "Save / حفظ"}
        </button>
        {message && (
          <span className={`text-sm ${message.type === "ok" ? "text-emerald-600" : "text-red-600"}`}>
            {message.text}
          </span>
        )}
      </div>
    </div>
  );
}

