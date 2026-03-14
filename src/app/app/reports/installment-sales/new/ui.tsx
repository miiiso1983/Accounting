"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  calculateAmountPerInstallment,
  calculateNumberOfInstallments,
  fmtAmount,
  toNumber,
} from "@/lib/reports/installment-sales";

const FormSchema = z.object({
  productName: z.string().min(1),
  customerId: z.string().min(1),
  invoiceNumber: z.string().min(1),
  invoiceDate: z.string().min(1),
  durationMonths: z.string().min(1),
  totalAmount: z.string().min(1),
  currencyCode: z.enum(["IQD", "USD"]),
  installmentFrequency: z.enum(["MONTHLY", "QUARTERLY", "ANNUALLY"]),
  status: z.enum(["ACTIVE", "COMPLETED", "CANCELLED"]).optional(),
});

const ApiOkSchema = z.object({ id: z.string().min(1) });
const ApiErrSchema = z.object({ error: z.any() });

type FormValues = z.infer<typeof FormSchema>;

export function InstallmentSalesNewClient(props: {
  labels: Record<string, string>;
  customers: Array<{ id: string; name: string }>;
  baseCurrencyCode: "IQD" | "USD";
}) {
  const { labels, customers, baseCurrencyCode } = props;
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [customerQuery, setCustomerQuery] = useState("");
  const [customerOpen, setCustomerOpen] = useState(false);

  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; errors: Array<{ row: number; error: string }> } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      productName: "",
      customerId: "",
      invoiceNumber: "",
      invoiceDate: "",
      durationMonths: "12",
      totalAmount: "",
      currencyCode: baseCurrencyCode,
      installmentFrequency: "MONTHLY",
      status: "ACTIVE",
    },
  });

  const durationMonths = Number(form.watch("durationMonths")) || 0;
  const frequency = form.watch("installmentFrequency");
  const totalAmountNum = toNumber(form.watch("totalAmount"));

  const selectedCustomerId = form.watch("customerId");
  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId],
  );

  const filteredCustomers = useMemo(() => {
    const q = customerQuery.trim().toLowerCase();
    const list = q ? customers.filter((c) => c.name.toLowerCase().includes(q)) : customers;
    return list.slice(0, 50);
  }, [customers, customerQuery]);

  useEffect(() => {
    // Keep the visible input in sync when a customer is selected programmatically.
    if (selectedCustomer && customerQuery !== selectedCustomer.name) setCustomerQuery(selectedCustomer.name);
  }, [selectedCustomer, customerQuery]);

  const computed = useMemo(() => {
    const numberOfInstallments = calculateNumberOfInstallments(durationMonths || 0, frequency);
    const amountPerInstallment = calculateAmountPerInstallment(Number.isFinite(totalAmountNum) ? totalAmountNum : 0, numberOfInstallments);
    return { numberOfInstallments, amountPerInstallment };
  }, [durationMonths, frequency, totalAmountNum]);

  async function onSubmit(values: FormValues) {
    setServerError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/reports/installment-sales", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...values,
          durationMonths: Number(values.durationMonths),
        }),
      });

      const data: unknown = await res.json();
      if (!res.ok) {
        const parsedErr = ApiErrSchema.safeParse(data);
	        setServerError(parsedErr.success ? String(parsedErr.data.error) : labels.failedCreate);
        return;
      }

      const parsedOk = ApiOkSchema.safeParse(data);
      if (!parsedOk.success) {
        setServerError(labels.failedCreate);
        return;
      }

      router.push("/app/reports/installment-sales");
      router.refresh();
    } catch {
      setServerError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const handleImportFile = async (file: File) => {
    setImportLoading(true);
    setImportResult(null);
    setImportError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/reports/installment-sales/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setImportError(data.error ?? "Import failed");
      } else {
        setImportResult(data);
      }
    } catch {
      setImportError("Network error. Please try again.");
    } finally {
      setImportLoading(false);
    }
  };

  const onImportInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImportFile(file);
  };

  const onImportDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleImportFile(file);
  };

  return (
    <div className="grid gap-6">
      <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
        {serverError ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{serverError}</div> : null}

        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="text-sm font-medium text-zinc-700">{labels.productName}</label>
            <input className="mt-1 w-full rounded-xl border px-3 py-2" placeholder="Product name / اسم المنتج" {...form.register("productName")} />
          </div>

          <div className="md:col-span-2">
            <label className="text-sm font-medium text-zinc-700">{labels.customerName}</label>
	            <input type="hidden" {...form.register("customerId")} />
	            <div className="relative mt-1">
	              <div className="relative">
	                <input
	                  className="w-full rounded-xl border bg-white px-3 py-2 pr-9"
	                  placeholder="Search customer / ابحث عن زبون"
	                  value={customerQuery}
	                  onChange={(e) => {
	                    setCustomerQuery(e.target.value);
	                    setCustomerOpen(true);
	                    if (form.getValues("customerId")) {
	                      form.setValue("customerId", "", { shouldDirty: true, shouldValidate: true });
	                    }
	                  }}
	                  onFocus={() => setCustomerOpen(true)}
	                  onBlur={() => {
	                    // allow click selection
	                    setTimeout(() => setCustomerOpen(false), 150);
	                  }}
	                  onKeyDown={(e) => {
	                    if (e.key === "Enter" && customerOpen && customerQuery.trim()) {
	                      // prevent form submit while selecting
	                      e.preventDefault();
	                      const first = filteredCustomers[0];
	                      if (first) {
	                        form.setValue("customerId", first.id, { shouldDirty: true, shouldValidate: true });
	                        setCustomerQuery(first.name);
	                        setCustomerOpen(false);
	                      }
	                    }
	                  }}
	                />
	                <button
	                  type="button"
	                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-50"
	                  onMouseDown={(e) => e.preventDefault()}
	                  onClick={() => {
	                    setCustomerQuery("");
	                    form.setValue("customerId", "", { shouldDirty: true, shouldValidate: true });
	                    setCustomerOpen(true);
	                  }}
	                  aria-label="Clear"
	                  title="Clear"
	                >
	                  ×
	                </button>
	              </div>

	              {customerOpen ? (
	                <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border bg-white shadow-sm">
	                  {filteredCustomers.length === 0 ? (
	                    <div className="px-3 py-2 text-sm text-zinc-500">No customers found / لا يوجد زبائن</div>
	                  ) : (
	                    filteredCustomers.map((c) => (
	                      <button
	                        key={c.id}
	                        type="button"
	                        className="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-50"
	                        onMouseDown={(e) => e.preventDefault()}
	                        onClick={() => {
	                          form.setValue("customerId", c.id, { shouldDirty: true, shouldValidate: true });
	                          setCustomerQuery(c.name);
	                          setCustomerOpen(false);
	                        }}
	                      >
	                        {c.name}
	                      </button>
	                    ))
	                  )}
	                </div>
	              ) : null}
	            </div>
	            {form.formState.errors.customerId ? (
	              <div className="mt-1 text-xs text-red-600">Customer is required / الزبون مطلوب</div>
	            ) : null}
	            {selectedCustomer ? (
	              <div className="mt-1 text-xs text-zinc-500">Selected: {selectedCustomer.name}</div>
	            ) : null}
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-700">{labels.invoiceNumber}</label>
            <input className="mt-1 w-full rounded-xl border px-3 py-2 font-mono" placeholder="INV-1001" {...form.register("invoiceNumber")} />
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-700">{labels.invoiceDate}</label>
            <input className="mt-1 w-full rounded-xl border px-3 py-2" type="date" {...form.register("invoiceDate")} />
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-700">{labels.contractDuration}</label>
            <input className="mt-1 w-full rounded-xl border px-3 py-2 font-mono" inputMode="numeric" placeholder="12" {...form.register("durationMonths")} />
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-700">{labels.totalInvoiceAmount}</label>
            <input className="mt-1 w-full rounded-xl border px-3 py-2 font-mono" inputMode="decimal" placeholder="0.00" {...form.register("totalAmount")} />
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-700">{labels.currency}</label>
            <select className="mt-1 w-full rounded-xl border bg-white px-3 py-2" {...form.register("currencyCode")}>
              <option value="IQD">IQD</option>
              <option value="USD">USD</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-700">{labels.installmentFrequency}</label>
            <select className="mt-1 w-full rounded-xl border bg-white px-3 py-2" {...form.register("installmentFrequency")}>
              <option value="MONTHLY">{labels.monthly}</option>
              <option value="QUARTERLY">{labels.quarterly}</option>
              <option value="ANNUALLY">{labels.annually}</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-700">{labels.numberOfInstallments}</label>
            <input className="mt-1 w-full rounded-xl border bg-zinc-50 px-3 py-2 font-mono" value={computed.numberOfInstallments} readOnly />
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-700">{labels.amountPerInstallment}</label>
            <input className="mt-1 w-full rounded-xl border bg-zinc-50 px-3 py-2 font-mono" value={fmtAmount(computed.amountPerInstallment)} readOnly />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            className="rounded-xl bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800 disabled:opacity-60"
            type="submit"
            disabled={saving}
          >
            {saving ? labels.creating : labels.create}
          </button>
        </div>
      </form>

      <div className="rounded-2xl border bg-white p-4">
        <div className="text-sm font-semibold text-zinc-900">{labels.bulkTitle}</div>
        <div className="mt-1 text-xs text-zinc-500">{labels.bulkSubtitle}</div>

        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              window.location.href = "/api/reports/installment-sales/import";
            }}
            className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-sky-50 focus:outline-none focus:ring-4 focus:ring-emerald-200/70"
          >
            ↓ {labels.downloadTemplate}
          </button>
        </div>

        <div
          onDrop={onImportDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
          className="mt-3 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-sky-200 bg-sky-50/40 px-6 py-8 text-center transition hover:bg-sky-50/80"
        >
          <div className="text-3xl text-sky-400">📂</div>
          <div className="mt-2 text-sm font-medium text-zinc-700">{labels.dropzone}</div>
          <div className="mt-1 text-xs text-zinc-500">.xlsx · .csv</div>
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onImportInputChange} />
        </div>

        {importLoading && (
          <div className="mt-3 rounded-2xl border border-sky-100 bg-white p-4 text-sm text-zinc-600">{labels.importing}</div>
        )}

        {importError && (
          <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{importError}</div>
        )}

        {importResult && (
          <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 space-y-2">
            <div className="text-sm font-medium text-emerald-800">
              {labels.imported.replace("{count}", String(importResult.imported))}
            </div>
            {importResult.errors.length > 0 && (
              <div>
                <div className="text-xs font-medium text-red-700">
                  {labels.errorRows.replace("{count}", String(importResult.errors.length))}
                </div>
                <ul className="mt-1 max-h-40 overflow-y-auto text-xs text-red-600">
                  {importResult.errors.map((e, i) => (
                    <li key={i}>Row {e.row}: {e.error}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
