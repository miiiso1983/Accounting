"use client";

import { useMemo, useState } from "react";

export type CustomerAutocompleteOption = { id: string; name: string };

export function CustomerAutocompleteField(props: {
  customers: CustomerAutocompleteOption[];
  defaultCustomerId?: string;
  /** If provided, a hidden <input name=...> will be rendered for plain HTML forms */
  name?: string;
  placeholder: string;
  noResultsLabel: string;
  clearLabel: string;
  onSelectedIdChange?: (id: string) => void;
  disabled?: boolean;
  maxResults?: number;
}) {
  const {
    customers,
    defaultCustomerId,
    name,
    placeholder,
    noResultsLabel,
    clearLabel,
    onSelectedIdChange,
    disabled,
    maxResults = 50,
  } = props;

  const defaultCustomer = useMemo(
    () => customers.find((c) => c.id === (defaultCustomerId ?? "")) ?? null,
    [customers, defaultCustomerId],
  );

  const [query, setQuery] = useState(defaultCustomer?.name ?? "");
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(defaultCustomerId ?? "");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? customers.filter((c) => c.name.toLowerCase().includes(q)) : customers;
    return list.slice(0, maxResults);
  }, [customers, query, maxResults]);

  function setSelected(nextId: string, nextLabel?: string) {
    setSelectedId(nextId);
    if (typeof nextLabel === "string") setQuery(nextLabel);
    onSelectedIdChange?.(nextId);
  }

  return (
    <div className="relative mt-1">
      {name ? <input type="hidden" name={name} value={selectedId} /> : null}

      <div className="relative">
        <input
          className="w-full rounded-xl border bg-white px-3 py-2 pr-9 text-sm disabled:bg-zinc-50"
          placeholder={placeholder}
          value={query}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected("", undefined);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && open && query.trim()) {
              e.preventDefault();
              const first = filtered[0];
              if (first) {
                setSelected(first.id, first.name);
                setOpen(false);
              }
            }
          }}
        />

        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-50 disabled:opacity-50"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setQuery("");
            setSelected("", undefined);
            setOpen(true);
          }}
          aria-label={clearLabel}
          title={clearLabel}
          disabled={disabled}
        >
          ×
        </button>
      </div>

      {open && !disabled ? (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border bg-white shadow-sm">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-zinc-500">{noResultsLabel}</div>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-50"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setSelected(c.id, c.name);
                  setOpen(false);
                }}
              >
                {c.name}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
