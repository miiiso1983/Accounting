"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function EstimateActions({ estimateId, status, canConvert }: { estimateId: string; status: string; canConvert: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function action(endpoint: string, label: string) {
    setLoading(label);
    setError(null);
    try {
      const res = await fetch(`/api/estimates/${estimateId}/${endpoint}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Failed: ${label}`);
        return data;
      }
      router.refresh();
      return data;
    } catch {
      setError(`Failed: ${label}`);
    } finally {
      setLoading(null);
    }
  }

  async function handleConvert() {
    const data = await action("convert", "Converting...");
    if (data?.invoiceId) {
      router.push(`/app/invoices/${data.invoiceId}`);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-zinc-100">
      {error && <div className="w-full rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      {status === "DRAFT" && (
        <>
          <button
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            onClick={() => action("send", "Sending...")}
            disabled={!!loading}
          >
            {loading === "Sending..." ? "Sending..." : "Send / إرسال"}
          </button>
          <a
            className="rounded-xl border px-4 py-2 text-sm hover:bg-zinc-50"
            href={`/app/estimates/${estimateId}/edit`}
          >
            Edit / تعديل
          </a>
        </>
      )}

      {(status === "SENT" || status === "ACCEPTED") && canConvert && (
        <button
          className="rounded-xl bg-purple-600 px-4 py-2 text-sm text-white hover:bg-purple-700 disabled:opacity-50"
          onClick={handleConvert}
          disabled={!!loading}
        >
          {loading === "Converting..." ? "Converting..." : "Convert to Invoice / تحويل لفاتورة"}
        </button>
      )}

      {status === "DRAFT" && canConvert && (
        <button
          className="rounded-xl bg-purple-600 px-4 py-2 text-sm text-white hover:bg-purple-700 disabled:opacity-50"
          onClick={handleConvert}
          disabled={!!loading}
        >
          {loading === "Converting..." ? "Converting..." : "Convert to Invoice / تحويل لفاتورة"}
        </button>
      )}
    </div>
  );
}
