import Link from "next/link";

type Props = {
  initial: {
    q: string;
    referenceType: string;
    from: string;
    to: string;
  };
  referenceTypeOptions: string[];
};

export function JournalListFilters({ initial, referenceTypeOptions }: Props) {
  return (
    <form className="grid gap-3 md:grid-cols-12" method="GET" action="/app/journal">
      <div className="md:col-span-5">
        <label className="text-xs font-medium text-zinc-600">Search / بحث</label>
        <input
          className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm"
          name="q"
          defaultValue={initial.q}
          placeholder="Description or reference… / الوصف أو المرجع…"
        />
      </div>

      <div className="md:col-span-3">
        <label className="text-xs font-medium text-zinc-600">Reference type / نوع المرجع</label>
        <select className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm" name="referenceType" defaultValue={initial.referenceType}>
          <option value="">All / الكل</option>
          {referenceTypeOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div className="md:col-span-2">
        <label className="text-xs font-medium text-zinc-600">From / من</label>
        <input className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm" type="date" name="from" defaultValue={initial.from} />
      </div>

      <div className="md:col-span-2">
        <label className="text-xs font-medium text-zinc-600">To / إلى</label>
        <input className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm" type="date" name="to" defaultValue={initial.to} />
      </div>

      <div className="md:col-span-12 flex flex-wrap items-center gap-2">
        <button type="submit" className="rounded-xl bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800">
          Apply / تطبيق
        </button>
        <Link className="rounded-xl border px-4 py-2 text-sm hover:bg-zinc-50" href="/app/journal">
          Clear / مسح
        </Link>
      </div>
    </form>
  );
}
