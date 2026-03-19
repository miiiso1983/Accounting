"use client";

import { useState } from "react";

type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";

const TYPE_LABELS: Record<AccountType, string> = {
  ASSET: "Asset / أصول",
  LIABILITY: "Liability / التزامات",
  EQUITY: "Equity / حقوق ملكية",
  INCOME: "Income / إيرادات",
  EXPENSE: "Expense / مصروفات",
};

const SUBTYPE_OPTIONS: Record<AccountType, string[]> = {
  ASSET: ["أصول متداولة", "أصول ثابتة", "أصول أخرى"],
  LIABILITY: ["التزامات متداولة", "التزامات طويلة الأجل", "التزامات أخرى"],
  EQUITY: ["رأس المال", "الأرباح المحتجزة", "حقوق ملكية أخرى"],
  INCOME: ["إيرادات تشغيلية", "إيرادات أخرى"],
  EXPENSE: ["مصروفات تشغيلية", "مصروفات إدارية", "مصروفات أخرى"],
};

export type QuickAccountResult = { id: string; code: string; name: string };

type Props = {
  onClose: () => void;
  onCreated: (account: QuickAccountResult) => void;
};

export function QuickAccountModal({ onClose, onCreated }: Props) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("EXPENSE");
  const [subType, setSubType] = useState<string | null>(null);
  const [isPosting, setIsPosting] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subTypeOptions = SUBTYPE_OPTIONS[type] ?? [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/coa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, name, type, subType, isPosting }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = typeof data?.error === "string" ? data.error : JSON.stringify(data?.error) || "Failed";
        setError(msg);
        return;
      }
      onCreated({ id: data.account.id, code: data.account.code, name: data.account.name });
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-semibold text-zinc-900">New Account / حساب جديد</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-lg leading-none">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Code / الرمز</label>
              <input value={code} onChange={(e) => setCode(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sky-500"
                placeholder="1001" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Type / النوع</label>
              <select value={type} onChange={(e) => {
                const t = e.target.value as AccountType;
                const allowed = SUBTYPE_OPTIONS[t] ?? [];
                setType(t);
                setSubType(subType && allowed.includes(subType) ? subType : null);
              }} className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500">
                {(Object.keys(TYPE_LABELS) as AccountType[]).map((t) => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1">Sub-category / التصنيف الفرعي</label>
            <select value={subType ?? ""} onChange={(e) => setSubType(e.target.value || null)}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500">
              <option value="">—</option>
              {subTypeOptions.map((st) => <option key={st} value={st}>{st}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1">Name / الاسم</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              placeholder="Cash / النقدية" required />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1">Account Level / مستوى الحساب</label>
            <div className="flex gap-3">
              {[
                { value: true, label: "Posting / تفصيلي", desc: "Transactions posted directly" },
                { value: false, label: "Header / تجميعي", desc: "Groups sub-accounts" },
              ].map(({ value, label, desc }) => (
                <label key={String(value)}
                  className={`flex-1 cursor-pointer rounded-lg border-2 p-2.5 text-sm transition-colors ${isPosting === value ? "border-sky-500 bg-sky-50" : "border-zinc-200 hover:border-zinc-300"}`}>
                  <input type="radio" className="sr-only" checked={isPosting === value} onChange={() => setIsPosting(value)} />
                  <div className="font-medium">{label}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">{desc}</div>
                </label>
              ))}
            </div>
          </div>
          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100">Cancel</button>
            <button type="submit" disabled={saving}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60">
              {saving ? "Saving…" : "Create Account"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

