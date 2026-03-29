"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

function readErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  if (!("error" in data)) return null;
  const msg = (data as { error?: unknown }).error;
  return typeof msg === "string" ? msg : null;
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

type Props = {
  invoiceId: string;
  status: string;
  hasJournalEntry: boolean;
  canSendPermission: boolean;
  canDeletePermission: boolean;
  customerEmail?: string | null;
  customerPhone?: string | null;
};

export function InvoiceActions({ invoiceId, status, hasJournalEntry, canSendPermission, canDeletePermission, customerEmail, customerPhone }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [notifyLoading, setNotifyLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [returnAmount, setReturnAmount] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [showReturnForm, setShowReturnForm] = useState(false);

  const canSend = canSendPermission && status === "DRAFT" && !hasJournalEntry;
  const canDelete = canDeletePermission && status === "DRAFT";
  const canClose = status === "SENT" || status === "OVERDUE";
  const canReturn = status === "SENT" || status === "PAID" || status === "OVERDUE";
  const canWriteOff = status === "SENT" || status === "OVERDUE";

  async function onSend() {
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/send`, { method: "POST" });
      const data = await readResponseData(res);
      if (!res.ok) {
        const msg = readErrorMessage(data) ?? `Failed to send invoice (HTTP ${res.status})`;
        setError(msg);
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function onDelete() {
    if (!confirm("هل أنت متأكد من حذف هذه الفاتورة؟ لا يمكن التراجع عن هذا الإجراء.\n\nAre you sure you want to delete this invoice? This cannot be undone.")) return;
    setError(null);
    setSuccess(null);
    setDeleting(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, { method: "DELETE" });
      const data = await readResponseData(res);
      if (!res.ok) {
        setError(readErrorMessage(data) ?? `Failed to delete invoice (HTTP ${res.status})`);
        return;
      }
      router.push("/app/invoices");
      router.refresh();
    } finally {
      setDeleting(false);
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
      const data = (await readResponseData(res)) as Record<string, unknown> | null;
      if (!res.ok) {
        setError(readErrorMessage(data) ?? `Failed to send ${channel} notification (HTTP ${res.status})`);
        return;
      }
      if (data?.fallbackLink && typeof data.fallbackLink === "string") {
        window.open(data.fallbackLink, "_blank");
        setSuccess("WhatsApp link opened in new tab (API not configured)");
      } else {
        setSuccess(`${channel === "email" ? "📧" : "📱"} Notification sent successfully!`);
      }
    } finally {
      setNotifyLoading(null);
    }
  }

  async function onClose() {
    if (!confirm("هل أنت متأكد من إقفال هذه الفاتورة؟ سيتم شطب الرصيد المتبقي.\n\nAre you sure you want to close this invoice? The remaining balance will be written down.")) return;
    setError(null);
    setSuccess(null);
    setActionLoading("close");
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/close`, { method: "POST" });
      const data = await readResponseData(res);
      if (!res.ok) {
        setError(readErrorMessage(data) ?? `Failed to close invoice (HTTP ${res.status})`);
        return;
      }
      setSuccess("✅ Invoice closed successfully / تم إقفال الفاتورة");
      router.refresh();
    } finally {
      setActionLoading(null);
    }
  }

  async function onReturn() {
    if (!returnAmount.trim()) {
      setError("Please enter a return amount / أدخل مبلغ المرتجع");
      return;
    }
    setError(null);
    setSuccess(null);
    setActionLoading("return");
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/return`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount: returnAmount.trim(), reason: returnReason.trim() || undefined }),
      });
      const data = await readResponseData(res);
      if (!res.ok) {
        setError(readErrorMessage(data) ?? `Failed to process return (HTTP ${res.status})`);
        return;
      }
      setSuccess("✅ Sales return recorded / تم تسجيل المرتجع");
      setReturnAmount("");
      setReturnReason("");
      setShowReturnForm(false);
      router.refresh();
    } finally {
      setActionLoading(null);
    }
  }

  async function onWriteOff() {
    if (!confirm("هل أنت متأكد من شطب هذه الفاتورة كديون معدومة؟\n\nAre you sure you want to write off this invoice as bad debt?")) return;
    setError(null);
    setSuccess(null);
    setActionLoading("writeoff");
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/writeoff`, { method: "POST" });
      const data = await readResponseData(res);
      if (!res.ok) {
        setError(readErrorMessage(data) ?? `Failed to write off invoice (HTTP ${res.status})`);
        return;
      }
      setSuccess("✅ Invoice written off / تم شطب الفاتورة");
      router.refresh();
    } finally {
      setActionLoading(null);
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

        {canClose && (
          <button
            type="button"
            className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700 hover:bg-amber-100 disabled:opacity-50"
            onClick={onClose}
            disabled={actionLoading !== null}
          >
            {actionLoading === "close" ? "Closing..." : "🔒 Close / إقفال"}
          </button>
        )}

        {canReturn && (
          <button
            type="button"
            className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm text-violet-700 hover:bg-violet-100 disabled:opacity-50"
            onClick={() => setShowReturnForm(!showReturnForm)}
            disabled={actionLoading !== null}
          >
            ↩ Return / مرتجع
          </button>
        )}

        {canWriteOff && (
          <button
            type="button"
            className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-2 text-sm text-orange-700 hover:bg-orange-100 disabled:opacity-50"
            onClick={onWriteOff}
            disabled={actionLoading !== null}
          >
            {actionLoading === "writeoff" ? "Writing off..." : "💀 Write-off / شطب"}
          </button>
        )}

        {canDelete && (
          <button
            type="button"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 hover:bg-red-100 disabled:opacity-50"
            onClick={onDelete}
            disabled={deleting}
          >
            {deleting ? "Deleting..." : "🗑 Delete / حذف"}
          </button>
        )}
      </div>

      {showReturnForm && canReturn && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 grid gap-3">
          <div className="text-sm font-medium text-violet-800">Sales Return / مرتجع مبيعات</div>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="grid gap-1">
              <span className="text-xs text-violet-600">Return Amount / مبلغ المرتجع</span>
              <input
                className="rounded-lg border bg-white px-3 py-2 text-sm"
                inputMode="decimal"
                placeholder="0.00"
                value={returnAmount}
                onChange={(e) => setReturnAmount(e.target.value)}
              />
            </label>
            <label className="grid gap-1 md:col-span-2">
              <span className="text-xs text-violet-600">Reason (optional) / السبب</span>
              <input
                className="rounded-lg border bg-white px-3 py-2 text-sm"
                placeholder="e.g. Damaged goods"
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
              />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded-lg border px-3 py-1.5 text-sm text-zinc-600 hover:bg-white"
              onClick={() => { setShowReturnForm(false); setReturnAmount(""); setReturnReason(""); }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-lg bg-violet-700 px-4 py-1.5 text-sm text-white hover:bg-violet-600 disabled:opacity-50"
              onClick={onReturn}
              disabled={actionLoading !== null}
            >
              {actionLoading === "return" ? "Processing..." : "Confirm Return"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type PaymentRow = {
  id: string;
  receiptLabel: string;
  paymentDate: string; // dd/mm/yyyy
  amount: string;
  currencyCode: string;
  amountBase: string;
  baseCurrencyCode: string;
  method: string;
  note: string;
  receiptUrl: string;
};

type InvoicePaymentsPanelProps = {
  invoiceId: string;
  invoiceStatus: string;
  invoiceCurrencyCode: string;
  baseCurrencyCode: string;
  canRead: boolean;
  canWrite: boolean;
  customerEmail?: string | null;
  customerPhone?: string | null;
  payments: PaymentRow[];
};

export function InvoicePaymentsPanel({
  invoiceId,
  invoiceStatus,
  invoiceCurrencyCode,
  baseCurrencyCode,
  canRead,
  canWrite,
  customerEmail,
  customerPhone,
  payments,
}: InvoicePaymentsPanelProps) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [notifyLoading, setNotifyLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [paymentDate, setPaymentDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState<string>("");
  const [currencyCode, setCurrencyCode] = useState<string>(invoiceCurrencyCode);
  const [method, setMethod] = useState<string>("CASH");
  const [note, setNote] = useState<string>("");
  const [rate, setRate] = useState<string>("");
  const [notify, setNotify] = useState<boolean>(true);

  const needsFx = currencyCode !== baseCurrencyCode;
  const canRecord = canWrite && invoiceStatus !== "DRAFT" && invoiceStatus !== "CANCELLED";
  const canNotifyReceipt = canRead || canWrite;

  async function onCreatePayment(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setCreating(true);
    try {
			const trimmedAmount = amount.trim();
			const trimmedRate = rate.trim();
      const body: Record<string, unknown> = {
        paymentDate,
				amount: trimmedAmount,
        currencyCode,
        method,
        note: note.trim() ? note : undefined,
        notify,
      };
			// Only send exchangeRate if user provided it; otherwise the API may reuse the invoice FX rate.
			if (needsFx && trimmedRate) body.exchangeRate = { rate: trimmedRate };

      const res = await fetch(`/api/invoices/${invoiceId}/payments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await readResponseData(res);
      if (!res.ok) {
        setError(readErrorMessage(data) ?? `Failed to record payment (HTTP ${res.status})`);
        return;
      }

      setAmount("");
      setNote("");
      setRate("");
      setSuccess("Payment recorded. Receipt notification attempted.");
      router.refresh();
    } finally {
      setCreating(false);
    }
  }

  async function onNotifyPayment(paymentId: string, channel: "email" | "whatsapp") {
    setError(null);
    setSuccess(null);
    setNotifyLoading(`${paymentId}:${channel}`);
    try {
      const res = await fetch(`/api/payments/${paymentId}/notify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channel }),
      });
      const data = (await readResponseData(res)) as Record<string, unknown> | null;
      if (!res.ok) {
        setError(readErrorMessage(data) ?? `Failed to send ${channel} receipt (HTTP ${res.status})`);
        return;
      }
      if (data?.fallbackLink && typeof data.fallbackLink === "string") {
        window.open(data.fallbackLink, "_blank");
        setSuccess("WhatsApp link opened in new tab (API not configured)");
      } else {
        setSuccess(`Receipt sent successfully (${channel}).`);
      }
    } finally {
      setNotifyLoading(null);
    }
  }

  if (!canRead && !canWrite) {
    return <div className="rounded-2xl border bg-white p-5 text-sm">Not authorized.</div>;
  }

  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-zinc-900">Payments / الدفعات</div>
          <div className="mt-1 text-xs text-zinc-500">
            Record payments and send bilingual receipt notifications (Email/WhatsApp).
          </div>
        </div>
        <div className="text-right text-xs text-zinc-500">
          Base currency: <span className="font-mono text-zinc-800">{baseCurrencyCode}</span>
        </div>
      </div>

      {error ? <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}
      {success ? <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{success}</div> : null}

      {canWrite ? (
        <form onSubmit={onCreatePayment} className="mt-4 grid gap-3 rounded-xl border bg-zinc-50 p-4">
          <div className="grid gap-3 md:grid-cols-5">
            <label className="grid gap-1">
              <span className="text-xs text-zinc-500">Date</span>
              <input className="rounded-lg border bg-white px-3 py-2 text-sm" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
            </label>

            <label className="grid gap-1 md:col-span-2">
              <span className="text-xs text-zinc-500">Amount</span>
              <input
                className="rounded-lg border bg-white px-3 py-2 text-sm"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>

            <label className="grid gap-1">
              <span className="text-xs text-zinc-500">Currency</span>
              <select className="rounded-lg border bg-white px-3 py-2 text-sm" value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)}>
                <option value="IQD">IQD</option>
                <option value="USD">USD</option>
              </select>
            </label>

            <label className="grid gap-1">
              <span className="text-xs text-zinc-500">Method</span>
              <select className="rounded-lg border bg-white px-3 py-2 text-sm" value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="CASH">Cash</option>
                <option value="BANK">Bank</option>
                <option value="TRANSFER">Transfer</option>
              </select>
            </label>
          </div>

          {needsFx ? (
            <label className="grid gap-1">
              <span className="text-xs text-zinc-500">Exchange rate (1 {currencyCode} = ? {baseCurrencyCode})</span>
              <input className="rounded-lg border bg-white px-3 py-2 text-sm" inputMode="decimal" placeholder="e.g. 1300" value={rate} onChange={(e) => setRate(e.target.value)} />
            </label>
          ) : null}

          <label className="grid gap-1">
            <span className="text-xs text-zinc-500">Note (optional)</span>
            <input className="rounded-lg border bg-white px-3 py-2 text-sm" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
              Send receipt automatically
            </label>

            <button
              type="submit"
              className="rounded-xl bg-emerald-700 px-4 py-2 text-sm text-white hover:bg-emerald-600 disabled:opacity-50"
              disabled={!canRecord || creating}
              title={!canRecord ? "Invoice must be SENT/POSTED and you must have permission" : ""}
            >
              {creating ? "Saving..." : "Record payment"}
            </button>
          </div>
        </form>
      ) : null}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-zinc-500">
            <tr className="border-b">
              <th className="py-2 pr-3">Receipt #</th>
              <th className="py-2 pr-3">Date</th>
              <th className="py-2 pr-3">Amount</th>
              <th className="py-2 pr-3">Base</th>
              <th className="py-2 pr-3">Method</th>
              <th className="py-2 pr-3">Receipt</th>
              <th className="py-2 pr-3">Send</th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 ? (
              <tr>
                <td className="py-3 text-sm text-zinc-600" colSpan={7}>
                  No payments recorded yet.
                </td>
              </tr>
            ) : (
              payments.map((p) => (
                <tr key={p.id} className="border-b last:border-b-0">
                  <td className="py-2 pr-3 font-mono text-zinc-900">{p.receiptLabel}</td>
                  <td className="py-2 pr-3 font-mono text-zinc-700">{p.paymentDate}</td>
                  <td className="py-2 pr-3 font-mono text-zinc-900">
                    {p.amount} {p.currencyCode}
                  </td>
                  <td className="py-2 pr-3 font-mono text-zinc-700">
                    {p.amountBase} {p.baseCurrencyCode}
                  </td>
                  <td className="py-2 pr-3 text-zinc-700">{p.method}</td>
                  <td className="py-2 pr-3 flex items-center gap-2">
                    <a className="text-sm underline text-emerald-700" href={p.receiptUrl} target="_blank" rel="noreferrer">
                      Open
                    </a>
                    <a
                      className="text-sm underline text-sky-700"
                      href={`/app/invoices/${invoiceId}/payments/${p.id}/preview`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      🖨 Print
                    </a>
                  </td>
                  <td className="py-2 pr-3">
                    {canNotifyReceipt ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs text-sky-700 hover:bg-sky-100 disabled:opacity-50"
                          onClick={() => onNotifyPayment(p.id, "email")}
                          disabled={!customerEmail || notifyLoading !== null}
                          title={!customerEmail ? "Customer has no email" : ""}
                        >
                          {notifyLoading === `${p.id}:email` ? "Sending..." : "Email"}
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                          onClick={() => onNotifyPayment(p.id, "whatsapp")}
                          disabled={!customerPhone || notifyLoading !== null}
                          title={!customerPhone ? "Customer has no phone" : ""}
                        >
                          {notifyLoading === `${p.id}:whatsapp` ? "Sending..." : "WhatsApp"}
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-zinc-400">Not authorized</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
