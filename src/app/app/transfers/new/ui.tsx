"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";

type AccountOption = { id: string; code: string; name: string; currencyCode: string | null };
type Props = { accounts: AccountOption[]; baseCurrencyCode: string };

const ApiOkSchema = z.object({ id: z.string().min(1) });
const ApiErrSchema = z.object({ error: z.string().min(1) });

const ACCOUNT_CURRENCY_MAP: Record<string, string> = {
  "1110": "IQD",
  "1111": "USD",
  "1120": "IQD",
  "1121": "USD",
};

export function TransferForm({ accounts, baseCurrencyCode }: Props) {
  const router = useRouter();
  const [transferDate, setTransferDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [sourceCode, setSourceCode] = useState("");
  const [destCode, setDestCode] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [exchangeRate, setExchangeRate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Determine currency from source account
  const sourceCurrency = sourceCode ? (ACCOUNT_CURRENCY_MAP[sourceCode] ?? baseCurrencyCode) : "";
  const destCurrency = destCode ? (ACCOUNT_CURRENCY_MAP[destCode] ?? baseCurrencyCode) : "";
  const txCurrency = sourceCurrency || baseCurrencyCode;
  const needsFx = txCurrency !== baseCurrencyCode;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!sourceCode || !destCode) { setError("Select both source and destination accounts"); return; }
    if (sourceCode === destCode) { setError("Source and destination must be different"); return; }
    if (!amount || Number(amount) <= 0) { setError("Amount must be greater than 0"); return; }
    if (needsFx && !exchangeRate) { setError("Exchange rate is required for foreign currency transfers"); return; }

    setSubmitting(true);
    try {
      const res = await fetch("/api/transfers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          transferDate,
          sourceAccountCode: sourceCode,
          destinationAccountCode: destCode,
          amount,
          currencyCode: txCurrency,
          exchangeRate: needsFx ? { rate: exchangeRate } : undefined,
          description: description || undefined,
        }),
      });

      const data: unknown = await res.json();
      if (!res.ok) {
        const parsed = ApiErrSchema.safeParse(data);
        setError(parsed.success ? parsed.data.error : "Transfer failed");
        return;
      }

      const ok = ApiOkSchema.safeParse(data);
      if (ok.success) {
        router.push("/app/transfers");
        router.refresh();
      }
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls = "w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200";
  const labelCls = "block text-xs font-medium text-zinc-600 mb-1";

  return (
    <form onSubmit={onSubmit} className="max-w-lg space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-medium text-zinc-900">New Fund Transfer / تحويل جديد</h1>
          <p className="mt-1 text-xs text-zinc-500">Move funds between cash and bank accounts / نقل الأموال بين الحسابات</p>
        </div>
        <a href="/app/transfers" className="text-sm underline text-zinc-600">Back / رجوع</a>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

      <div>
        <label className={labelCls}>Transfer Date / تاريخ التحويل *</label>
        <input type="date" required value={transferDate} onChange={(e) => setTransferDate(e.target.value)} className={inputCls} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>From Account / من حساب *</label>
          <select required value={sourceCode} onChange={(e) => setSourceCode(e.target.value)} className={inputCls}>
            <option value="">Select source / اختر المصدر</option>
            {accounts.map((a) => (
              <option key={a.code} value={a.code}>{a.code} - {a.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>To Account / إلى حساب *</label>
          <select required value={destCode} onChange={(e) => setDestCode(e.target.value)} className={inputCls}>
            <option value="">Select destination / اختر الوجهة</option>
            {accounts.filter((a) => a.code !== sourceCode).map((a) => (
              <option key={a.code} value={a.code}>{a.code} - {a.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Amount / المبلغ *</label>
          <input type="number" step="0.01" min="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} placeholder="0.00" />
        </div>
        <div>
          <label className={labelCls}>Currency / العملة</label>
          <input type="text" readOnly value={txCurrency || "-"} className={`${inputCls} bg-zinc-50 text-zinc-500`} />
        </div>
      </div>

      {needsFx && (
        <div>
          <label className={labelCls}>Exchange Rate / سعر الصرف * (1 {txCurrency} = ? {baseCurrencyCode})</label>
          <input type="number" step="0.000001" min="0.000001" required value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} className={inputCls} placeholder="e.g. 1480" />
        </div>
      )}

      <div>
        <label className={labelCls}>Description / الوصف</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} rows={2} placeholder="Optional note / ملاحظة اختيارية" />
      </div>

      {sourceCode && destCode && amount && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
          <strong>Summary / ملخص:</strong> Transfer {amount} {txCurrency} from{" "}
          <span className="font-mono">{sourceCode}</span> to <span className="font-mono">{destCode}</span>
          {needsFx && exchangeRate ? ` (Rate: 1 ${txCurrency} = ${exchangeRate} ${baseCurrencyCode})` : ""}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
      >
        {submitting ? "Processing... / جاري المعالجة..." : "Submit Transfer / تنفيذ التحويل"}
      </button>
    </form>
  );
}

