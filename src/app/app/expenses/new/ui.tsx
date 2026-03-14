"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { MAX_EXPENSE_ATTACHMENTS } from "@/lib/attachments/constants";

type AccountOption = { id: string; code: string; name: string };
type ProductOption = { id: string; name: string };
type Props = {
  expenseAccounts: AccountOption[];
  paymentAccounts: AccountOption[];
  products: ProductOption[];
  baseCurrencyCode: "IQD" | "USD";
};

const FormSchema = z.object({
  expenseNumber: z.string().optional(),
  expenseDate: z.string().min(1),
  vendorName: z.string().optional(),
  description: z.string().optional(),
  productId: z.string().optional(),
  expenseAccountId: z.string().min(1),
  creditAccountId: z.string().min(1),
  currencyCode: z.enum(["IQD", "USD"]),
  exchangeRate: z.string().optional(),
  total: z.string().min(1),
});

const ApiOkSchema = z.object({ id: z.string().min(1) });
const ApiErrSchema = z.object({ error: z.string().min(1) });

type FormValues = z.infer<typeof FormSchema>;

export function ExpenseForm({ expenseAccounts, paymentAccounts, products, baseCurrencyCode }: Props) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const defaultExpenseAccountId = expenseAccounts[0]?.id ?? "";
  const defaultPaymentAccountId = paymentAccounts[0]?.id ?? "";

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      expenseNumber: "",
      expenseDate: today,
      vendorName: "",
      description: "",
      productId: "",
      expenseAccountId: defaultExpenseAccountId,
      creditAccountId: defaultPaymentAccountId,
      currencyCode: baseCurrencyCode,
      exchangeRate: "",
      total: "",
    },
  });

  const currencyCode = useWatch({ control: form.control, name: "currencyCode" });
  const showFx = currencyCode && currencyCode !== baseCurrencyCode;

  async function submit(values: FormValues) {
    setServerError(null);

    if (showFx && !values.exchangeRate?.trim()) {
      form.setError("exchangeRate", { type: "manual", message: "Exchange rate is required" });
      return;
    }

    if (attachments.length > MAX_EXPENSE_ATTACHMENTS) {
      setServerError(`You can upload up to ${MAX_EXPENSE_ATTACHMENTS} attachments`);
      return;
    }

    const payload = new FormData();
    payload.set("expenseNumber", values.expenseNumber || "");
    payload.set("expenseDate", values.expenseDate);
    payload.set("vendorName", values.vendorName || "");
    payload.set("description", values.description || "");
    payload.set("productId", values.productId || "");
    payload.set("expenseAccountId", values.expenseAccountId);
    payload.set("creditAccountId", values.creditAccountId);
    payload.set("currencyCode", values.currencyCode);
    payload.set("total", values.total);
    if (showFx && values.exchangeRate) {
      payload.set("exchangeRate", values.exchangeRate);
    }
    attachments.forEach((file) => payload.append("attachments", file));

    const res = await fetch("/api/expenses", {
      method: "POST",
      body: payload,
    });

    const data: unknown = await res.json();
    if (!res.ok) {
      const parsedErr = ApiErrSchema.safeParse(data);
      setServerError(parsedErr.success ? parsedErr.data.error : "Failed to create expense");
      return;
    }

    const parsedOk = ApiOkSchema.safeParse(data);
    if (!parsedOk.success) {
      setServerError("Created but no id returned");
      return;
    }

    router.push(`/app/expenses/${parsedOk.data.id}`);
    router.refresh();
  }

  return (
    <div className="grid gap-6">
      {serverError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{serverError}</div>
      ) : null}

      <form className="grid gap-4" onSubmit={form.handleSubmit((v) => submit(v))}>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-zinc-700">Expense #</label>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2 font-mono"
              placeholder="EXP-0001"
              {...form.register("expenseNumber")}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-700">Date</label>
            <input className="mt-1 w-full rounded-xl border px-3 py-2" type="date" {...form.register("expenseDate")} />
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-700">Vendor</label>
            <input className="mt-1 w-full rounded-xl border px-3 py-2" placeholder="Vendor name" {...form.register("vendorName")} />
          </div>

          {products.length > 0 ? (
            <div>
              <label className="text-sm font-medium text-zinc-700">Product</label>
              <select className="mt-1 w-full rounded-xl border px-3 py-2" {...form.register("productId")} defaultValue="">
                <option value="">— None / بدون —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <div className="mt-1 text-xs text-zinc-500">Optional: link this expense to a product/item.</div>
            </div>
          ) : null}

          <div>
            <label className="text-sm font-medium text-zinc-700">Category (expense account)</label>
            <select className="mt-1 w-full rounded-xl border px-3 py-2" {...form.register("expenseAccountId")}>
              {expenseAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-700">Paid / posted against</label>
            <select className="mt-1 w-full rounded-xl border px-3 py-2" {...form.register("creditAccountId")}>
              {paymentAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.name}
                </option>
              ))}
            </select>
            <div className="mt-1 text-xs text-zinc-500">
              Use 2100 for Accounts Payable (unpaid). Use cash/bank accounts for paid expenses.
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-700">Total</label>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2 font-mono"
              inputMode="decimal"
              placeholder="0"
              {...form.register("total")}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-700">Currency</label>
            <select className="mt-1 w-full rounded-xl border px-3 py-2" {...form.register("currencyCode")}>
              <option value="IQD">IQD</option>
              <option value="USD">USD</option>
            </select>
          </div>

          {showFx ? (
            <div>
              <label className="text-sm font-medium text-zinc-700">Exchange rate</label>
              <div className="mt-1 flex items-center gap-2">
                <div className="text-sm text-zinc-600">1 {currencyCode} =</div>
                <input className="w-40 rounded-xl border px-3 py-2" placeholder="e.g. 1300" {...form.register("exchangeRate")} />
                <div className="text-sm text-zinc-600">{baseCurrencyCode}</div>
              </div>
              {form.formState.errors.exchangeRate?.message ? (
                <div className="mt-1 text-xs text-red-700">{form.formState.errors.exchangeRate.message}</div>
              ) : (
                <div className="mt-1 text-xs text-zinc-500">We store it as: 1 {currencyCode} = rate {baseCurrencyCode}</div>
              )}
            </div>
          ) : null}

          <div className="md:col-span-2">
            <label className="text-sm font-medium text-zinc-700">Description</label>
            <textarea
              className="mt-1 w-full rounded-xl border px-3 py-2"
              rows={3}
              placeholder="Optional notes"
              {...form.register("description")}
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-sm font-medium text-zinc-700">Attachments</label>
            <input
              className="mt-1 block w-full rounded-xl border px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-3 file:py-2 file:text-white"
              type="file"
              multiple
              onChange={(event) => setAttachments(Array.from(event.target.files ?? []))}
            />
            <div className="mt-1 text-xs text-zinc-500">
              Optional. Up to {MAX_EXPENSE_ATTACHMENTS} files, 10 MB each.
            </div>

            {attachments.length > 0 ? (
              <div className="mt-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
                <div className="font-medium text-zinc-800">Selected files</div>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {attachments.map((file) => (
                    <li key={`${file.name}-${file.size}-${file.lastModified}`}>{file.name}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            className="rounded-xl bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800"
            type="submit"
            disabled={expenseAccounts.length === 0 || paymentAccounts.length === 0}
          >
            Save & post
          </button>
        </div>
      </form>
    </div>
  );
}
