"use client";

import { useMemo, useState } from "react";

export type AccountAutocompleteOption = { id: string; code: string; name: string };

export function AccountAutocompleteField(props: {
  accounts: AccountAutocompleteOption[];
  defaultAccountId?: string;
  placeholder: string;
  noResultsLabel: string;
  clearLabel: string;
  onSelectedIdChange?: (id: string) => void;
  disabled?: boolean;
  maxResults?: number;
}) {
  const {
    accounts,
    defaultAccountId,
    placeholder,
    noResultsLabel,
    clearLabel,
    onSelectedIdChange,
    disabled,
    maxResults = 50,
  } = props;

  const defaultAccount = useMemo(
    () => accounts.find((a) => a.id === (defaultAccountId ?? "")) ?? null,
    [accounts, defaultAccountId],
  );

  const [query, setQuery] = useState(defaultAccount ? `${defaultAccount.code} — ${defaultAccount.name}` : "");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? accounts.filter((a) => `${a.code} ${a.name}`.toLowerCase().includes(q) || a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q))
      : accounts;
    return list.slice(0, maxResults);
  }, [accounts, query, maxResults]);

  function setSelected(nextId: string, nextLabel?: string) {
    if (typeof nextLabel === "string") setQuery(nextLabel);
    onSelectedIdChange?.(nextId);
  }

  return (
    <div className="relative">
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
                setSelected(first.id, `${first.code} — ${first.name}`);
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
            filtered.map((account) => (
              <button
                key={account.id}
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-50"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setSelected(account.id, `${account.code} — ${account.name}`);
                  setOpen(false);
                }}
              >
                <span className="font-mono text-zinc-700">{account.code}</span>
                <span className="text-zinc-500"> — {account.name}</span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}