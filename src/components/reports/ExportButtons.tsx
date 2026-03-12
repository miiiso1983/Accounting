"use client";

interface Props {
  excelHref: string;
  labels: { excel: string; print: string };
}

export function ExportButtons({ excelHref, labels }: Props) {
  return (
    <div className="flex items-center gap-2">
      <a
        href={excelHref}
        className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 focus:outline-none focus:ring-4 focus:ring-emerald-200/70"
      >
        <span>📊</span>
        {labels.excel}
      </a>
      <button
        onClick={() => window.print()}
        className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-800 hover:bg-sky-100 focus:outline-none focus:ring-4 focus:ring-emerald-200/70"
      >
        <span>🖨️</span>
        {labels.print}
      </button>
    </div>
  );
}

