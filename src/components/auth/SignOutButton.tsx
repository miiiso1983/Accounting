"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { useTransition } from "react";

import { useI18n } from "@/components/i18n/I18nProvider";

export function SignOutButton({ className }: { className?: string }) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() => startTransition(() => signOut({ callbackUrl: "/login" }))}
      disabled={pending}
      className={
        className ??
        "inline-flex items-center gap-2 rounded-2xl bg-white/80 px-3 py-2 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200/70 shadow-sm transition hover:bg-white focus:outline-none focus:ring-4 focus:ring-sky-100 disabled:opacity-60"
      }
      aria-label={t("nav.signOut")}
    >
      <LogOut className="h-4 w-4 text-zinc-500" aria-hidden />
      <span>{t("nav.signOut")}</span>
    </button>
  );
}
