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
  revenueAccountId: z.string().optional(),
});

const ApiErrSchema = z.object({ error: z.string().min(1) });

type FormValues = z.infer<typeof FormSchema>;
type ProductData = {
  id: string;
  name: string;
  description: string;
  unitPrice: string;
  currencyCode: "IQD" | "USD";
  isActive: boolean;
  costCenterId?: string;
  revenueAccountId?: string;
};

type CostCenterOption = { id: string; code: string; name: string };
type RevenueAccountOption = { id: string; code: string; name: string };

export function ProductEditForm({ product, costCenters, revenueAccounts }: { product: ProductData; costCenters: CostCenterOption[]; revenueAccounts: RevenueAccountOption[] }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name: product.name,
      description: product.description,
      unitPrice: product.unitPrice,
      currencyCode: product.currencyCode,
      costCenterId: product.costCenterId ?? "",
      revenueAccountId: product.revenueAccountId ?? "",
    },
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    setSaving(true);

    const res = await fetch(`/api/products/${product.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    });

    setSaving(false);
    if (!res.ok) {
      const data: unknown = await res.json();
      const parsed = ApiErrSchema.safeParse(data);
      setServerError(parsed.success ? parsed.data.error : "Failed to update");
      return;
    }

    router.refresh();
  }

  async function toggleActive() {
    setSaving(true);
    const res = await fetch(`/api/products/${product.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isActive: !product.isActive }),
    });
    setSaving(false);
    if (!res.ok) {
      const data: unknown = await res.json();
      const parsed = ApiErrSchema.safeParse(data);
      setServerError(parsed.success ? parsed.data.error : "Failed to toggle status");
      return;
    }
    router.refresh();
  }

  return (
    <div className="grid gap-4">
      <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
        {serverError ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{serverError}</div> : null}

        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="text-sm font-medium text-zinc-700">Name / الاسم</label>
            <input className="mt-1 w-full rounded-xl border px-3 py-2" {...form.register("name")} />
          </div>

          <div className="md:col-span-2">
            <label className="text-sm font-medium text-zinc-700">Description / الوصف</label>
            <textarea className="mt-1 w-full rounded-xl border px-3 py-2" rows={2} {...form.register("description")} />
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-700">Unit Price / سعر الوحدة</label>
            <input className="mt-1 w-full rounded-xl border px-3 py-2 font-mono" inputMode="decimal" {...form.register("unitPrice")} />
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

        <div className="md:col-span-2">
          <label className="text-sm font-medium text-zinc-700">Revenue Account / حساب الإيرادات</label>
          <select className="mt-1 w-full rounded-xl border px-3 py-2" {...form.register("revenueAccountId")}>
            <option value="">— None / بدون —</option>
            {revenueAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.name}
              </option>
            ))}
          </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button className="rounded-xl bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800" type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save Changes / حفظ التعديلات"}
          </button>

          <button
            type="button"
            className={`rounded-xl border px-4 py-2 text-sm ${product.isActive ? "border-red-200 text-red-700 hover:bg-red-50" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"}`}
            onClick={toggleActive}
            disabled={saving}
          >
            {product.isActive ? "Deactivate / إلغاء التنشيط" : "Activate / تنشيط"}
          </button>
        </div>
      </form>
    </div>
  );
}

