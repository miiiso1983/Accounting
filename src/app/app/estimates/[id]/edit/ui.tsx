"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { CustomerAutocompleteField } from "@/components/fields/CustomerAutocompleteField";
import { InvoiceLineItemsGrid } from "@/components/invoice/InvoiceLineItemsGrid";

type CustomerOption = { id: string; name: string; companyName: string | null };
type ProductOption = { id: string; name: string; description: string | null; unitPrice: string; currencyCode: string; costCenterId: string | null };
type CostCenterOption = { id: string; code: string; name: string };
type BranchOption = { id: string; code: string; name: string; isActive?: boolean };

const LineSchema = z.object({
  description: z.string().min(1),
  costCenterId: z.string().optional(),
  productId: z.string().optional(),
  quantity: z.string().min(1),
  unitPrice: z.string().min(1),
  discountType: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["PERCENTAGE", "FIXED"]).optional()),
  discountValue: z.string().optional(),
  taxRate: z.string().optional(),
});

const OptionalDiscountTypeSchema = z.preprocess((v) => (v === "" ? undefined : v), z.enum(["PERCENTAGE", "FIXED"]).optional());

const FormSchema = z.object({
  estimateNumber: z.string().min(1),
  customerId: z.string().min(1),
  branchId: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
  issueDate: z.string().min(1),
  expiryDate: z.string().optional(),
  currencyCode: z.enum(["IQD", "USD"]),
  exchangeRate: z.string().optional(),
  discountType: OptionalDiscountTypeSchema,
  discountValue: z.string().optional(),
  note: z.string().optional(),
  lines: z.array(LineSchema).min(1),
});

type FormValues = z.input<typeof FormSchema>;
type SubmitValues = z.output<typeof FormSchema>;

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

type Props = {
  estimateId: string;
  customers: CustomerOption[];
  products: ProductOption[];
  costCenters: CostCenterOption[];
  branches: BranchOption[];
  baseCurrencyCode: "IQD" | "USD";
  initialData: FormValues;
};

