"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const FormSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  address1: z.string().optional(),
  address2: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
});

const ApiOkSchema = z.object({ id: z.string().min(1) });
const ApiErrSchema = z.object({ error: z.string().min(1) });

type FormValues = z.infer<typeof FormSchema>;

export function CustomerForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: { name: "", email: "", phone: "", address1: "", address2: "", city: "", country: "" },
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);

    const res = await fetch("/api/customers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    });

    const data: unknown = await res.json();
    if (!res.ok) {
      const parsedErr = ApiErrSchema.safeParse(data);
      setServerError(parsedErr.success ? parsedErr.data.error : "Failed to create customer");
      return;
    }

    const parsedOk = ApiOkSchema.safeParse(data);
    if (!parsedOk.success) {
      setServerError("Created but no id returned");
      return;
    }

    router.push("/app/customers");
    router.refresh();
  }

  return (
    <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
      {serverError ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{serverError}</div> : null}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="text-sm font-medium text-zinc-700">Name</label>
          <input className="mt-1 w-full rounded-xl border px-3 py-2" placeholder="Customer name" {...form.register("name")} />
        </div>

        <div>
          <label className="text-sm font-medium text-zinc-700">Email</label>
          <input className="mt-1 w-full rounded-xl border px-3 py-2" placeholder="email@example.com" {...form.register("email")} />
        </div>

        <div>
          <label className="text-sm font-medium text-zinc-700">Phone</label>
          <input className="mt-1 w-full rounded-xl border px-3 py-2" placeholder="+964..." {...form.register("phone")} />
        </div>

        <div>
          <label className="text-sm font-medium text-zinc-700">City</label>
          <input className="mt-1 w-full rounded-xl border px-3 py-2" placeholder="Baghdad" {...form.register("city")} />
        </div>

        <div>
          <label className="text-sm font-medium text-zinc-700">Country</label>
          <input className="mt-1 w-full rounded-xl border px-3 py-2" placeholder="Iraq" {...form.register("country")} />
        </div>

        <div className="md:col-span-2">
          <label className="text-sm font-medium text-zinc-700">Address 1</label>
          <input className="mt-1 w-full rounded-xl border px-3 py-2" placeholder="Street / building" {...form.register("address1")} />
        </div>
        <div className="md:col-span-2">
          <label className="text-sm font-medium text-zinc-700">Address 2</label>
          <input className="mt-1 w-full rounded-xl border px-3 py-2" placeholder="More details" {...form.register("address2")} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button className="rounded-xl bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800" type="submit">
          Create
        </button>
      </div>
    </form>
  );
}
