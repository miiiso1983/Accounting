"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

type CustomerOption = { id: string; name: string };
type ProductOption = { id: string; name: string; description: string | null; unitPrice: string; currencyCode: string };

type InvoiceData = {
  id: string;
  invoiceNumber: string;
  customerId: string;
  issueDate: string;
  dueDate: string;
  currencyCode: "IQD" | "USD";
  exchangeRate: string;
  discountType: string;
  discountValue: string;
  paymentTerms: string;
  lines: { description: string; quantity: string; unitPrice: string; taxRate: string }[];
};

type Props = {
  invoiceId: string;
  initialData: InvoiceData;
  customers: CustomerOption[];
  products: ProductOption[];
  baseCurrencyCode: "IQD" | "USD";
};

const LineSchema = z.object({
  description: z.string().min(1),
  quantity: z.string().min(1),
  unitPrice: z.string().min(1),
  taxRate: z.string().optional(),
});

const FormSchema = z.object({
  invoiceNumber: z.string().min(1),
  customerId: z.string().min(1),
  issueDate: z.string().min(1),
  dueDate: z.string().optional(),
  currencyCode: z.enum(["IQD", "USD"]),
  exchangeRate: z.string().optional(),
  discountType: z.enum(["PERCENTAGE", "FIXED"]).optional(),
  discountValue: z.string().optional(),
  paymentTerms: z.enum(["MONTHLY", "QUARTERLY", "YEARLY"]).optional(),
  lines: z.array(LineSchema).min(1),
});

const ApiOkSchema = z.object({ id: z.string().min(1) });
const ApiErrSchema = z.object({ error: z.string().min(1) });

type FormValues = z.infer<typeof FormSchema>;

