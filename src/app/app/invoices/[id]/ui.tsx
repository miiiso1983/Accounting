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
  customerEmail?: string | null;
  customerPhone?: string | null;
};

export function InvoiceActions({ invoiceId, status, hasJournalEntry, canSendPermission, customerEmail, customerPhone }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [notifyLoading, setNotifyLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canSend = canSendPermission && status === "DRAFT" && !hasJournalEntry;

  async function onSend() {
    setError(null);
    setSuccess(null);
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

  async function onNotify(channel: "email" | "whatsapp") {
    setError(null);
    setSuccess(null);
    setNotifyLoading(channel);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/notify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channel }),
      });
      const data = await res.json() as Record<string, unknown>;
      if (!res.ok) {
        setError(readErrorMessage(data) ?? `Failed to send ${channel} notification`);
        return;
      }
      if (data.fallbackLink && typeof data.fallbackLink === "string") {
        window.open(data.fallbackLink, "_blank");
        setSuccess("WhatsApp link opened in new tab (API not configured)");
      } else {
        setSuccess(`${channel === "email" ? "📧" : "📱"} Notification sent successfully!`);
      }
    } finally {
      setNotifyLoading(null);
    }
  }

  return (
    <div className="grid gap-3">
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}
      {success ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{success}</div> : null}

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

        {customerEmail && (
          <button
            type="button"
            className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-700 hover:bg-sky-100 disabled:opacity-50"
            onClick={() => onNotify("email")}
            disabled={notifyLoading !== null}
          >
            {notifyLoading === "email" ? "Sending..." : "📧 Email"}
          </button>
        )}

        {customerPhone && (
          <button
            type="button"
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
            onClick={() => onNotify("whatsapp")}
            disabled={notifyLoading !== null}
          >
            {notifyLoading === "whatsapp" ? "Sending..." : "📱 WhatsApp"}
          </button>
        )}
      </div>
    </div>
  );
}
