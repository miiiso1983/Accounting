"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { PRINT_TEMPLATE_TYPES } from "@/lib/settings/print-templates";
import { PrintTemplatePreviewFrame } from "../preview-frame";

const FormSchema = z.object({
  name: z.string().min(1, "Name is required").max(150),
  type: z.enum(PRINT_TEMPLATE_TYPES),
  headerHtml: z.string().max(20000),
  footerHtml: z.string().max(20000),
  logoUrl: z.string().max(1000).optional(),
  isDefault: z.boolean(),
});

type FormValues = z.infer<typeof FormSchema>;
type TemplateData = {
  id: string;
  name: string;
  type: FormValues["type"];
  headerHtml: string;
  footerHtml: string;
  logoUrl: string;
  isDefault: boolean;
};

export function PrintTemplateEditForm({ template }: { template: TemplateData }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name: template.name,
      type: template.type,
      headerHtml: template.headerHtml,
      footerHtml: template.footerHtml,
      logoUrl: template.logoUrl,
      isDefault: template.isDefault,
    },
  });

  const watched = useWatch({ control: form.control });

  async function onSubmit(values: FormValues) {
    setSaving(true);
    setServerError(null);
    setSuccess(null);

    const res = await fetch(`/api/print-templates/${template.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    });

    setSaving(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setServerError(data?.error ?? "Failed to update template");
      return;
    }

    setSuccess("Saved successfully / تم الحفظ بنجاح");
    router.refresh();
  }

  async function handleDelete() {
    if (!confirm("Delete this template? / هل تريد حذف هذا القالب؟")) return;

    setDeleting(true);
    setServerError(null);

    const res = await fetch(`/api/print-templates/${template.id}`, { method: "DELETE" });
    setDeleting(false);

    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setServerError(data?.error ?? "Failed to delete template");
      return;
    }

    router.push("/app/settings/print-templates");
    router.refresh();
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="grid gap-4">
        {serverError ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{serverError}</div> : null}
        {success ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{success}</div> : null}

        <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-zinc-700">Name / الاسم *</label>
              <input className="mt-1 w-full rounded-xl border px-3 py-2" {...form.register("name")} />
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-700">Type / النوع *</label>
              <select className="mt-1 w-full rounded-xl border px-3 py-2" {...form.register("type")}>
                <option value="INVOICE">Invoice / فاتورة</option>
                <option value="RECEIPT">Receipt / إيصال</option>
                <option value="JOURNAL_ENTRY">Journal Entry / قيد يومية</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-700">Logo URL / رابط الشعار</label>
            <input className="mt-1 w-full rounded-xl border px-3 py-2" placeholder="/logo.PNG or https://..." {...form.register("logoUrl")} />
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-700">Header HTML / HTML الرأس</label>
            <textarea className="mt-1 min-h-40 w-full rounded-xl border px-3 py-2 font-mono text-sm" {...form.register("headerHtml")} />
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-700">Footer HTML / HTML التذييل</label>
            <textarea className="mt-1 min-h-32 w-full rounded-xl border px-3 py-2 font-mono text-sm" {...form.register("footerHtml")} />
          </div>

          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input type="checkbox" className="rounded" {...form.register("isDefault")} />
            Default for this type / الافتراضي لهذا النوع
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

      <div className="rounded-2xl border bg-slate-50 p-4">
        <div className="mb-3 text-sm font-medium text-zinc-900">Preview / المعاينة</div>
        <PrintTemplatePreviewFrame
          name={watched.name ?? ""}
          type={watched.type ?? "INVOICE"}
          headerHtml={watched.headerHtml ?? ""}
          footerHtml={watched.footerHtml ?? ""}
          logoUrl={watched.logoUrl ?? ""}
        />
      </div>
    </div>
  );
}