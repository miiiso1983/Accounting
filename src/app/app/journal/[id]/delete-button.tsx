"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  entryId: string;
};

export function DeleteJournalEntryButton({ entryId }: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function onDelete() {
    if (!confirm("Delete this manual journal entry? / هل تريد حذف هذا القيد اليدوي؟")) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/journal-entries/${entryId}`, { method: "DELETE" });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        alert(data?.error ?? "Failed to delete manual journal entry");
        return;
      }

      router.push("/app/journal");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <button
      className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 hover:bg-red-100 disabled:opacity-60"
      type="button"
      onClick={onDelete}
      disabled={deleting}
    >
      {deleting ? "Deleting..." : "Delete"}
    </button>
  );
}