"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

type CustomerOption = { id: string; name: string };
type Props = { customers: CustomerOption[]; baseCurrencyCode: "IQD" | "USD"; defaultCustomerId?: string };

const LineSchema = z.object({
  description: z.string().min(1),
  quantity: z.string().min(1),
  unitPrice: z.string().min(1),
  taxRate: z.string().optional(), // e.g. 0.15
});

const FormSchema = z.object({
  invoiceNumber: z.string().min(1),
  customerId: z.string().min(1),
  issueDate: z.string().min(1),
  dueDate: z.string().optional(),

  currencyCode: z.enum(["IQD", "USD"]),
  exchangeRate: z.string().optional(),

  lines: z.array(LineSchema).min(1),
});

const ApiOkSchema = z.object({ id: z.string().min(1) });
const ApiErrSchema = z.object({ error: z.string().min(1) });

type FormValues = z.infer<typeof FormSchema>;

export function InvoiceForm({ customers, baseCurrencyCode, defaultCustomerId }: Props) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const initialCustomerId = useMemo(() => {
    if (defaultCustomerId && customers.some((c) => c.id === defaultCustomerId)) return defaultCustomerId;
    return customers[0]?.id ?? "";
  }, [customers, defaultCustomerId]);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      invoiceNumber: "",
	      customerId: initialCustomerId,
      issueDate: today,
      dueDate: "",
      currencyCode: baseCurrencyCode,
      exchangeRate: "",
      lines: [{ description: "", quantity: "1", unitPrice: "", taxRate: "" }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "lines" });

  const currencyCode = useWatch({ control: form.control, name: "currencyCode" });
  const showFx = currencyCode && currencyCode !== baseCurrencyCode;

  async function submit(values: FormValues, mode: "DRAFT" | "SEND") {
    setServerError(null);
    const payload = {
      ...values,
      mode,
      exchangeRate: showFx ? { rate: values.exchangeRate } : undefined,
    };

    const res = await fetch("/api/invoices", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data: unknown = await res.json();
    if (!res.ok) {
      const parsedErr = ApiErrSchema.safeParse(data);
      setServerError(parsedErr.success ? parsedErr.data.error : "Failed to create invoice");
      return;
    }

    const parsedOk = ApiOkSchema.safeParse(data);
    if (!parsedOk.success) {
      setServerError("Created but no id returned");
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
            <input className="mt-1 w-full rounded-xl border px-3 py-2 font-mono" placeholder="INV-0001" {...form.register("invoiceNumber")} />
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-700">Customer</label>
            <select className="mt-1 w-full rounded-xl border px-3 py-2" {...form.register("customerId")}> 
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
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
              <div className="mt-1 text-xs text-zinc-500">We store it as: 1 {currencyCode} = rate {baseCurrencyCode}</div>
            </div>
          ) : null}
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
              <div key={f.id} className="grid gap-3 md:grid-cols-12">
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
            ))}
          </div>

          <div className="mt-2 text-xs text-zinc-500">Tax rate example: 0.15 (15%). Leave blank for 0.</div>
        </div>

        <div className="flex items-center gap-3">
          <button
            className="rounded-xl border px-4 py-2 text-sm hover:bg-zinc-50"
            type="button"
            onClick={form.handleSubmit((v) => submit(v, "DRAFT"))}
            disabled={customers.length === 0}
          >
            Save draft
          </button>
          <button
            className="rounded-xl bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800"
            type="button"
            onClick={form.handleSubmit((v) => submit(v, "SEND"))}
            disabled={customers.length === 0}
          >
            Send & post
          </button>
        </div>
      </form>
    </div>
  );
}
