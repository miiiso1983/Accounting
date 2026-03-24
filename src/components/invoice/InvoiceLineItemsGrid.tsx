"use client";

import { useCallback, useRef, useState } from "react";

type ProductOption = { id: string; name: string; description: string | null; unitPrice: string; currencyCode: string; costCenterId: string | null };
type CostCenterOption = { id: string; code: string; name: string };

export type GridProps = {
  fields: { id: string }[];
  register: (name: string) => Record<string, unknown>;
  setValue: (name: string, value: string) => void;
  products: ProductOption[];
  costCenters: CostCenterOption[];
  errors: Record<string, unknown> | undefined;
  lineTotals: number[];
  fmtNum: (n: number) => string;
  onAppend: () => void;
  onRemove: (index: number) => void;
  canRemove: boolean;
};

const COL_LABELS_WITH_PROD = ["منتج", "الوصف", "مركز كلفة", "الكمية", "السعر", "خصم", "ق.خصم", "ضريبة", "الإجمالي", ""];
const COL_LABELS_NO_PROD   = [        "الوصف", "مركز كلفة", "الكمية", "السعر", "خصم", "ق.خصم", "ضريبة", "الإجمالي", ""];
const INIT_W_WITH_PROD = [140, 180, 140, 70, 90, 70, 70, 70, 90, 40];
const INIT_W_NO_PROD   = [     180, 140, 70, 90, 70, 70, 70, 90, 40];

let _canvas: HTMLCanvasElement | null = null;
function measureText(text: string, font = "14px monospace"): number {
  if (typeof document === "undefined") return 80;
  if (!_canvas) _canvas = document.createElement("canvas");
  const ctx = _canvas.getContext("2d")!;
  ctx.font = font;
  return Math.ceil(ctx.measureText(text).width) + 24;
}

