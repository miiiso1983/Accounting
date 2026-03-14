"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { CustomerAutocompleteField } from "@/components/fields/CustomerAutocompleteField";

type CustomerOption = { id: string; name: string; companyName: string | null };
type ProductOption = { id: string; name: string; description: string | null; unitPrice: string; currencyCode: string; costCenterId: string | null };
type CostCenterOption = { id: string; code: string; name: string };

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
	lines: { description: string; costCenterId?: string; quantity: string; unitPrice: string; discountType?: string; discountValue?: string; taxRate: string }[];
};

type Props = {
  invoiceId: string;
  initialData: InvoiceData;
  customers: CustomerOption[];
  products: ProductOption[];
	costCenters: CostCenterOption[];
  baseCurrencyCode: "IQD" | "USD";
};

function calcLineTotal(qty: string, price: string, discType?: string, discVal?: string): number {
  const q = parseFloat(qty) || 0;
  const p = parseFloat(price) || 0;
  const gross = q * p;
  const dv = parseFloat(discVal ?? "") || 0;
  if (discType === "PERCENTAGE" && dv > 0) return gross - (gross * dv) / 100;
  if (discType === "FIXED" && dv > 0) return gross - dv;
  return gross;
}

function fmtNum(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

const LineSchema = z.object({
  description: z.string().min(1),
	costCenterId: z.string().optional(),
  quantity: z.string().min(1),
  unitPrice: z.string().min(1),
  discountType: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["PERCENTAGE", "FIXED"]).optional()),
  discountValue: z.string().optional(),
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

export function InvoiceEditForm({ invoiceId, initialData, customers: initialCustomers, products, costCenters, baseCurrencyCode }: Props) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [customers, setCustomers] = useState(initialCustomers);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustSaving, setNewCustSaving] = useState(false);

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
      lines: initialData.lines.map((l) => ({ ...l, discountType: l.discountType || "", discountValue: l.discountValue || "" })),
    },
  });

  const { errors, isSubmitting } = form.formState;

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "lines" });
  const currencyCode = useWatch({ control: form.control, name: "currencyCode" });
  const selectedCustomerId = useWatch({ control: form.control, name: "customerId" });
  const watchedLines = useWatch({ control: form.control, name: "lines" });
  const watchedDiscountType = useWatch({ control: form.control, name: "discountType" });
  const watchedDiscountValue = useWatch({ control: form.control, name: "discountValue" });
  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId) ?? null;
  const showFx = currencyCode && currencyCode !== baseCurrencyCode;

  // Real-time totals
  const totals = useMemo(() => {
    const lineTotals = (watchedLines ?? []).map((l) =>
      calcLineTotal(l.quantity ?? "0", l.unitPrice ?? "0", l.discountType as string | undefined, l.discountValue),
    );
    const subtotal = lineTotals.reduce((a, b) => a + b, 0);
    const dv = parseFloat(watchedDiscountValue ?? "") || 0;
    let discountAmount = 0;
    if (watchedDiscountType === "PERCENTAGE" && dv > 0) discountAmount = (subtotal * dv) / 100;
    else if (watchedDiscountType === "FIXED" && dv > 0) discountAmount = dv;
    const afterDiscount = subtotal - discountAmount;
    const taxTotal = (watchedLines ?? []).reduce((acc, l, i) => {
      const tr = parseFloat(l.taxRate ?? "") || 0;
      return acc + lineTotals[i] * tr;
    }, 0);
    const total = afterDiscount + taxTotal;
    return { lineTotals, subtotal, discountAmount, afterDiscount, taxTotal, total };
  }, [watchedLines, watchedDiscountType, watchedDiscountValue]);

  // Quick-add customer handler
  const handleAddCustomer = useCallback(async () => {
    if (!newCustName.trim()) return;
    setNewCustSaving(true);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: newCustName.trim(), phone: newCustPhone.trim() || undefined }),
      });
      const data = await res.json();
      if (res.ok && data.id) {
        const newCust: CustomerOption = { id: data.id, name: newCustName.trim(), companyName: null };
        setCustomers((prev) => [...prev, newCust].sort((a, b) => a.name.localeCompare(b.name)));
        form.setValue("customerId", data.id, { shouldDirty: true, shouldValidate: true });
        setShowNewCustomer(false);
        setNewCustName("");
        setNewCustPhone("");
      } else {
        setServerError(data.error || "Failed to create customer");
      }
    } catch {
      setServerError("Failed to create customer");
    } finally {
      setNewCustSaving(false);
    }
  }, [newCustName, newCustPhone, form]);

  async function submit(values: SubmitValues) {
    setServerError(null);
    const payload = {
      ...values,
      lines: values.lines.map((l) => ({
        ...l,
        discountType: l.discountValue && Number(l.discountValue) > 0 ? (l.discountType || "FIXED") : undefined,
        discountValue: l.discountValue && Number(l.discountValue) > 0 ? l.discountValue : undefined,
      })),
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
            <div className="flex items-start gap-2">
              <div className="flex-1">
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
              <button type="button" className="mt-1 rounded-xl border px-3 py-2 text-sm hover:bg-zinc-50" title="Add new customer" onClick={() => setShowNewCustomer(true)}>+</button>
            </div>
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
            <div className="text-sm font-medium text-zinc-900">Line items / بنود الفاتورة</div>
            <button
              type="button"
              className="rounded-xl border px-3 py-2 text-sm hover:bg-zinc-50"
              onClick={() => append({ description: "", costCenterId: "", quantity: "1", unitPrice: "", discountType: "", discountValue: "", taxRate: "" })}
            >
              Add line / إضافة بند
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            {fields.map((f, idx) => (
              <div key={f.id} className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-3 grid gap-3">
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
                          const ccId = prod.costCenterId && costCenters.some((cc) => cc.id === prod.costCenterId) ? prod.costCenterId : "";
                          form.setValue(`lines.${idx}.costCenterId`, ccId);
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
                <div className="grid gap-2 md:grid-cols-12">
                  <div className="md:col-span-3">
                    <input className="w-full rounded-xl border px-3 py-2 text-sm" placeholder="Description / الوصف" {...form.register(`lines.${idx}.description` as const)} />
                    {errors.lines?.[idx]?.description ? <div className="mt-1 text-xs text-red-600">Description is required.</div> : null}
                  </div>
                  <div className="md:col-span-2">
                    <select className="w-full rounded-xl border px-3 py-2 text-sm" {...form.register(`lines.${idx}.costCenterId` as const)}>
                      <option value="">— مركز كلفة —</option>
                      {costCenters.map((cc) => (
                        <option key={cc.id} value={cc.id}>
                          {cc.code} — {cc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-1">
                    <input className="w-full rounded-xl border px-3 py-2 font-mono text-sm" inputMode="decimal" placeholder="Qty" {...form.register(`lines.${idx}.quantity` as const)} />
                  </div>
                  <div className="md:col-span-1">
                    <input className="w-full rounded-xl border px-3 py-2 font-mono text-sm" inputMode="decimal" placeholder="Price" {...form.register(`lines.${idx}.unitPrice` as const)} />
                  </div>
                  <div className="md:col-span-1">
                    <select className="w-full rounded-xl border px-3 py-2 text-xs" {...form.register(`lines.${idx}.discountType` as const)}>
                      <option value="">خصم—</option>
                      <option value="PERCENTAGE">%</option>
                      <option value="FIXED">ثابت</option>
                    </select>
                  </div>
                  <div className="md:col-span-1">
                    <input className="w-full rounded-xl border px-3 py-2 font-mono text-sm" inputMode="decimal" placeholder="Disc" {...form.register(`lines.${idx}.discountValue` as const)} />
                  </div>
                  <div className="md:col-span-1">
                    <input className="w-full rounded-xl border px-3 py-2 font-mono text-sm" inputMode="decimal" placeholder="Tax" {...form.register(`lines.${idx}.taxRate` as const)} />
                  </div>
                  <div className="md:col-span-1 flex items-center">
                    <span className="font-mono text-sm font-medium text-zinc-900 w-full text-right">{fmtNum(totals.lineTotals[idx] ?? 0)}</span>
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

          <div className="mt-2 text-xs text-zinc-500">Tax rate example: 0.15 (15%). Leave blank for 0. / مثال ضريبة: 0.15 (15%)</div>
        </div>

        {/* Real-time totals summary */}
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
          <div className="text-sm font-medium text-sky-900 mb-3">Invoice Summary / ملخص الفاتورة</div>
          <div className="grid gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-600">Subtotal / المجموع الفرعي</span>
              <span className="font-mono font-medium">{fmtNum(totals.subtotal)} {currencyCode}</span>
            </div>
            {totals.discountAmount > 0 && (
              <div className="flex justify-between text-amber-700">
                <span>Discount / خصم {watchedDiscountType === "PERCENTAGE" ? `(${watchedDiscountValue}%)` : ""}</span>
                <span className="font-mono font-medium">-{fmtNum(totals.discountAmount)} {currencyCode}</span>
              </div>
            )}
            {totals.taxTotal > 0 && (
              <div className="flex justify-between">
                <span className="text-zinc-600">Tax / ضريبة</span>
                <span className="font-mono font-medium">{fmtNum(totals.taxTotal)} {currencyCode}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-sky-200 pt-2 text-base font-bold">
              <span className="text-sky-900">Net Total / الصافي</span>
              <span className="font-mono text-sky-700">{fmtNum(totals.total)} {currencyCode}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            className="rounded-xl bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800"
            type="button"
            onClick={form.handleSubmit((v) => submit(v), () => setServerError("Please complete the required invoice fields before saving."))}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Saving..." : "Save changes / حفظ التعديلات"}
          </button>
          <button
            className="rounded-xl border px-4 py-2 text-sm hover:bg-zinc-50"
            type="button"
            onClick={() => router.push(`/app/invoices/${invoiceId}`)}
          >
            Cancel / إلغاء
          </button>
        </div>
      </form>

      {/* New Customer Modal */}
      {showNewCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-lg">
            <div className="text-base font-medium text-zinc-900 mb-4">Add New Customer / إضافة زبون جديد</div>
            <div className="grid gap-3">
              <div>
                <label className="text-sm font-medium text-zinc-700">Name / الاسم *</label>
                <input className="mt-1 w-full rounded-xl border px-3 py-2" value={newCustName} onChange={(e) => setNewCustName(e.target.value)} placeholder="Customer name" autoFocus />
              </div>
              <div>
                <label className="text-sm font-medium text-zinc-700">Phone / الهاتف</label>
                <input className="mt-1 w-full rounded-xl border px-3 py-2" value={newCustPhone} onChange={(e) => setNewCustPhone(e.target.value)} placeholder="Phone number" />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button type="button" className="rounded-xl bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800" onClick={handleAddCustomer} disabled={newCustSaving || !newCustName.trim()}>
                {newCustSaving ? "Saving..." : "Save / حفظ"}
              </button>
              <button type="button" className="rounded-xl border px-4 py-2 text-sm hover:bg-zinc-50" onClick={() => setShowNewCustomer(false)}>
                Cancel / إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

