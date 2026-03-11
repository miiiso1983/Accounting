"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

function readErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  if (!("error" in data)) return null;
  const msg = (data as { error?: unknown }).error;
  return typeof msg === "string" ? msg : null;
}

type Props = {
  invoiceId: string;
  status: string;
  hasJournalEntry: boolean;
  canSendPermission: boolean;
};

export function InvoiceActions({ invoiceId, status, hasJournalEntry, canSendPermission }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

	const canSend = canSendPermission && status === "DRAFT" && !hasJournalEntry;

  async function onSend() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/send`, { method: "POST" });
      const data: unknown = await res.json();
      if (!res.ok) {
	        const msg = readErrorMessage(data) ?? "Failed to send invoice";
        setError(msg);
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-3">
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="rounded-xl bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800 disabled:opacity-50"
          onClick={onSend}
			  disabled={!canSend || loading}
			  title={!canSendPermission ? "Not authorized" : !canSend ? "Only draft invoices can be sent/posted" : ""}
        >
          {loading ? "Posting..." : "Send & post"}
        </button>
      </div>
    </div>
  );
}
