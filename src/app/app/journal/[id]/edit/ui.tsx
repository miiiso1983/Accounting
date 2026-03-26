"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

type AccountOption = { id: string; code: string; name: string };
type CostCenterOption = { id: string; code: string; name: string };
type BranchOption = { id: string; code: string; name: string; isActive?: boolean };

type InitialData = {
  id: string;
  entryDate: string;
  description: string;
  branchId: string;
  currencyCode: "IQD" | "USD";
  lines: Array<{
    accountId: string;
    costCenterId: string;
    debitAmount: string;
    creditAmount: string;
    description: string;
  }>;
};

type Props = {
  entryId: string;
  initialData: InitialData;
  accounts: AccountOption[];
  costCenters: CostCenterOption[];
  branches: BranchOption[];
  baseCurrencyCode: "IQD" | "USD";
};

const LineSchema = z.object({
  accountId: z.string().min(1),
  costCenterId: z.string().optional(),
  debitAmount: z.string().optional(),
  creditAmount: z.string().optional(),
  description: z.string().optional(),
}).refine(
  (l) => {
    const d = l.debitAmount?.trim();
    const c = l.creditAmount?.trim();
    const hasDebit = !!d && Number(d) > 0;
    const hasCredit = !!c && Number(c) > 0;
    return (hasDebit && !hasCredit) || (!hasDebit && hasCredit);
  },
  { message: "Each line must have either a debit or credit amount (not both)" },
);

const FormSchema = z.object({
  entryDate: z.string().min(1),
  description: z.string().optional(),
  branchId: z.string().optional(),
  currencyCode: z.enum(["IQD", "USD"]).optional(),
  exchangeRate: z.string().optional(),
  lines: z.array(LineSchema).min(2),
});

const ApiOkSchema = z.object({ id: z.string().min(1) });
const ApiErrSchema = z.object({ error: z.string().min(1) });

type FormValues = z.infer<typeof FormSchema>;

function autoResizeTextarea(el: HTMLTextAreaElement, maxRows: number) {
  // Reset first so shrink works
  el.style.height = "auto";

  const cs = window.getComputedStyle(el);
  const lhRaw = Number.parseFloat(cs.lineHeight);
  const lineHeight = Number.isFinite(lhRaw) ? lhRaw : 20;
  const padTop = Number.parseFloat(cs.paddingTop) || 0;
  const padBot = Number.parseFloat(cs.paddingBottom) || 0;
  const borderTop = Number.parseFloat(cs.borderTopWidth) || 0;
  const borderBot = Number.parseFloat(cs.borderBottomWidth) || 0;
  const maxHeight = lineHeight * maxRows + padTop + padBot + borderTop + borderBot;

  const next = Math.min(el.scrollHeight, maxHeight);
  el.style.height = `${next}px`;
  el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
}

