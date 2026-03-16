"use client";

import { useState, useCallback, useEffect } from "react";

export type ColumnDef = {
  key: string;
  label: string;
  defaultVisible?: boolean;
};

export function useColumnVisibility(storageKey: string, columns: ColumnDef[]) {
  const [visibility, setVisibility] = useState<Record<string, boolean>>(() => {
    const defaults: Record<string, boolean> = {};
    for (const col of columns) {
      defaults[col.key] = col.defaultVisible !== false;
    }
    return defaults;
  });

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, boolean>;
        setVisibility((prev) => {
          const merged = { ...prev };
          for (const key of Object.keys(merged)) {
            if (key in parsed) merged[key] = parsed[key];
          }
          return merged;
        });
      }
    } catch {
      // ignore
    }
  }, [storageKey]);

  const toggle = useCallback(
    (key: string) => {
      setVisibility((prev) => {
        const next = { ...prev, [key]: !prev[key] };
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    },
    [storageKey],
  );

  const isVisible = useCallback((key: string) => visibility[key] !== false, [visibility]);

  const visibleKeys = columns.filter((c) => visibility[c.key] !== false).map((c) => c.key);

  return { visibility, toggle, isVisible, visibleKeys };
}

