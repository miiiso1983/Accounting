"use client";

type Props = {
  excelHref: string;
};

export function JournalExportButtons({ excelHref }: Props) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="rounded-xl border px-3 py-2 text-sm hover:bg-zinc-50"
        onClick={() => window.print()}
      >
        🖨️ Print
      </button>
      <a
        className="rounded-xl border px-3 py-2 text-sm hover:bg-zinc-50"
        href={excelHref}
      >
        📥 Excel
      </a>
    </div>
  );
}

