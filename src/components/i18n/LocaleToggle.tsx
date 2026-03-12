"use client";

import { Globe } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import type { Locale } from "@/lib/i18n";
import { useI18n } from "./I18nProvider";

export function LocaleToggle({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { t } = useI18n();

  const nextLocale: Locale = locale === "ar" ? "en" : "ar";
  const label = locale === "ar" ? t("language.switchToEnglish") : t("language.switchToArabic");

  return (
    <button
      type="button"
      onClick={() =>
        startTransition(() => {
          document.cookie = `locale=${nextLocale}; Path=/; Max-Age=31536000; SameSite=Lax`;
          router.refresh();
        })
      }
	      className="inline-flex items-center gap-2 rounded-2xl bg-white/80 px-3 py-2 text-xs font-medium text-zinc-700 ring-1 ring-sky-200/70 shadow-sm transition hover:bg-white focus:outline-none focus:ring-4 focus:ring-emerald-200/70 disabled:opacity-60"
      disabled={pending}
      aria-label={label}
    >
	      <Globe className="h-4 w-4 text-sky-700" aria-hidden />
      <span>{label}</span>
    </button>
  );
}
