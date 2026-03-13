"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  invoiceId: string;
  status: string;
  canWrite: boolean;
};

function readErrorMessage(data: unknown, fallback: string) {
  if (data && typeof data === "object" && "error" in data) {
    const message = (data as { error?: unknown }).error;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

async function readResponseData(res: Response) {
  const text = await res.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export function InvoiceListActions({ invoiceId, status, canWrite }: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const isDraft = status === "DRAFT";

  async function onDelete() {
    if (!confirm("Delete this draft invoice? / هل تريد حذف هذه الفاتورة المسودة؟")) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, { method: "DELETE" });
      const data = await readResponseData(res);
      if (!res.ok) {
        alert(readErrorMessage(data, `Failed to delete invoice (HTTP ${res.status})`));
        return;
      }
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link className="rounded-lg border px-2 py-1 text-xs hover:bg-zinc-50" href={`/app/invoices/${invoiceId}`}>
        View
      </Link>
      <Link className="rounded-lg border px-2 py-1 text-xs hover:bg-zinc-50" href={`/app/invoices/${invoiceId}/preview`}>
        Preview
      </Link>
      {canWrite && isDraft ? (
        <>
          <Link className="rounded-lg border px-2 py-1 text-xs hover:bg-zinc-50" href={`/app/invoices/${invoiceId}/edit`}>
            Edit
          </Link>
          <button
            className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100 disabled:opacity-60"
            type="button"
            onClick={onDelete}
            disabled={deleting}
          >
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </>
      ) : null}
    </div>
  );
}
