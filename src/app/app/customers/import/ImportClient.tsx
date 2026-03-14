"use client";

import { useRef, useState } from "react";

interface Props {
  labels: {
    title: string;
    subtitle: string;
    downloadTemplate: string;
    upload: string;
    importing: string;
    success: string;
    errorRows: string;
    dropzone: string;
  };
}

export function ImportClient({ labels }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imported: number; errors: Array<{ row: number; error: string }> } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/customers/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Import failed");
      } else {
        setResult(data);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            window.location.href = "/api/customers/import";
          }}
          className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-sky-50 focus:outline-none focus:ring-4 focus:ring-emerald-200/70"
        >
          ↓ {labels.downloadTemplate}
        </button>
      </div>

      <div
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-sky-200 bg-sky-50/40 px-6 py-10 text-center transition hover:bg-sky-50/80"
      >
        <div className="text-3xl text-sky-400">📂</div>
        <div className="mt-2 text-sm font-medium text-zinc-700">{labels.dropzone}</div>
        <div className="mt-1 text-xs text-zinc-500">.xlsx · .csv</div>
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onInputChange} />
      </div>

      {loading && (
        <div className="rounded-2xl border border-sky-100 bg-white p-4 text-sm text-zinc-600">
          {labels.importing}
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {result && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 space-y-2">
          <div className="text-sm font-medium text-emerald-800">
            {labels.success.replace("{count}", String(result.imported))}
          </div>
          {result.errors.length > 0 && (
            <div>
              <div className="text-xs font-medium text-red-700">
                {labels.errorRows.replace("{count}", String(result.errors.length))}
              </div>
              <ul className="mt-1 max-h-40 overflow-y-auto text-xs text-red-600">
                {result.errors.map((e, i) => (
                  <li key={i}>Row {e.row}: {e.error}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

