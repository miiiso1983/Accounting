"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const FormSchema = z.object({
  code: z.string().min(1, "Code is required").max(50),
  name: z.string().min(1, "Name is required").max(200),
});

const ApiErrSchema = z.object({ error: z.string().min(1) });

type FormValues = z.infer<typeof FormSchema>;
type CostCenterData = { id: string; code: string; name: string; isActive: boolean };

export function CostCenterEditForm({ costCenter }: { costCenter: CostCenterData }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: { code: costCenter.code, name: costCenter.name },
  });

  async function update(payload: unknown) {
    setServerError(null);
    setSaving(true);

    const res = await fetch(`/api/cost-centers/${costCenter.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSaving(false);
    if (!res.ok) {
      const data: unknown = await res.json().catch(() => null);
      const parsed = ApiErrSchema.safeParse(data);
      setServerError(parsed.success ? parsed.data.error : "Failed to update");
      return;
    }

    router.refresh();
  }

  async function onSubmit(values: FormValues) {
    await update(values);
  }

  async function toggleActive() {
    await update({ isActive: !costCenter.isActive });
  }

  return (
    <div className="grid gap-4">
      {serverError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{serverError}</div>
      ) : null}

      <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-zinc-700">Code / الرمز</label>
            <input className="mt-1 w-full rounded-xl border px-3 py-2 font-mono" {...form.register("code")} />
          </div>
          <div>
            <label className="text-sm font-medium text-zinc-700">Name / الاسم</label>
            <input className="mt-1 w-full rounded-xl border px-3 py-2" {...form.register("name")} />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            className="rounded-xl bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800"
            type="submit"
            disabled={saving}
          >
            {saving ? "Saving..." : "Save / حفظ"}
          </button>

          <button
            type="button"
            className={`rounded-xl border px-4 py-2 text-sm ${
              costCenter.isActive
                ? "border-red-200 text-red-700 hover:bg-red-50"
                : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
            }`}
            onClick={toggleActive}
            disabled={saving}
          >
            {costCenter.isActive ? "Deactivate / إلغاء التنشيط" : "Activate / تنشيط"}
          </button>
        </div>
      </form>
    </div>
  );
}
