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

const ApiOkSchema = z.object({ id: z.string().min(1) });
const ApiErrSchema = z.object({ error: z.string().min(1) });

type FormValues = z.infer<typeof FormSchema>;

export function CostCenterForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: { code: "", name: "" },
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);

    const res = await fetch("/api/cost-centers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    });

    const data: unknown = await res.json();
    if (!res.ok) {
      const parsedErr = ApiErrSchema.safeParse(data);
      setServerError(parsedErr.success ? parsedErr.data.error : "Failed to create cost center");
      return;
    }

    const parsedOk = ApiOkSchema.safeParse(data);
    if (!parsedOk.success) {
      setServerError("Created but no id returned");
      return;
    }

    router.push("/app/cost-centers");
    router.refresh();
  }

  return (
    <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
      {serverError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{serverError}</div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="text-sm font-medium text-zinc-700">Code / الرمز</label>
          <input className="mt-1 w-full rounded-xl border px-3 py-2 font-mono" placeholder="CC-001" {...form.register("code")} />
        </div>

        <div>
          <label className="text-sm font-medium text-zinc-700">Name / الاسم</label>
          <input className="mt-1 w-full rounded-xl border px-3 py-2" placeholder="Marketing / التسويق" {...form.register("name")} />
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