export function JournalEntryEditForm({ entryId, initialData, accounts, costCenters, branches, baseCurrencyCode }: Props) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      entryDate: initialData.entryDate,
      description: initialData.description,
      branchId: initialData.branchId,
      currencyCode: initialData.currencyCode,
      lines: initialData.lines,
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "lines" });

  const currencyCode = useWatch({ control: form.control, name: "currencyCode" });
  const showFx = currencyCode && currencyCode !== baseCurrencyCode;

	  const descriptionReg = form.register("description");
	  const descriptionElRef = useRef<HTMLTextAreaElement | null>(null);
	  useEffect(() => {
	    if (descriptionElRef.current) autoResizeTextarea(descriptionElRef.current, 5);
	  }, []);

  async function onSubmit(values: FormValues) {
    setServerError(null);
    const payload = {
      entryDate: values.entryDate,
      description: values.description,
      branchId: values.branchId || "",
      currencyCode: values.currencyCode,
      exchangeRate: showFx ? { rate: values.exchangeRate } : undefined,
      lines: values.lines.map((l) => {
        const d = l.debitAmount?.trim();
        const c = l.creditAmount?.trim();
        const isDebit = !!d && Number(d) > 0;
        return {
          accountId: l.accountId,
          dc: isDebit ? "DEBIT" : "CREDIT",
          amount: isDebit ? d! : c!,
          costCenterId: l.costCenterId?.trim() ? l.costCenterId.trim() : undefined,
          description: l.description,
        };
      }),
    };

    const res = await fetch(`/api/journal-entries/${entryId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data: unknown = await res.json();
    if (!res.ok) {
      const parsedErr = ApiErrSchema.safeParse(data);
	      setServerError(parsedErr.success ? parsedErr.data.error : "Failed to update manual entry");
      return;
    }

    const parsedOk = ApiOkSchema.safeParse(data);
    if (!parsedOk.success) {
      setServerError("Updated but no id returned");
      return;
    }

    router.push(`/app/journal/${parsedOk.data.id}`);
    router.refresh();
  }

  return (
    <form className="grid gap-5 max-w-full box-border" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Entry date / تاريخ القيد</label>
          <input className="mt-1 w-full rounded-xl border dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 px-3 py-2 text-sm" type="date" {...form.register("entryDate")} />
        </div>
        <div>
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Branch / الفرع</label>
          <select className="mt-1 w-full rounded-xl border dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 px-3 py-2 text-sm" {...form.register("branchId")} disabled={branches.length === 0}>
            <option value="">— None / بدون —</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code} — {b.name}{b.isActive === false ? " (Inactive / غير نشط)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Currency / العملة</label>
          <select className="mt-1 w-full rounded-xl border dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 px-3 py-2 text-sm" {...form.register("currencyCode")}>
            <option value={baseCurrencyCode}>{baseCurrencyCode}</option>
            {baseCurrencyCode === "IQD" ? <option value="USD">USD</option> : <option value="IQD">IQD</option>}
          </select>
        </div>
      </div>

      {showFx ? (
        <div>
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Exchange rate / سعر الصرف</label>
          <div className="mt-1 flex items-center gap-2">
            <div className="text-sm text-zinc-600 dark:text-zinc-400">1 {currencyCode} =</div>
            <input className="w-40 rounded-xl border dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 px-3 py-2 text-sm" placeholder="e.g. 1300" {...form.register("exchangeRate")} />
            <div className="text-sm text-zinc-600 dark:text-zinc-400">{baseCurrencyCode}</div>
          </div>
        </div>
      ) : null}

      <div>
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Description / الوصف</label>
	        <textarea
	          rows={1}
	          className="mt-1 w-full rounded-xl border dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 px-3 py-2 text-sm resize-none"
	          placeholder="Memo / ملاحظة"
	          {...descriptionReg}
	          ref={(el) => {
	            descriptionReg.ref(el);
	            descriptionElRef.current = el;
	          }}
	          onInput={(e) => autoResizeTextarea(e.currentTarget, 5)}
	        />
      </div>

      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/30 dark:bg-zinc-900/30 p-4 md:p-5">
        <div className="flex items-center justify-between gap-4 mb-3">
          <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Lines / البنود</div>
          <button
            type="button"
            className="shrink-0 rounded-xl border dark:border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 dark:text-zinc-300"
            onClick={() => append({ accountId: "", costCenterId: "", debitAmount: "", creditAmount: "", description: "" })}
          >
            Add line / إضافة بند
          </button>
        </div>

	        <div className="overflow-x-auto">
	          <div className="w-max min-w-full">
	            {/* Column headers */}
              <div className="flex items-center gap-2 px-1 pb-2 border-b border-zinc-200 dark:border-zinc-700 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                <div className="flex-1 min-w-65">Account / الحساب</div>
                <div className="min-w-45">Cost Center / مركز كلفة</div>
	              <div className="min-w-30 text-end">Debit / مدين</div>
	              <div className="min-w-30 text-end">Credit / دائن</div>
	              <div className="min-w-50">Description / الوصف</div>
	              <div className="min-w-14 text-center">Actions / الإجراءات</div>
	            </div>

	            <div className="mt-2 space-y-2">
	              {fields.map((f, idx) => (
                  <div key={f.id} className="flex items-start gap-2">
                    <div className="flex-1 min-w-65">
                    <select className="w-full rounded-xl border dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 px-3 py-2 text-sm" {...form.register(`lines.${idx}.accountId` as const)}>
                      <option value="">Select account…</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                      ))}
                    </select>
                  </div>
                    <div className="min-w-45">
                    <select className="w-full rounded-xl border dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 px-3 py-2 text-sm" {...form.register(`lines.${idx}.costCenterId` as const)}>
                      <option value="">— None —</option>
                      {costCenters.map((cc) => (
                        <option key={cc.id} value={cc.id}>{cc.code} — {cc.name}</option>
                      ))}
                    </select>
                  </div>
	                  <div className="min-w-30">
                    <input
                      className="w-full rounded-xl border dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 px-3 py-2 font-mono text-sm text-end"
                      inputMode="decimal"
                      placeholder="0"
                      {...form.register(`lines.${idx}.debitAmount` as const)}
                      onChange={(e) => {
                        form.register(`lines.${idx}.debitAmount` as const).onChange(e);
                        if (e.target.value.trim() && Number(e.target.value) > 0) {
                          form.setValue(`lines.${idx}.creditAmount`, "");
                        }
                      }}
                    />
                  </div>
	                  <div className="min-w-30">
                    <input
                      className="w-full rounded-xl border dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 px-3 py-2 font-mono text-sm text-end"
                      inputMode="decimal"
                      placeholder="0"
                      {...form.register(`lines.${idx}.creditAmount` as const)}
                      onChange={(e) => {
                        form.register(`lines.${idx}.creditAmount` as const).onChange(e);
                        if (e.target.value.trim() && Number(e.target.value) > 0) {
                          form.setValue(`lines.${idx}.debitAmount`, "");
                        }
                      }}
                    />
                  </div>
		              	  <div className="min-w-50">
	              	    {(() => {
	              	      const reg = form.register(`lines.${idx}.description` as const);
	              	      return (
	              	        <textarea
	              	          rows={1}
	              	          className="w-full rounded-xl border dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 px-3 py-2 text-sm resize-none"
	              	          placeholder="Line note"
	              	          {...reg}
	              	          ref={(el) => {
	              	            reg.ref(el);
	              	            if (el) autoResizeTextarea(el, 3);
	              	          }}
	              	          onInput={(e) => autoResizeTextarea(e.currentTarget, 3)}
	              	        />
	              	      );
	              	    })()}
	              	  </div>
	                  <div className="min-w-14">
                    <button
                      type="button"
                      className="w-full rounded-xl border dark:border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 dark:text-zinc-300"
                      onClick={() => remove(idx)}
                      disabled={fields.length <= 2}
                      title={fields.length <= 2 ? "At least 2 lines required" : "Remove"}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {serverError ? <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 p-3 text-sm text-red-700 dark:text-red-400">{serverError}</div> : null}

      <div className="flex items-center gap-3">
        <button className="rounded-xl bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200" type="submit">
	          Save manual entry
        </button>
	        <div className="text-xs text-zinc-500 dark:text-zinc-400">Manual entry must be balanced (debit = credit).</div>
      </div>
    </form>
  );
}