export function InvoiceLineItemsGrid({ fields, register, setValue, products, costCenters, errors, lineTotals, fmtNum, onAppend, onRemove, canRemove }: GridProps) {
  const tableRef = useRef<HTMLTableElement>(null);
  const hasProducts = products.length > 0;
  const labels = hasProducts ? COL_LABELS_WITH_PROD : COL_LABELS_NO_PROD;
  const [widths, setWidths] = useState<number[]>(() => hasProducts ? [...INIT_W_WITH_PROD] : [...INIT_W_NO_PROD]);

  const resizing = useRef<{ col: number; startX: number; startW: number } | null>(null);

  const onResizeStart = useCallback((col: number, e: React.MouseEvent) => {
    e.preventDefault();
    resizing.current = { col, startX: e.clientX, startW: widths[col] };
    const onMove = (ev: MouseEvent) => {
      if (!resizing.current) return;
      const newW = Math.max(40, resizing.current.startW + (ev.clientX - resizing.current.startX));
      setWidths(p => { const n = [...p]; n[resizing.current!.col] = newW; return n; });
    };
    const onUp = () => { resizing.current = null; document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [widths]);

  const onAutoFit = useCallback((col: number) => {
    if (!tableRef.current) return;
    let maxW = measureText(labels[col] || "", "13px sans-serif");
    tableRef.current.querySelectorAll("tbody tr").forEach(row => {
      const cell = row.children[col] as HTMLTableCellElement | undefined;
      if (!cell) return;
      const el = cell.querySelector("input,select,span") as HTMLElement | null;
      const txt = (el as HTMLInputElement)?.value || el?.textContent || "";
      if (txt) maxW = Math.max(maxW, measureText(txt));
    });
    setWidths(p => { const n = [...p]; n[col] = Math.max(40, maxW); return n; });
  }, [labels]);

  const handleInput = useCallback((col: number, value: string) => {
    const needed = measureText(value);
    setWidths(p => { if (p[col] >= needed) return p; const n = [...p]; n[col] = needed; return n; });
  }, []);

  const autoSelect = useCallback((e: React.FocusEvent<HTMLInputElement>) => { e.target.select(); }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const errs = errors as any;

	  return (
	    <div className="min-w-0 rounded-2xl border border-zinc-200 bg-zinc-50/30 p-4 md:p-5">
      <div className="flex items-center justify-between gap-4 mb-3">
        <div className="text-sm font-medium text-zinc-900">Line items / بنود الفاتورة</div>
        <button type="button" className="shrink-0 rounded-xl border px-3 py-2 text-sm hover:bg-zinc-50" onClick={onAppend}>Add line / إضافة بند</button>
      </div>
	      <div className="w-full min-w-0 max-w-full overflow-x-auto">
        <table ref={tableRef} className="border-collapse" style={{ tableLayout: "fixed", minWidth: hasProducts ? 960 : 820 }}>
          <colgroup>{widths.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
          <thead>
            <tr className="border-b border-zinc-200">
              {labels.map((l, i) => (
                <th key={i} className="relative px-2 py-2 text-xs font-medium text-zinc-500 text-start select-none whitespace-nowrap">
                  {l}
                  {i < labels.length - 1 && (
                    <div className="absolute top-0 inset-e-0 h-full w-1.5 cursor-col-resize hover:bg-sky-300 active:bg-sky-400 z-10"
                      onMouseDown={e => onResizeStart(i, e)} onDoubleClick={() => onAutoFit(i)} />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fields.map((f, idx) => {
              const pIdx = hasProducts ? 1 : 0;
              return (
                <tr key={f.id} className="border-b border-zinc-100 hover:bg-zinc-50/50 group">
                  {hasProducts && <GridProductCell idx={idx} products={products} costCenters={costCenters} setValue={setValue} />}
                  <td className="px-2 py-1.5"><input className="w-full border-0 bg-transparent px-1 py-1.5 text-sm focus:ring-1 focus:ring-sky-300 rounded" placeholder="الوصف" {...register(`lines.${idx}.description`)} onFocus={autoSelect} onInput={e => handleInput(pIdx, (e.target as HTMLInputElement).value)} />{errs?.lines?.[idx]?.description && <div className="text-[10px] text-red-600">مطلوب</div>}</td>
                  <td className="px-2 py-1.5"><select className="w-full border-0 bg-transparent px-1 py-1.5 text-sm focus:ring-1 focus:ring-sky-300 rounded" {...register(`lines.${idx}.costCenterId`)}><option value="">—</option>{costCenters.map(cc => <option key={cc.id} value={cc.id}>{cc.code} — {cc.name}</option>)}</select></td>
                  <td className="px-2 py-1.5"><input className="w-full border-0 bg-transparent px-1 py-1.5 font-mono text-sm focus:ring-1 focus:ring-sky-300 rounded text-end" inputMode="decimal" placeholder="1" {...register(`lines.${idx}.quantity`)} onFocus={autoSelect} onInput={e => handleInput(pIdx + 2, (e.target as HTMLInputElement).value)} /></td>
                  <td className="px-2 py-1.5"><input className="w-full border-0 bg-transparent px-1 py-1.5 font-mono text-sm focus:ring-1 focus:ring-sky-300 rounded text-end" inputMode="decimal" placeholder="0" {...register(`lines.${idx}.unitPrice`)} onFocus={autoSelect} onInput={e => handleInput(pIdx + 3, (e.target as HTMLInputElement).value)} /></td>
                  <td className="px-2 py-1.5"><select className="w-full border-0 bg-transparent px-1 py-1.5 text-xs focus:ring-1 focus:ring-sky-300 rounded" {...register(`lines.${idx}.discountType`)}><option value="">—</option><option value="PERCENTAGE">%</option><option value="FIXED">ثابت</option></select></td>
                  <td className="px-2 py-1.5"><input className="w-full border-0 bg-transparent px-1 py-1.5 font-mono text-sm focus:ring-1 focus:ring-sky-300 rounded text-end" inputMode="decimal" placeholder="0" {...register(`lines.${idx}.discountValue`)} onFocus={autoSelect} onInput={e => handleInput(pIdx + 5, (e.target as HTMLInputElement).value)} /></td>
                  <td className="px-2 py-1.5"><input className="w-full border-0 bg-transparent px-1 py-1.5 font-mono text-sm focus:ring-1 focus:ring-sky-300 rounded text-end" inputMode="decimal" placeholder="0" {...register(`lines.${idx}.taxRate`)} onFocus={autoSelect} onInput={e => handleInput(pIdx + 6, (e.target as HTMLInputElement).value)} /></td>
                  <td className="px-2 py-1.5 text-end"><span className="font-mono text-sm font-medium text-zinc-900">{fmtNum(lineTotals[idx] ?? 0)}</span></td>
                  <td className="px-2 py-1.5 text-center"><button type="button" className="text-sm text-zinc-400 hover:text-red-500 disabled:opacity-30" onClick={() => onRemove(idx)} disabled={!canRemove} title="حذف">×</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 text-xs text-zinc-500">Tax rate example: 0.15 (15%). Leave blank for 0. / مثال ضريبة: 0.15 (15%)</div>
    </div>
  );
}

function GridProductCell({ idx, products, costCenters, setValue }: { idx: number; products: ProductOption[]; costCenters: CostCenterOption[]; setValue: (n: string, v: string) => void }) {
  return (
    <td className="px-2 py-1.5">
      <select className="w-full border-0 bg-transparent px-1 py-1.5 text-sm focus:ring-1 focus:ring-sky-300 rounded" defaultValue=""
        onChange={e => { const p = products.find(x => x.id === e.target.value); if (p) { setValue(`lines.${idx}.description`, p.description || p.name); setValue(`lines.${idx}.unitPrice`, p.unitPrice); setValue(`lines.${idx}.costCenterId`, p.costCenterId && costCenters.some(cc => cc.id === p.costCenterId) ? p.costCenterId : ""); } }}>
        <option value="">— منتج —</option>
        {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </td>
  );
}

