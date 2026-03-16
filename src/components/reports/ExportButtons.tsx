"use client";

interface Props {
  excelHref: string;
  labels: { excel: string; print: string };
  visibleColumns?: string[];
}

export function ExportButtons({ excelHref, labels, visibleColumns }: Props) {
  let href = excelHref;
  if (visibleColumns && visibleColumns.length > 0) {
    const sep = href.includes("?") ? "&" : "?";
    href = `${href}${sep}columns=${encodeURIComponent(visibleColumns.join(","))}`;
  }

  return (
    <div className="flex items-center gap-2">
      <a
        href={href}
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

