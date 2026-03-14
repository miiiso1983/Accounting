"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { CustomerAutocompleteField } from "@/components/fields/CustomerAutocompleteField";

type CustomerOption = { id: string; name: string; companyName: string | null };
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

const OptionalDiscountTypeSchema = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.enum(["PERCENTAGE", "FIXED"]).optional(),
);

const OptionalPaymentTermsSchema = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.enum(["MONTHLY", "QUARTERLY", "YEARLY"]).optional(),
);

const FormSchema = z.object({
  invoiceNumber: z.string().min(1),
  customerId: z.string().min(1),
  issueDate: z.string().min(1),
  dueDate: z.string().optional(),
  currencyCode: z.enum(["IQD", "USD"]),
  exchangeRate: z.string().optional(),
  discountType: OptionalDiscountTypeSchema,
  discountValue: z.string().optional(),
  paymentTerms: OptionalPaymentTermsSchema,
  lines: z.array(LineSchema).min(1),
});

const ApiOkSchema = z.object({ id: z.string().min(1) });
const ApiErrSchema = z.object({ error: z.string().min(1) });

type FormValues = z.input<typeof FormSchema>;
type SubmitValues = z.output<typeof FormSchema>;

async function readResponseData(res: Response) {
  const text = await res.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export function InvoiceEditForm({ invoiceId, initialData, customers, products, baseCurrencyCode }: Props) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<FormValues, undefined, SubmitValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      invoiceNumber: initialData.invoiceNumber,
      customerId: initialData.customerId,
      issueDate: initialData.issueDate,
      dueDate: initialData.dueDate,
      currencyCode: initialData.currencyCode,
      exchangeRate: initialData.exchangeRate,
      discountType: initialData.discountType || "",
      discountValue: initialData.discountValue || "",
      paymentTerms: initialData.paymentTerms || "",
      lines: initialData.lines,
    },
  });

  const { errors, isSubmitting } = form.formState;

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "lines" });
  const currencyCode = useWatch({ control: form.control, name: "currencyCode" });
  const selectedCustomerId = useWatch({ control: form.control, name: "customerId" });
  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId) ?? null;
  const showFx = currencyCode && currencyCode !== baseCurrencyCode;

  async function submit(values: SubmitValues) {
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

    const data = await readResponseData(res);
    if (!res.ok) {
      const parsedErr = ApiErrSchema.safeParse(data);
      setServerError(parsedErr.success ? parsedErr.data.error : `Failed to update invoice (HTTP ${res.status})`);
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
            {errors.invoiceNumber ? <div className="mt-1 text-xs text-red-600">Invoice number is required.</div> : null}
          </div>
          <div>
            <label className="text-sm font-medium text-zinc-700">Customer</label>
	            <input type="hidden" {...form.register("customerId")} />
	            <CustomerAutocompleteField
	              customers={customers}
	              defaultCustomerId={initialData.customerId}
	              placeholder="Search customer / ابحث عن زبون"
	              noResultsLabel="No customers found / لا يوجد زبائن"
	              clearLabel="Clear"
	              disabled={customers.length === 0}
	              onSelectedIdChange={(id) => form.setValue("customerId", id, { shouldDirty: true, shouldValidate: true })}
	            />
          </div>
          <div>
            <label className="text-sm font-medium text-zinc-700">Company name / اسم الشركة</label>
            <input
              className="mt-1 w-full rounded-xl border bg-zinc-50 px-3 py-2 text-zinc-700"
              value={selectedCustomer?.companyName ?? ""}
              placeholder="Will appear automatically / يظهر تلقائيًا"
              readOnly
            />
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
                    {errors.lines?.[idx]?.description ? <div className="mt-1 text-xs text-red-600">Description is required.</div> : null}
                  </div>
                  <div className="md:col-span-2">
                    <input className="w-full rounded-xl border px-3 py-2 font-mono" inputMode="decimal" placeholder="Qty" {...form.register(`lines.${idx}.quantity` as const)} />
                    {errors.lines?.[idx]?.quantity ? <div className="mt-1 text-xs text-red-600">Qty is required.</div> : null}
                  </div>
                  <div className="md:col-span-3">
                    <input className="w-full rounded-xl border px-3 py-2 font-mono" inputMode="decimal" placeholder="Unit price" {...form.register(`lines.${idx}.unitPrice` as const)} />
                    {errors.lines?.[idx]?.unitPrice ? <div className="mt-1 text-xs text-red-600">Unit price is required.</div> : null}
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
            onClick={form.handleSubmit((v) => submit(v), () => setServerError("Please complete the required invoice fields before saving."))}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Saving..." : "Save changes"}
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

