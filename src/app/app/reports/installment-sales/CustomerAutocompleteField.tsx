"use client";

import { useMemo, useState } from "react";

type CustomerOption = { id: string; name: string };

export function CustomerAutocompleteField(props: {
  customers: CustomerOption[];
  name: string;
  defaultCustomerId?: string;
  placeholder: string;
  noResultsLabel: string;
  clearLabel: string;
}) {
  const { customers, name, defaultCustomerId, placeholder, noResultsLabel, clearLabel } = props;

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
    return list.slice(0, 50);
  }, [customers, query]);

  return (
    <div className="relative mt-1">
      <input type="hidden" name={name} value={selectedId} />

      <div className="relative">
        <input
          className="w-full rounded-xl border bg-white px-3 py-2 pr-9 text-sm"
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedId("");
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && open && query.trim()) {
              e.preventDefault();
              const first = filtered[0];
              if (first) {
                setSelectedId(first.id);
                setQuery(first.name);
                setOpen(false);
              }
            }
          }}
        />
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-50"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setQuery("");
            setSelectedId("");
            setOpen(true);
          }}
          aria-label={clearLabel}
          title={clearLabel}
        >
          ×
        </button>
      </div>

      {open ? (
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
                  setSelectedId(c.id);
                  setQuery(c.name);
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
