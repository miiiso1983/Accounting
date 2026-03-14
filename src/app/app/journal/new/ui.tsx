"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

type AccountOption = { id: string; code: string; name: string };
type CostCenterOption = { id: string; code: string; name: string };
type Props = { accounts: AccountOption[]; costCenters: CostCenterOption[]; baseCurrencyCode: "IQD" | "USD" };

const LineSchema = z.object({
  accountId: z.string().min(1),
  dc: z.enum(["DEBIT", "CREDIT"]),
  costCenterId: z.string().optional(),
  amount: z.string().min(1),
  description: z.string().optional(),
});

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

export function JournalEntryForm({ accounts, costCenters, baseCurrencyCode }: Props) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      entryDate: today,
      currencyCode: baseCurrencyCode,
      lines: [
        { dc: "DEBIT", accountId: "", costCenterId: "", amount: "", description: "" },
        { dc: "CREDIT", accountId: "", costCenterId: "", amount: "", description: "" },
      ],
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
      lines: values.lines.map((l) => ({
        ...l,
        costCenterId: l.costCenterId?.trim() ? l.costCenterId.trim() : undefined,
      })),
    };

    const res = await fetch("/api/journal-entries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data: unknown = await res.json();
    if (!res.ok) {
      const parsedErr = ApiErrSchema.safeParse(data);
      setServerError(parsedErr.success ? parsedErr.data.error : "Failed to create entry");
      return;
    }

    const parsedOk = ApiOkSchema.safeParse(data);
    if (!parsedOk.success) {
      setServerError("Created but no id returned");
      return;
    }

    const id = parsedOk.data.id;

    router.push(`/app/journal/${id}`);
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
          <div className="mt-1 text-xs text-zinc-500">Base currency: {baseCurrencyCode}</div>
        </div>
      </div>

      {showFx ? (
        <div>
          <label className="text-sm font-medium text-zinc-700">Exchange rate</label>
          <div className="mt-1 flex items-center gap-2">
            <div className="text-sm text-zinc-600">1 {currencyCode} =</div>
            <input
              className="w-40 rounded-xl border px-3 py-2"
              placeholder="e.g. 1300"
              {...form.register("exchangeRate")}
            />
            <div className="text-sm text-zinc-600">{baseCurrencyCode}</div>
          </div>
          <div className="mt-1 text-xs text-zinc-500">We store it as: 1 {currencyCode} = rate {baseCurrencyCode}</div>
        </div>
      ) : null}

      <div>
        <label className="text-sm font-medium text-zinc-700">Description</label>
        <input className="mt-1 w-full rounded-xl border px-3 py-2" placeholder="Memo" {...form.register("description")} />
      </div>

      <div className="rounded-2xl border p-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-zinc-900">Lines</div>
          <button
            type="button"
            className="rounded-xl border px-3 py-2 text-sm hover:bg-zinc-50"
            onClick={() => append({ dc: "DEBIT", accountId: "", costCenterId: "", amount: "", description: "" })}
          >
            Add line
          </button>
        </div>

        <div className="mt-3 space-y-2">
          {fields.map((f, idx) => (
            <div key={f.id} className="grid gap-2 md:grid-cols-12">
              <div className="md:col-span-2">
                <select className="w-full rounded-xl border px-3 py-2" {...form.register(`lines.${idx}.dc` as const)}>
                  <option value="DEBIT">DEBIT</option>
                  <option value="CREDIT">CREDIT</option>
                </select>
              </div>
              <div className="md:col-span-4">
                <select className="w-full rounded-xl border px-3 py-2" {...form.register(`lines.${idx}.accountId` as const)}>
                  <option value="">Select account…</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-3">
                <select className="w-full rounded-xl border px-3 py-2" {...form.register(`lines.${idx}.costCenterId` as const)}>
                  <option value="">— Cost Center / مركز كلفة —</option>
                  {costCenters.map((cc) => (
                    <option key={cc.id} value={cc.id}>
                      {cc.code} — {cc.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <input
                  className="w-full rounded-xl border px-3 py-2 font-mono"
                  inputMode="decimal"
                  placeholder="0"
                  {...form.register(`lines.${idx}.amount` as const)}
                />
              </div>
              <div className="md:col-span-1">
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
					<div className="md:col-span-12">
						<input
							className="w-full rounded-xl border px-3 py-2"
							placeholder="Line note"
							{...form.register(`lines.${idx}.description` as const)}
						/>
					</div>
            </div>
          ))}
        </div>
      </div>

      {serverError ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{serverError}</div> : null}

      <div className="flex items-center gap-3">
        <button className="rounded-xl bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800" type="submit">
          Post entry
        </button>
        <div className="text-xs text-zinc-500">Server will reject if not balanced (base currency).</div>
      </div>
    </form>
  );
}
