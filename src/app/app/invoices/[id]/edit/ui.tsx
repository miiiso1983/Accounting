"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { CustomerAutocompleteField } from "@/components/fields/CustomerAutocompleteField";
import { InvoiceLineItemsGrid } from "@/components/invoice/InvoiceLineItemsGrid";

type CustomerOption = { id: string; name: string; companyName: string | null };
type ProductOption = { id: string; name: string; description: string | null; unitPrice: string; currencyCode: string; costCenterId: string | null };
type CostCenterOption = { id: string; code: string; name: string };
type SalesRepOption = { id: string; name: string };
type BranchOption = { id: string; code: string; name: string; isActive?: boolean };

type InvoiceData = {
  id: string;
  invoiceNumber: string;
  customerId: string;
  branchId: string;
  issueDate: string;
  dueDate: string;
  currencyCode: "IQD" | "USD";
  exchangeRate: string;
  discountType: string;
  discountValue: string;
  paymentTerms: string;
  salesRepresentativeId: string;
	lines: { description: string; costCenterId?: string; quantity: string; unitPrice: string; discountType?: string; discountValue?: string; taxRate: string }[];
};

type Props = {
  invoiceId: string;
  initialData: InvoiceData;
  customers: CustomerOption[];
  products: ProductOption[];
	costCenters: CostCenterOption[];
	salesReps: SalesRepOption[];
	branches: BranchOption[];
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
  branchId: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
  issueDate: z.string().min(1),
  dueDate: z.string().optional(),
  currencyCode: z.enum(["IQD", "USD"]),
  exchangeRate: z.string().optional(),
  discountType: OptionalDiscountTypeSchema,
  discountValue: z.string().optional(),
  paymentTerms: OptionalPaymentTermsSchema,
  salesRepresentativeId: z.string().optional(),
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

export function InvoiceEditForm({ invoiceId, initialData, customers: initialCustomers, products, costCenters, salesReps, branches, baseCurrencyCode }: Props) {
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
      branchId: initialData.branchId,
      issueDate: initialData.issueDate,
      dueDate: initialData.dueDate,
      currencyCode: initialData.currencyCode,
      exchangeRate: initialData.exchangeRate,
      discountType: initialData.discountType || "",
      discountValue: initialData.discountValue || "",
      paymentTerms: initialData.paymentTerms || "",
      salesRepresentativeId: initialData.salesRepresentativeId || "",
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
      branchId: values.branchId ?? "",
      lines: values.lines.map((l) => ({
        ...l,
        discountType: l.discountValue && Number(l.discountValue) > 0 ? (l.discountType || "FIXED") : undefined,
        discountValue: l.discountValue && Number(l.discountValue) > 0 ? l.discountValue : undefined,
      })),
      exchangeRate: showFx ? { rate: values.exchangeRate } : undefined,
      discountType: values.discountValue && Number(values.discountValue) > 0 ? (values.discountType || "FIXED") : undefined,
      discountValue: values.discountValue && Number(values.discountValue) > 0 ? values.discountValue : undefined,
      paymentTerms: values.paymentTerms || undefined,
      salesRepresentativeId: values.salesRepresentativeId || undefined,
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
    <div className="grid gap-6 max-w-full box-border">
      {serverError ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{serverError}</div> : null}

      <form className="grid gap-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-zinc-700">Invoice # / رقم الفاتورة</label>
            <input className="mt-1 w-full rounded-xl border px-3 py-2 font-mono text-sm" {...form.register("invoiceNumber")} />
            {errors.invoiceNumber ? <div className="mt-1 text-xs text-red-600">Invoice number is required.</div> : null}
          </div>
          <div>
            <label className="text-sm font-medium text-zinc-700">Customer / الزبون</label>
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
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
              <button type="button" className="mt-1 shrink-0 rounded-xl border px-3 py-2 text-sm hover:bg-zinc-50" title="Add new customer / إضافة زبون جديد" onClick={() => setShowNewCustomer(true)}>+</button>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-zinc-700">Branch / الفرع</label>
            <select className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" {...form.register("branchId")} disabled={branches.length === 0}>
              <option value="">— None / بدون —</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} — {b.name}{b.isActive === false ? " (Inactive / غير نشط)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-zinc-700">Company name / اسم الشركة</label>
            <input
              className="mt-1 w-full rounded-xl border bg-zinc-50 px-3 py-2 text-sm text-zinc-700"
              value={selectedCustomer?.companyName ?? ""}
              placeholder="Will appear automatically / يظهر تلقائيًا"
              readOnly
            />
          </div>
          <div>
            <label className="text-sm font-medium text-zinc-700">Issue date / تاريخ الإصدار</label>
            <input className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" type="date" {...form.register("issueDate")} />
          </div>
          <div>
            <label className="text-sm font-medium text-zinc-700">Due date / تاريخ الاستحقاق</label>
            <input className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" type="date" {...form.register("dueDate")} />
          </div>
          <div>
            <label className="text-sm font-medium text-zinc-700">Currency / العملة</label>
            <select className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" {...form.register("currencyCode")}>
              <option value="IQD">IQD</option>
              <option value="USD">USD</option>
            </select>
          </div>
          {showFx ? (
            <div className="md:col-span-2">
              <label className="text-sm font-medium text-zinc-700">Exchange rate / سعر الصرف</label>
              <div className="mt-1 flex items-center gap-2">
                <div className="text-sm text-zinc-600">1 {currencyCode} =</div>
                <input className="w-40 rounded-xl border px-3 py-2 text-sm" placeholder="e.g. 1300" {...form.register("exchangeRate")} />
                <div className="text-sm text-zinc-600">{baseCurrencyCode}</div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="text-sm font-medium text-zinc-700">Discount type / نوع الخصم</label>
            <select className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" {...form.register("discountType")}>
              <option value="">No discount / بدون خصم</option>
              <option value="PERCENTAGE">Percentage / نسبة مئوية (%)</option>
              <option value="FIXED">Fixed amount / مبلغ ثابت</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-zinc-700">Discount value / قيمة الخصم</label>
            <input className="mt-1 w-full rounded-xl border px-3 py-2 font-mono text-sm" inputMode="decimal" placeholder="0" {...form.register("discountValue")} />
          </div>
          <div>
            <label className="text-sm font-medium text-zinc-700">Payment terms / شروط الدفع</label>
            <select className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" {...form.register("paymentTerms")}>
              <option value="">— Select / اختر —</option>
              <option value="MONTHLY">Monthly / شهري</option>
              <option value="QUARTERLY">Quarterly / ربع سنوي</option>
              <option value="YEARLY">Yearly / سنوي</option>
            </select>
          </div>
        </div>

        {salesReps.length > 0 && (
          <div className="max-w-sm">
            <label className="text-sm font-medium text-zinc-700">Sales Rep / المندوب</label>
            <select className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" {...form.register("salesRepresentativeId")}>
              <option value="">— None / بدون —</option>
              {salesReps.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
        )}

        <InvoiceLineItemsGrid
          fields={fields}
          register={form.register as unknown as (name: string) => Record<string, unknown>}
          setValue={(name, value) => form.setValue(name as never, value as never)}
          products={products}
          costCenters={costCenters}
          errors={errors as Record<string, unknown> | undefined}
          lineTotals={totals.lineTotals}
          fmtNum={fmtNum}
          onAppend={() => append({ description: "", costCenterId: "", quantity: "1", unitPrice: "", discountType: "", discountValue: "", taxRate: "" })}
          onRemove={remove}
          canRemove={fields.length > 1}
        />

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

