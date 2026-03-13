"use client";

import { useState, useCallback } from "react";

export type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";

export type TreeNode = {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  isPosting: boolean;
  children: TreeNode[];
};

type FormState = {
  mode: "create" | "edit";
  parentId: string | null;
  parentType: AccountType | null;
  id?: string;
  code: string;
  name: string;
  type: AccountType;
  isPosting: boolean;
};

const TYPE_LABELS: Record<AccountType, string> = {
  ASSET: "Asset / أصول",
  LIABILITY: "Liability / التزامات",
  EQUITY: "Equity / حقوق ملكية",
  INCOME: "Income / إيرادات",
  EXPENSE: "Expense / مصروفات",
};

const TYPE_COLORS: Record<AccountType, string> = {
  ASSET: "text-sky-700 bg-sky-50",
  LIABILITY: "text-rose-700 bg-rose-50",
  EQUITY: "text-purple-700 bg-purple-50",
  INCOME: "text-emerald-700 bg-emerald-50",
  EXPENSE: "text-orange-700 bg-orange-50",
};

function defaultForm(override: Partial<FormState> = {}): FormState {
  return {
    mode: "create",
    parentId: null,
    parentType: null,
    code: "",
    name: "",
    type: "ASSET",
    isPosting: true,
    ...override,
  };
}

export function CoaClient({
  initialRoots,
  canWrite,
}: {
  initialRoots: TreeNode[];
  canWrite: boolean;
}) {
  const [roots, setRoots] = useState<TreeNode[]>(initialRoots);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/coa");
    if (!res.ok) return;
    const data = await res.json();
    const flat: { id: string; code: string; name: string; type: AccountType; isPosting: boolean; parentId: string | null }[] =
      data.accounts;
    const byId = new Map<string, TreeNode>();
    for (const a of flat) byId.set(a.id, { ...a, children: [] });
    const newRoots: TreeNode[] = [];
    for (const a of flat) {
      const node = byId.get(a.id)!;
      if (a.parentId) byId.get(a.parentId)?.children.push(node);
      else newRoots.push(node);
    }
    setRoots(newRoots);
  }, []);

  const openCreate = (parentId: string | null, parentType: AccountType | null) => {
    setError(null);
    setForm(defaultForm({ mode: "create", parentId, parentType, type: parentType ?? "ASSET" }));
  };

  const openEdit = (node: TreeNode) => {
    setError(null);
    setForm({ mode: "edit", parentId: null, parentType: null, id: node.id, code: node.code, name: node.name, type: node.type, isPosting: node.isPosting });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this account? This cannot be undone.")) return;
    const res = await fetch(`/api/coa/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json();
      alert(d.error ?? "Failed to delete");
      return;
    }
    await refresh();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setError(null);
    try {
      const isEdit = form.mode === "edit";
      const url = isEdit ? `/api/coa/${form.id}` : "/api/coa";
      const method = isEdit ? "PUT" : "POST";
      const body = isEdit
        ? { code: form.code, name: form.name, type: form.type, isPosting: form.isPosting }
        : { code: form.code, name: form.name, type: form.type, isPosting: form.isPosting, parentId: form.parentId };
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setError(typeof data.error === "string" ? data.error : "Error saving account"); return; }
      setForm(null);
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-sm text-zinc-500">Chart of Accounts / دليل الحسابات</div>
          <div className="mt-0.5 text-base font-semibold text-zinc-900">Unified Accounting System</div>
        </div>
        {canWrite && (
          <button onClick={() => openCreate(null, null)} className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 transition-colors">
            + New Account
          </button>
        )}
      </div>

      <div className="space-y-0.5 text-sm">
        {roots.map((r) => (
          <TreeRow key={r.id} node={r} depth={0} canWrite={canWrite} onAddChild={openCreate} onEdit={openEdit} onDelete={handleDelete} />
        ))}
        {roots.length === 0 && <div className="text-zinc-400 text-center py-8">No accounts yet. Click &quot;+ New Account&quot; to begin.</div>}
      </div>

      {form && (
        <AccountModal
          form={form}
          onChange={setForm}
          onClose={() => setForm(null)}
          onSubmit={handleSubmit}
          saving={saving}
          error={error}
        />
      )}
    </div>
  );
}

function TreeRow({
  node,
  depth,
  canWrite,
  onAddChild,
  onEdit,
  onDelete,
}: {
  node: TreeNode;
  depth: number;
  canWrite: boolean;
  onAddChild: (parentId: string, parentType: AccountType) => void;
  onEdit: (node: TreeNode) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div
        className="group flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-zinc-50 transition-colors"
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        <button
          onClick={() => setExpanded((p) => !p)}
          className="w-4 text-zinc-400 shrink-0"
        >
          {hasChildren ? (expanded ? "▾" : "▸") : "·"}
        </button>
        <span className="w-20 font-mono text-xs text-zinc-500 shrink-0">{node.code}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${TYPE_COLORS[node.type]}`}>
          {node.type}
        </span>
        <span className={`flex-1 ${node.isPosting ? "text-zinc-900" : "font-medium text-zinc-700"}`}>
          {node.name}
        </span>
        {!node.isPosting && (
          <span className="text-xs text-zinc-400 shrink-0">[Header]</span>
        )}
        {canWrite && (
          <span className="hidden group-hover:flex items-center gap-1 shrink-0">
            <button
              onClick={() => onAddChild(node.id, node.type)}
              title="Add sub-account"
              className="rounded px-1.5 py-0.5 text-xs text-sky-600 hover:bg-sky-100"
            >
              + Sub
            </button>
            <button
              onClick={() => onEdit(node)}
              title="Edit"
              className="rounded px-1.5 py-0.5 text-xs text-zinc-600 hover:bg-zinc-100"
            >
              ✏️
            </button>
            {!hasChildren && (
              <button
                onClick={() => onDelete(node.id)}
                title="Delete"
                className="rounded px-1.5 py-0.5 text-xs text-rose-600 hover:bg-rose-100"
              >
                🗑
              </button>
            )}
          </span>
        )}
      </div>
      {expanded &&
        node.children.map((c) => (
          <TreeRow key={c.id} node={c} depth={depth + 1} canWrite={canWrite} onAddChild={onAddChild} onEdit={onEdit} onDelete={onDelete} />
        ))}
    </div>
  );
}