export function InvoiceEditForm({ invoiceId, initialData, customers, products, baseCurrencyCode }: Props) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      invoiceNumber: initialData.invoiceNumber,
      customerId: initialData.customerId,
      issueDate: initialData.issueDate,
      dueDate: initialData.dueDate,
      currencyCode: initialData.currencyCode,
      exchangeRate: initialData.exchangeRate,
      discountType: (initialData.discountType as "PERCENTAGE" | "FIXED") || undefined,
      discountValue: initialData.discountValue || "",
      paymentTerms: (initialData.paymentTerms as "MONTHLY" | "QUARTERLY" | "YEARLY") || undefined,
      lines: initialData.lines,
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "lines" });
  const currencyCode = useWatch({ control: form.control, name: "currencyCode" });
  const showFx = currencyCode && currencyCode !== baseCurrencyCode;

  async function submit(values: FormValues) {
    setServerError(null);
    const payload = {
      ...values,
      exchangeRate: showFx ? { rate: values.exchangeRate } : undefined,
      discountType: values.discountValue && Number(values.discountValue) > 0 ? (values.discountType || "FIXED") : undefined,
      discountValue: values.discountValue && Number(values.discountValue) > 0 ? values.discountValue : undefined,
      paymentTerms: values.paymentTerms || undefined,
    };

    const res = await fetch(`/api/invoices/${invoiceId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data: unknown = await res.json();
    if (!res.ok) {
      const parsedErr = ApiErrSchema.safeParse(data);
      setServerError(parsedErr.success ? parsedErr.data.error : "Failed to update invoice");
      return;
    }

    const parsedOk = ApiOkSchema.safeParse(data);
    if (!parsedOk.success) {
      setServerError("Updated but no id returned");
      return;
    }

    router.push(`/app/invoices/${parsedOk.data.id}`);
    router.refresh();
  }

  return (
    <div className="grid gap-6">
      {serverError ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{serverError}</div> : null}

      <form className="grid gap-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-zinc-700">Invoice #</label>
            <input className="mt-1 w-full rounded-xl border px-3 py-2 font-mono" {...form.register("invoiceNumber")} />
          </div>
          <div>
            <label className="text-sm font-medium text-zinc-700">Customer</label>
            <select className="mt-1 w-full rounded-xl border px-3 py-2" {...form.register("customerId")}>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-zinc-700">Issue date</label>
            <input className="mt-1 w-full rounded-xl border px-3 py-2" type="date" {...form.register("issueDate")} />
          </div>
          <div>
            <label className="text-sm font-medium text-zinc-700">Due date</label>
            <input className="mt-1 w-full rounded-xl border px-3 py-2" type="date" {...form.register("dueDate")} />
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
            </div>
          ) : null}
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="text-sm font-medium text-zinc-700">Discount type / نوع الخصم</label>
            <select className="mt-1 w-full rounded-xl border px-3 py-2" {...form.register("discountType")}>
              <option value="">No discount / بدون خصم</option>
              <option value="PERCENTAGE">Percentage / نسبة مئوية (%)</option>
              <option value="FIXED">Fixed amount / مبلغ ثابت</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-zinc-700">Discount value / قيمة الخصم</label>
            <input className="mt-1 w-full rounded-xl border px-3 py-2 font-mono" inputMode="decimal" placeholder="0" {...form.register("discountValue")} />
          </div>
          <div>
            <label className="text-sm font-medium text-zinc-700">Payment terms / شروط الدفع</label>
            <select className="mt-1 w-full rounded-xl border px-3 py-2" {...form.register("paymentTerms")}>
              <option value="">— Select / اختر —</option>
              <option value="MONTHLY">Monthly / شهري</option>
              <option value="QUARTERLY">Quarterly / ربع سنوي</option>
              <option value="YEARLY">Yearly / سنوي</option>
            </select>
          </div>
        </div>

        <div className="rounded-2xl border p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm font-medium text-zinc-900">Line items</div>
            <button
              type="button"
              className="rounded-xl border px-3 py-2 text-sm hover:bg-zinc-50"
              onClick={() => append({ description: "", quantity: "1", unitPrice: "", taxRate: "" })}
            >
              Add line
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            {fields.map((f, idx) => (
              <div key={f.id} className="grid gap-3">
                {products.length > 0 && (
                  <div>
                    <select
                      className="w-full rounded-xl border px-3 py-2 text-sm text-zinc-600"
                      defaultValue=""
                      onChange={(e) => {
                        const prod = products.find((p) => p.id === e.target.value);
                        if (prod) {
                          form.setValue(`lines.${idx}.description`, prod.description || prod.name);
                          form.setValue(`lines.${idx}.unitPrice`, prod.unitPrice);
                        }
                      }}
                    >
                      <option value="">— Select product / اختر منتج —</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.unitPrice} {p.currencyCode})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="grid gap-3 md:grid-cols-12">
                  <div className="md:col-span-5">
                    <input className="w-full rounded-xl border px-3 py-2" placeholder="Description" {...form.register(`lines.${idx}.description` as const)} />
                  </div>
                  <div className="md:col-span-2">
                    <input className="w-full rounded-xl border px-3 py-2 font-mono" inputMode="decimal" placeholder="Qty" {...form.register(`lines.${idx}.quantity` as const)} />
                  </div>
                  <div className="md:col-span-3">
                    <input className="w-full rounded-xl border px-3 py-2 font-mono" inputMode="decimal" placeholder="Unit price" {...form.register(`lines.${idx}.unitPrice` as const)} />
                  </div>
                  <div className="md:col-span-1">
                    <input className="w-full rounded-xl border px-3 py-2 font-mono" inputMode="decimal" placeholder="Tax" {...form.register(`lines.${idx}.taxRate` as const)} />
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
              </div>
            ))}
          </div>

          <div className="mt-2 text-xs text-zinc-500">Tax rate example: 0.15 (15%). Leave blank for 0.</div>
        </div>

        <div className="flex items-center gap-3">
          <button
            className="rounded-xl bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800"
            type="button"
            onClick={form.handleSubmit((v) => submit(v))}
          >
            Save changes
          </button>
          <button
            className="rounded-xl border px-4 py-2 text-sm hover:bg-zinc-50"
            type="button"
            onClick={() => router.push(`/app/invoices/${invoiceId}`)}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

