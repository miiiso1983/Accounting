"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { MAX_EXPENSE_ATTACHMENTS } from "@/lib/attachments/constants";

type AccountOption = { id: string; code: string; name: string };
type ProductOption = { id: string; name: string; costCenterId: string | null };
type CostCenterOption = { id: string; code: string; name: string };
type Props = {
  expenseAccounts: AccountOption[];
  paymentAccounts: AccountOption[];
  products: ProductOption[];
  costCenters: CostCenterOption[];
  baseCurrencyCode: "IQD" | "USD";
};

const LineSchema = z.object({
  accountId: z.string().min(1, "Account required"),
  costCenterId: z.string().optional(),
  description: z.string().optional(),
  amount: z.string().min(1, "Amount required"),
});

const FormSchema = z.object({
  expenseDate: z.string().min(1),
  vendorName: z.string().optional(),
  description: z.string().optional(),
  productId: z.string().optional(),
  costCenterId: z.string().optional(),
  creditAccountId: z.string().min(1),
  currencyCode: z.enum(["IQD", "USD"]),
  exchangeRate: z.string().optional(),
  lineItems: z.array(LineSchema).min(1),
});

const ApiOkSchema = z.object({ id: z.string().min(1) });
const ApiErrSchema = z.object({ error: z.string().min(1) });

type FormValues = z.infer<typeof FormSchema>;

