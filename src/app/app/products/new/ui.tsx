"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const FormSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  unitPrice: z.string().min(1),
  currencyCode: z.enum(["IQD", "USD"]),
  costCenterId: z.string().optional(),
});

const ApiOkSchema = z.object({ id: z.string().min(1) });
const ApiErrSchema = z.object({ error: z.string().min(1) });

type FormValues = z.infer<typeof FormSchema>;

type CostCenterOption = { id: string; code: string; name: string };

export function ProductForm({
  baseCurrencyCode,
  costCenters,
}: {
  baseCurrencyCode: "IQD" | "USD";
  costCenters: CostCenterOption[];
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: { name: "", description: "", unitPrice: "", currencyCode: baseCurrencyCode, costCenterId: "" },
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);

    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    });

    const data: unknown = await res.json();
    if (!res.ok) {
      const parsedErr = ApiErrSchema.safeParse(data);
      setServerError(parsedErr.success ? parsedErr.data.error : "Failed to create product");
      return;
    }

    const parsedOk = ApiOkSchema.safeParse(data);
    if (!parsedOk.success) {
      setServerError("Created but no id returned");
      return;
    }

    router.push("/app/products");
    router.refresh();
  }

  return (
    <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
      {serverError ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{serverError}</div> : null}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="text-sm font-medium text-zinc-700">Name / الاسم</label>
          <input className="mt-1 w-full rounded-xl border px-3 py-2" placeholder="Product name / اسم المنتج" {...form.register("name")} />
        </div>

        <div className="md:col-span-2">
          <label className="text-sm font-medium text-zinc-700">Description / الوصف</label>
          <textarea className="mt-1 w-full rounded-xl border px-3 py-2" rows={2} placeholder="Optional description / وصف اختياري" {...form.register("description")} />
        </div>

        <div>
          <label className="text-sm font-medium text-zinc-700">Unit Price / سعر الوحدة</label>
          <input className="mt-1 w-full rounded-xl border px-3 py-2 font-mono" inputMode="decimal" placeholder="0.00" {...form.register("unitPrice")} />
        </div>

        <div>
          <label className="text-sm font-medium text-zinc-700">Currency / العملة</label>
          <select className="mt-1 w-full rounded-xl border px-3 py-2" {...form.register("currencyCode")}>
            <option value="IQD">IQD</option>
            <option value="USD">USD</option>
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="text-sm font-medium text-zinc-700">Default Cost Center / مركز الكلفة الافتراضي</label>
          <select className="mt-1 w-full rounded-xl border px-3 py-2" {...form.register("costCenterId")}>
            <option value="">— None / بدون —</option>
            {costCenters.map((cc) => (
              <option key={cc.id} value={cc.id}>
                {cc.code} — {cc.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button className="rounded-xl bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800" type="submit">
          Create / إنشاء
        </button>
      </div>
    </form>
  );
}

