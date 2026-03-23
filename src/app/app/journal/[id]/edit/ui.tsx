"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

type AccountOption = { id: string; code: string; name: string };
type CostCenterOption = { id: string; code: string; name: string };

type InitialData = {
  id: string;
  entryDate: string;
  description: string;
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
  currencyCode: z.enum(["IQD", "USD"]).optional(),
  exchangeRate: z.string().optional(),
  lines: z.array(LineSchema).min(2),
});

const ApiOkSchema = z.object({ id: z.string().min(1) });
const ApiErrSchema = z.object({ error: z.string().min(1) });

type FormValues = z.infer<typeof FormSchema>;

export function JournalEntryEditForm({ entryId, initialData, accounts, costCenters, baseCurrencyCode }: Props) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      entryDate: initialData.entryDate,
      description: initialData.description,
      currencyCode: initialData.currencyCode,
      lines: initialData.lines,
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "lines" });

  const currencyCode = useWatch({ control: form.control, name: "currencyCode" });
  const showFx = currencyCode && currencyCode !== baseCurrencyCode;

  async function onSubmit(values: FormValues) {
    setServerError(null);
    const payload = {
      entryDate: values.entryDate,
      description: values.description,
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
    <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="text-sm font-medium text-zinc-700">Entry date</label>
          <input className="mt-1 w-full rounded-xl border px-3 py-2" type="date" {...form.register("entryDate")} />
        </div>
        <div>
          <label className="text-sm font-medium text-zinc-700">Currency</label>
          <select className="mt-1 w-full rounded-xl border px-3 py-2" {...form.register("currencyCode")}>
            <option value={baseCurrencyCode}>{baseCurrencyCode}</option>
            {baseCurrencyCode === "IQD" ? <option value="USD">USD</option> : <option value="IQD">IQD</option>}
          </select>
        </div>
      </div>

      {showFx ? (
        <div>
          <label className="text-sm font-medium text-zinc-700">Exchange rate</label>
          <div className="mt-1 flex items-center gap-2">
            <div className="text-sm text-zinc-600">1 {currencyCode} =</div>
            <input className="w-40 rounded-xl border px-3 py-2" placeholder="e.g. 1300" {...form.register("exchangeRate")} />
            <div className="text-sm text-zinc-600">{baseCurrencyCode}</div>
          </div>
        </div>
      ) : null}

      <div>
        <label className="text-sm font-medium text-zinc-700">Description</label>
        <input className="mt-1 w-full rounded-xl border px-3 py-2" placeholder="Memo" {...form.register("description")} />
      </div>

      <div className="rounded-2xl border p-4 md:p-5">
        <div className="flex items-center justify-between gap-4 mb-3">
          <div className="text-sm font-medium text-zinc-900">Lines / البنود</div>
          <button
            type="button"
            className="shrink-0 rounded-xl border px-3 py-2 text-sm hover:bg-zinc-50"
            onClick={() => append({ accountId: "", costCenterId: "", debitAmount: "", creditAmount: "", description: "" })}
          >
            Add line / إضافة بند
          </button>
        </div>

        <div className="-mx-4 md:-mx-5 overflow-x-auto px-4 md:px-5">
          <div style={{ minWidth: 740 }}>
            {/* Column headers */}
            <div className="grid grid-cols-12 gap-2 px-1 pb-2 border-b border-zinc-200 text-xs font-semibold text-zinc-500">
              <div className="col-span-3">Account / الحساب</div>
              <div className="col-span-2">Cost Center / مركز كلفة</div>
              <div className="col-span-2 text-end">Debit / مدين</div>
              <div className="col-span-2 text-end">Credit / دائن</div>
              <div className="col-span-2">Note / ملاحظة</div>
              <div className="col-span-1"></div>
            </div>

            <div className="mt-2 space-y-2">
              {fields.map((f, idx) => (
                <div key={f.id} className="grid grid-cols-12 gap-2 items-start">
                  <div className="col-span-3">
                    <select className="w-full rounded-xl border px-3 py-2 text-sm" {...form.register(`lines.${idx}.accountId` as const)}>
                      <option value="">Select account…</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <select className="w-full rounded-xl border px-3 py-2 text-sm" {...form.register(`lines.${idx}.costCenterId` as const)}>
                      <option value="">— None —</option>
                      {costCenters.map((cc) => (
                        <option key={cc.id} value={cc.id}>{cc.code} — {cc.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <input
                      className="w-full rounded-xl border px-3 py-2 font-mono text-sm text-end"
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
                  <div className="col-span-2">
                    <input
                      className="w-full rounded-xl border px-3 py-2 font-mono text-sm text-end"
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
                  <div className="col-span-2">
                    <input className="w-full rounded-xl border px-3 py-2 text-sm" placeholder="Line note" {...form.register(`lines.${idx}.description` as const)} />
                  </div>
                  <div className="col-span-1">
                    <button
                      type="button"
                      className="w-full rounded-xl border px-3 py-2 text-sm hover:bg-zinc-50"
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

      {serverError ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{serverError}</div> : null}

      <div className="flex items-center gap-3">
        <button className="rounded-xl bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800" type="submit">
	          Save manual entry
        </button>
	        <div className="text-xs text-zinc-500">Manual entry must be balanced (debit = credit).</div>
      </div>
    </form>
  );
}