function fmtNum(n: number) {
  if (!Number.isFinite(n) || n === 0) return "";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function ExpenseForm({ expenseAccounts, paymentAccounts, products, costCenters, baseCurrencyCode }: Props) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const defaultExpenseAccountId = expenseAccounts[0]?.id ?? "";
  const defaultPaymentAccountId = paymentAccounts[0]?.id ?? "";

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      expenseDate: today,
      vendorName: "",
      description: "",
      productId: "",
      costCenterId: "",
      creditAccountId: defaultPaymentAccountId,
      currencyCode: baseCurrencyCode,
      exchangeRate: "",
      lineItems: [{ accountId: defaultExpenseAccountId, costCenterId: "", description: "", amount: "" }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "lineItems" });
  const currencyCode = useWatch({ control: form.control, name: "currencyCode" });
  const lineItems = useWatch({ control: form.control, name: "lineItems" });
  const showFx = currencyCode && currencyCode !== baseCurrencyCode;

  const grandTotal = useMemo(() => {
    return (lineItems || []).reduce((s, l) => s + (Number(l.amount) || 0), 0);
  }, [lineItems]);

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
    payload.set("expenseDate", values.expenseDate);
    payload.set("vendorName", values.vendorName || "");
    payload.set("description", values.description || "");
    payload.set("productId", values.productId || "");
    payload.set("costCenterId", values.costCenterId || "");
    payload.set("creditAccountId", values.creditAccountId);
    payload.set("currencyCode", values.currencyCode);
    if (showFx && values.exchangeRate) {
      payload.set("exchangeRate", values.exchangeRate);
    }
    payload.set("lineItems", JSON.stringify(values.lineItems));
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
        {/* ── HEADER ── */}
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="text-sm font-medium text-zinc-700">Date / التاريخ</label>
            <input className="mt-1 w-full rounded-xl border px-3 py-2" type="date" {...form.register("expenseDate")} />
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-700">Vendor / المورد</label>
            <input className="mt-1 w-full rounded-xl border px-3 py-2" placeholder="Vendor name" {...form.register("vendorName")} />
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-700">Payment Account / حساب الدفع</label>
            <select className="mt-1 w-full rounded-xl border px-3 py-2" {...form.register("creditAccountId")}>
              {paymentAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
              ))}
            </select>
            <div className="mt-1 text-xs text-zinc-500">Cash/bank for paid, 2100 for AP.</div>
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-700">Currency / العملة</label>
            <select className="mt-1 w-full rounded-xl border px-3 py-2" {...form.register("currencyCode")}>
              <option value="IQD">IQD</option>
              <option value="USD">USD</option>
            </select>
          </div>

          {showFx ? (
            <div>
              <label className="text-sm font-medium text-zinc-700">Exchange rate / سعر الصرف</label>
              <div className="mt-1 flex items-center gap-2">
                <div className="text-sm text-zinc-600">1 {currencyCode} =</div>
                <input className="w-40 rounded-xl border px-3 py-2" placeholder="e.g. 1300" {...form.register("exchangeRate")} />
                <div className="text-sm text-zinc-600">{baseCurrencyCode}</div>
              </div>
              {form.formState.errors.exchangeRate?.message ? (
                <div className="mt-1 text-xs text-red-700">{form.formState.errors.exchangeRate.message}</div>
              ) : null}
            </div>
          ) : null}

          {products.length > 0 ? (
            <div>
              <label className="text-sm font-medium text-zinc-700">Product / المنتج</label>
              {(() => {
                const r = form.register("productId");
                return (
                  <select className="mt-1 w-full rounded-xl border px-3 py-2" defaultValue="" {...r}
                    onChange={(e) => {
                      r.onChange(e);
                      const prod = products.find((p) => p.id === e.target.value);
                      const ccId = prod?.costCenterId && costCenters.some((cc) => cc.id === prod.costCenterId) ? prod.costCenterId : "";
                      form.setValue("costCenterId", ccId);
                    }}
                  >
                    <option value="">— None / بدون —</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                );
              })()}
            </div>
          ) : null}

          <div className="md:col-span-3">
            <label className="text-sm font-medium text-zinc-700">Description / الوصف</label>
            <input className="mt-1 w-full rounded-xl border px-3 py-2" placeholder="Optional notes" {...form.register("description")} />
          </div>
        </div>

        {/* ── LINE ITEMS TABLE ── */}
        <div className="rounded-2xl border p-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-zinc-900">Line Items / البنود</div>
            <button
              type="button"
              className="rounded-xl border px-3 py-2 text-sm hover:bg-zinc-50"
              onClick={() => append({ accountId: defaultExpenseAccountId, costCenterId: "", description: "", amount: "" })}
            >
              + Add line / إضافة سطر
            </button>
          </div>

          <div className="mt-3 hidden md:grid md:grid-cols-12 gap-2 px-1 text-xs font-semibold text-zinc-500">
            <div className="md:col-span-3">Account / الحساب</div>
            <div className="md:col-span-3">Cost Center / مركز كلفة</div>
            <div className="md:col-span-3">Description / ملاحظة</div>
            <div className="md:col-span-2 text-right">Amount / المبلغ</div>
            <div className="md:col-span-1"></div>
          </div>

          <div className="mt-2 space-y-2">
            {fields.map((f, idx) => (
              <div key={f.id} className="grid gap-2 md:grid-cols-12 items-start">
                <div className="md:col-span-3">
                  <select className="w-full rounded-xl border px-3 py-2 text-sm" {...form.register(`lineItems.${idx}.accountId` as const)}>
                    <option value="">Select account…</option>
                    {expenseAccounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-3">
                  <select className="w-full rounded-xl border px-3 py-2 text-sm" {...form.register(`lineItems.${idx}.costCenterId` as const)}>
                    <option value="">— None —</option>
                    {costCenters.map((cc) => (
                      <option key={cc.id} value={cc.id}>{cc.code} — {cc.name}</option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-3">
                  <input className="w-full rounded-xl border px-3 py-2 text-sm" placeholder="Line note" {...form.register(`lineItems.${idx}.description` as const)} />
                </div>
                <div className="md:col-span-2">
                  <input
                    className="w-full rounded-xl border px-3 py-2 font-mono text-right text-sm"
                    inputMode="decimal"
                    placeholder="0"
                    {...form.register(`lineItems.${idx}.amount` as const)}
                  />
                </div>
                <div className="md:col-span-1">
                  <button
                    type="button"
                    className="w-full rounded-xl border px-3 py-2 text-sm hover:bg-zinc-50"
                    onClick={() => remove(idx)}
                    disabled={fields.length <= 1}
                    title={fields.length <= 1 ? "At least 1 line required" : "Remove"}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Total row */}
          <div className="mt-3 flex justify-end border-t pt-2">
            <div className="text-sm font-semibold text-zinc-900">
              Total / المجموع: <span className="font-mono">{fmtNum(grandTotal) || "0"}</span> {currencyCode}
            </div>
          </div>
        </div>

        {/* ── ATTACHMENTS ── */}
        <div>
          <label className="text-sm font-medium text-zinc-700">Attachments / المرفقات</label>
          <input
            className="mt-1 block w-full rounded-xl border px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-3 file:py-2 file:text-white"
            type="file"
            multiple
            onChange={(event) => setAttachments(Array.from(event.target.files ?? []))}
          />
          <div className="mt-1 text-xs text-zinc-500">Optional. Up to {MAX_EXPENSE_ATTACHMENTS} files, 10 MB each.</div>

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

        <div className="flex items-center gap-3">
          <button
            className="rounded-xl bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800"
            type="submit"
            disabled={expenseAccounts.length === 0 || paymentAccounts.length === 0}
          >
            Save & post / حفظ ونشر
          </button>
        </div>
      </form>
    </div>
  );
}
