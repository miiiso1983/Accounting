"use client";

import { useState, useRef, useEffect } from "react";
import type { ColumnDef } from "@/hooks/useColumnVisibility";

interface Props {
  columns: ColumnDef[];
  visibility: Record<string, boolean>;
  onToggle: (key: string) => void;
}

export function ColumnSelector({ columns, visibility, onToggle }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-4 focus:ring-zinc-200/70"
      >
        <span>⚙️</span>
        Columns / الأعمدة
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-xl border border-zinc-200 bg-white p-2 shadow-lg">
          <div className="text-xs font-medium text-zinc-500 px-2 py-1 mb-1">Show/Hide Columns / إظهار/إخفاء</div>
          {columns.map((col) => (
            <label
              key={col.key}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={visibility[col.key] !== false}
                onChange={() => onToggle(col.key)}
                className="rounded border-zinc-300 text-sky-600 focus:ring-sky-500"
              />
              {col.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