function AccountModal({
  form,
  onChange,
  onClose,
  onSubmit,
  saving,
  error,
}: {
  form: FormState;
  onChange: (f: FormState) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  saving: boolean;
  error: string | null;
}) {
  const isEdit = form.mode === "edit";
  const typeOptions: AccountType[] = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"];
  const typeDisabled = !!form.parentType;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-semibold text-zinc-900">
            {isEdit ? "Edit Account / تعديل الحساب" : form.parentId ? "Add Sub-Account / إضافة حساب فرعي" : "New Account / حساب جديد"}
          </h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-lg leading-none">✕</button>
        </div>
        <form onSubmit={onSubmit} className="space-y-4 px-5 py-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Code / الرمز</label>
              <input
                value={form.code}
                onChange={(e) => onChange({ ...form, code: e.target.value })}
                className="w-full rounded-lg border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sky-500"
                placeholder="1001"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Type / النوع</label>
              <select
                value={form.type}
                onChange={(e) => onChange({ ...form, type: e.target.value as AccountType })}
                disabled={typeDisabled}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-zinc-50 disabled:text-zinc-400"
              >
                {typeOptions.map((t) => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
              {typeDisabled && <p className="text-xs text-zinc-400 mt-0.5">Inherited from parent</p>}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1">Name / الاسم</label>
            <input
              value={form.name}
              onChange={(e) => onChange({ ...form, name: e.target.value })}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              placeholder="Cash / النقدية"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1">Account Level / مستوى الحساب</label>
            <div className="flex gap-3">
              {[
                { value: true, label: "Posting / تفصيلي", desc: "Transactions posted directly" },
                { value: false, label: "Header / تجميعي", desc: "Groups sub-accounts" },
              ].map(({ value, label, desc }) => (
                <label
                  key={String(value)}
                  className={`flex-1 cursor-pointer rounded-lg border-2 p-2.5 text-sm transition-colors ${form.isPosting === value ? "border-sky-500 bg-sky-50" : "border-zinc-200 hover:border-zinc-300"}`}
                >
                  <input
                    type="radio"
                    className="sr-only"
                    checked={form.isPosting === value}
                    onChange={() => onChange({ ...form, isPosting: value })}
                  />
                  <div className="font-medium">{label}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">{desc}</div>
                </label>
              ))}
            </div>
          </div>
          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60"
            >
              {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Account"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

