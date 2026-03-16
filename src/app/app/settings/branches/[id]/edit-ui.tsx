"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const FormSchema = z.object({
  code: z.string().min(1, "Code is required").max(50),
  name: z.string().min(1, "Name is required").max(200),
  address: z.string().max(500).optional(),
  phone: z.string().max(100).optional(),
  isActive: z.boolean(),
});

type FormValues = z.infer<typeof FormSchema>;
type BranchData = { id: string; code: string; name: string; address: string; phone: string; isActive: boolean };

export function BranchEditForm({ branch }: { branch: BranchData }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      code: branch.code,
      name: branch.name,
      address: branch.address,
      phone: branch.phone,
      isActive: branch.isActive,
    },
  });

  async function onSubmit(values: FormValues) {
    setSaving(true);
    setServerError(null);
    setSuccess(null);

    const res = await fetch(`/api/branches/${branch.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    });

    setSaving(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setServerError(data?.error ?? "Failed to update branch");
      return;
    }

    setSuccess("Saved successfully / تم الحفظ بنجاح");
    router.refresh();
  }

  async function handleDelete() {
    if (!confirm("Delete this branch? / هل تريد حذف هذا الفرع؟")) return;

    setDeleting(true);
    setServerError(null);

    const res = await fetch(`/api/branches/${branch.id}`, { method: "DELETE" });
    setDeleting(false);

    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setServerError(data?.error ?? "Failed to delete branch");
      return;
    }

    router.push("/app/settings/branches");
    router.refresh();
  }

  return (
    <div className="grid gap-4">
      {serverError ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{serverError}</div> : null}
      {success ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{success}</div> : null}

      <form className="grid max-w-2xl gap-4" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-zinc-700">Code / الرمز *</label>
            <input className="mt-1 w-full rounded-xl border px-3 py-2 font-mono" {...form.register("code")} />
          </div>
          <div>
            <label className="text-sm font-medium text-zinc-700">Name / الاسم *</label>
            <input className="mt-1 w-full rounded-xl border px-3 py-2" {...form.register("name")} />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-zinc-700">Address / العنوان</label>
          <textarea className="mt-1 min-h-24 w-full rounded-xl border px-3 py-2" {...form.register("address")} />
        </div>

        <div>
          <label className="text-sm font-medium text-zinc-700">Phone / الهاتف</label>
          <input className="mt-1 w-full rounded-xl border px-3 py-2" {...form.register("phone")} />
        </div>

        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input type="checkbox" className="rounded" {...form.register("isActive")} />
          Active / نشط
        </label>

        <div className="flex items-center gap-3">
          <button className="rounded-xl bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800" type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save / حفظ"}
          </button>
          <button
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 hover:bg-red-100"
            type="button"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? "Deleting..." : "Delete / حذف"}
          </button>
        </div>
      </form>
    </div>
  );
}