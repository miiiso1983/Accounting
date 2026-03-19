"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="inline-flex items-center gap-2 rounded-2xl bg-white/80 px-3 py-2 text-xs font-medium text-zinc-700 ring-1 ring-sky-200/70 shadow-sm transition hover:bg-white focus:outline-none focus:ring-4 focus:ring-emerald-200/70 disabled:opacity-60"
      aria-label={theme === "light" ? "الوضع الليلي" : "الوضع النهاري"}
    >
      {theme === "light" ? (
        <Moon className="h-4 w-4 text-sky-700" aria-hidden />
      ) : (
        <Sun className="h-4 w-4 text-sky-700" aria-hidden />
      )}
    </button>
  );
}