export function EditEstimateForm({ estimateId, customers, products, costCenters, branches, baseCurrencyCode, initialData }: Props) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<FormValues, undefined, SubmitValues>({ resolver: zodResolver(FormSchema), defaultValues: initialData });
  const { errors, isSubmitting } = form.formState;
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "lines" });
  const currencyCode = useWatch({ control: form.control, name: "currencyCode" });
  const selectedCustomerId = useWatch({ control: form.control, name: "customerId" });
  const watchedLines = useWatch({ control: form.control, name: "lines" });
  const watchedDiscountType = useWatch({ control: form.control, name: "discountType" });
  const watchedDiscountValue = useWatch({ control: form.control, name: "discountValue" });
  const selectedCustomer = useMemo(() => customers.find((c) => c.id === selectedCustomerId) ?? null, [customers, selectedCustomerId]);
  const showFx = currencyCode && currencyCode !== baseCurrencyCode;

  const totals = useMemo(() => {
    const lineTotals = (watchedLines ?? []).map((l) => calcLineTotal(l.quantity ?? "0", l.unitPrice ?? "0", l.discountType as string | undefined, l.discountValue));
    const subtotal = lineTotals.reduce((a, b) => a + b, 0);
    const dv = parseFloat(watchedDiscountValue ?? "") || 0;
    let discountAmount = 0;
    if (watchedDiscountType === "PERCENTAGE" && dv > 0) discountAmount = (subtotal * dv) / 100;
    else if (watchedDiscountType === "FIXED" && dv > 0) discountAmount = dv;
    const afterDiscount = subtotal - discountAmount;
    const taxTotal = (watchedLines ?? []).reduce((acc, l, i) => { const tr = parseFloat(l.taxRate ?? "") || 0; return acc + lineTotals[i] * tr; }, 0);
    const total = afterDiscount + taxTotal;
    return { lineTotals, subtotal, discountAmount, afterDiscount, taxTotal, total };
  }, [watchedLines, watchedDiscountType, watchedDiscountValue]);

  async function submit(values: SubmitValues) {
    setServerError(null);
    const payload = {
      ...values, branchId: values.branchId ?? "",
      lines: values.lines.map((l) => ({
        ...l,
        discountType: l.discountValue && Number(l.discountValue) > 0 ? (l.discountType || "FIXED") : undefined,
        discountValue: l.discountValue && Number(l.discountValue) > 0 ? l.discountValue : undefined,
      })),
      exchangeRate: showFx ? { rate: values.exchangeRate } : undefined,
      discountType: values.discountValue && Number(values.discountValue) > 0 ? (values.discountType || "FIXED") : undefined,
      discountValue: values.discountValue && Number(values.discountValue) > 0 ? values.discountValue : undefined,
    };
    const res = await fetch(`/api/estimates/${estimateId}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const data = await res.json().catch(() => null);
    if (!res.ok) { setServerError(typeof data?.error === "string" ? data.error : "Failed to update"); return; }
    router.push(`/app/estimates/${estimateId}`);
    router.refresh();
  }

  return (
    <div className="grid gap-6 max-w-full box-border">
      {serverError && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{serverError}</div>}
      <form className="grid gap-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-zinc-700">Estimate # / رقم عرض السعر</label>
            <input className="mt-1 w-full rounded-xl border px-3 py-2 font-mono text-sm" {...form.register("estimateNumber")} />
          </div>
          <div>
            <label className="text-sm font-medium text-zinc-700">Customer / الزبون</label>
            <input type="hidden" {...form.register("customerId")} />
            <CustomerAutocompleteField customers={customers} defaultCustomerId={initialData.customerId} placeholder="Search customer" noResultsLabel="No customers found" clearLabel="Clear" onSelectedIdChange={(id) => form.setValue("customerId", id, { shouldDirty: true, shouldValidate: true })} />
            {errors.customerId && <div className="mt-1 text-xs text-red-600">Customer is required.</div>}
          </div>
          <div>
            <label className="text-sm font-medium text-zinc-700">Branch / الفرع</label>
            <select className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" {...form.register("branchId")}>
              <option value="">— None —</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-zinc-700">Company</label>
            <input className="mt-1 w-full rounded-xl border bg-zinc-50 px-3 py-2 text-sm text-zinc-700" value={selectedCustomer?.companyName ?? ""} readOnly />
          </div>
          <div><label className="text-sm font-medium text-zinc-700">Issue date</label><input className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" type="date" {...form.register("issueDate")} /></div>
          <div><label className="text-sm font-medium text-zinc-700">Expiry date</label><input className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" type="date" {...form.register("expiryDate")} /></div>
          <div><label className="text-sm font-medium text-zinc-700">Currency</label><select className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" {...form.register("currencyCode")}><option value="IQD">IQD</option><option value="USD">USD</option></select></div>
          {showFx && (<div className="md:col-span-2"><label className="text-sm font-medium text-zinc-700">Exchange rate</label><div className="mt-1 flex items-center gap-2"><span className="text-sm text-zinc-600">1 {currencyCode} =</span><input className="w-40 rounded-xl border px-3 py-2 text-sm" {...form.register("exchangeRate")} /><span className="text-sm text-zinc-600">{baseCurrencyCode}</span></div></div>)}
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div><label className="text-sm font-medium text-zinc-700">Discount type</label><select className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" {...form.register("discountType")}><option value="">No discount</option><option value="PERCENTAGE">Percentage (%)</option><option value="FIXED">Fixed amount</option></select></div>
          <div><label className="text-sm font-medium text-zinc-700">Discount value</label><input className="mt-1 w-full rounded-xl border px-3 py-2 font-mono text-sm" inputMode="decimal" placeholder="0" {...form.register("discountValue")} /></div>
          <div><label className="text-sm font-medium text-zinc-700">Note</label><input className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" {...form.register("note")} /></div>
        </div>

        <InvoiceLineItemsGrid
          fields={fields}
          register={form.register as unknown as (name: string) => Record<string, unknown>}
          setValue={(name, value) => form.setValue(name as never, value as never)}
          products={products}
          costCenters={costCenters}
          errors={errors as Record<string, unknown> | undefined}
          lineTotals={totals.lineTotals}
          fmtNum={fmtNum}
          onAppend={() => append({ description: "", costCenterId: "", productId: "", quantity: "1", unitPrice: "", discountType: "", discountValue: "", taxRate: "" })}
          onRemove={remove}
          canRemove={fields.length > 1}
        />

        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
          <div className="text-sm font-medium text-sky-900 mb-3">Estimate Summary</div>
          <div className="grid gap-2 text-sm">
            <div className="flex justify-between"><span className="text-zinc-600">Subtotal</span><span className="font-mono font-medium">{fmtNum(totals.subtotal)} {currencyCode}</span></div>
            {totals.discountAmount > 0 && <div className="flex justify-between text-amber-700"><span>Discount</span><span className="font-mono font-medium">-{fmtNum(totals.discountAmount)} {currencyCode}</span></div>}
            {totals.taxTotal > 0 && <div className="flex justify-between"><span className="text-zinc-600">Tax</span><span className="font-mono font-medium">{fmtNum(totals.taxTotal)} {currencyCode}</span></div>}
            <div className="flex justify-between border-t border-sky-200 pt-2 text-base font-bold"><span className="text-sky-900">Total</span><span className="font-mono text-sky-700">{fmtNum(totals.total)} {currencyCode}</span></div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button className="rounded-xl bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800 disabled:opacity-50" type="button" onClick={form.handleSubmit(submit)} disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save changes / حفظ التعديلات"}
          </button>
        </div>
      </form>
    </div>
  );
}

