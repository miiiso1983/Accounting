"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const FormSchema = z.object({
  name: z.string().min(1),
  companyName: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  address1: z.string().optional(),
  address2: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
});

const ApiErrSchema = z.object({ error: z.string().min(1) });

type FormValues = z.infer<typeof FormSchema>;
type CustomerData = {
  id: string;
  name: string;
  companyName: string;
  email: string;
  phone: string;
  address1: string;
  address2: string;
  city: string;
  country: string;
};

export function CustomerEditForm({ customer }: { customer: CustomerData }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: customer,
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    setSaving(true);

    const res = await fetch(`/api/customers/${customer.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    });

    setSaving(false);
    if (!res.ok) {
      const data: unknown = await res.json();
      const parsed = ApiErrSchema.safeParse(data);
      setServerError(parsed.success ? parsed.data.error : "Failed to update customer");
      return;
    }

    router.push(`/app/customers/${customer.id}`);
    router.refresh();
  }

  return (
    <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
      {serverError ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{serverError}</div> : null}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="text-sm font-medium text-zinc-700">Name</label>
          <input className="mt-1 w-full rounded-xl border px-3 py-2" {...form.register("name")} />
        </div>

        <div className="md:col-span-2">
          <label className="text-sm font-medium text-zinc-700">Company name / اسم الشركة</label>
          <input className="mt-1 w-full rounded-xl border px-3 py-2" {...form.register("companyName")} />
        </div>

        <div>
          <label className="text-sm font-medium text-zinc-700">Email</label>
          <input className="mt-1 w-full rounded-xl border px-3 py-2" {...form.register("email")} />
        </div>

        <div>
          <label className="text-sm font-medium text-zinc-700">Phone</label>
          <input className="mt-1 w-full rounded-xl border px-3 py-2" {...form.register("phone")} />
        </div>

        <div>
          <label className="text-sm font-medium text-zinc-700">City</label>
          <input className="mt-1 w-full rounded-xl border px-3 py-2" {...form.register("city")} />
        </div>

        <div>
          <label className="text-sm font-medium text-zinc-700">Country</label>
          <input className="mt-1 w-full rounded-xl border px-3 py-2" {...form.register("country")} />
        </div>

        <div className="md:col-span-2">
          <label className="text-sm font-medium text-zinc-700">Address 1</label>
          <input className="mt-1 w-full rounded-xl border px-3 py-2" {...form.register("address1")} />
        </div>

        <div className="md:col-span-2">
          <label className="text-sm font-medium text-zinc-700">Address 2</label>
          <input className="mt-1 w-full rounded-xl border px-3 py-2" {...form.register("address2")} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button className="rounded-xl bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800" type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save Changes / حفظ التعديلات"}
        </button>
      </div>
    </form>
  );
}