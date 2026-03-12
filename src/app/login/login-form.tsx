"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, ArrowRight, Eye, EyeOff, Lock, Mail, ShieldCheck } from "lucide-react";

import { LocaleToggle } from "@/components/i18n/LocaleToggle";
import { useI18n } from "@/components/i18n/I18nProvider";

const loginSchema = z.object({
  email: z.string().trim().email("Please enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginForm({ initialErrorCode }: { initialErrorCode: string | null }) {
  const { locale, t } = useI18n();
  const router = useRouter();

  function mapAuthError(code: string | null): string {
    if (!code) return t("auth.errors.generic");
    if (code === "CredentialsSignin") return t("auth.errors.invalidCredentials");
    if (code === "Configuration") return t("auth.errors.configuration");
    return t("auth.errors.generic");
  }

  const [serverError, setServerError] = useState<string | null>(() =>
    initialErrorCode ? mapAuthError(initialErrorCode) : null,
  );
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
    mode: "onTouched",
  });

  async function onSubmit(values: LoginFormValues) {
    setServerError(null);
    const res = await signIn("credentials", {
      email: values.email,
      password: values.password,
      redirect: false,
      callbackUrl: "/app/dashboard",
    });

    if (res?.error) {
      setServerError(mapAuthError(res.error));
      return;
    }

    router.push(res?.url ?? "/app/dashboard");
    router.refresh();
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-zinc-50 via-white to-sky-50 flex items-center justify-center p-6">
      <div className="pointer-events-none absolute -left-28 -top-28 h-72 w-72 rounded-full bg-indigo-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 -top-20 h-72 w-72 rounded-full bg-sky-400/20 blur-3xl" />

      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-indigo-600 to-sky-600 text-white shadow-sm">
              <ShieldCheck className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <div className="text-xs font-medium text-zinc-500">{t("common.appName")}</div>
              <h1 className="text-xl font-semibold tracking-tight text-zinc-900">{t("auth.title")}</h1>
            </div>
          </div>

          <LocaleToggle locale={locale} />
        </div>

        <div className="rounded-3xl border border-zinc-200/70 bg-white/85 p-7 shadow-xl shadow-sky-100/60 backdrop-blur ring-1 ring-zinc-200/40">
          <p className="text-sm text-zinc-600">{t("auth.subtitle")}</p>

          {serverError ? (
            <div className="mt-4 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <AlertCircle className="mt-0.5 h-4 w-4" aria-hidden />
              <div>{serverError}</div>
            </div>
          ) : null}

          <form className="mt-5 space-y-4" onSubmit={handleSubmit(onSubmit)}>
            <div>
              <label className="text-sm font-medium text-zinc-800">{t("auth.email")}</label>
              <div className="relative mt-1">
                <Mail className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
                <input
                  className="w-full rounded-2xl border border-zinc-200 bg-white py-2.5 ps-10 pe-3 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100 text-start"
                  type="email"
                  autoComplete="email"
                  placeholder="admin@accounting.com"
                  {...register("email")}
                />
              </div>
              {errors.email ? <p className="mt-1 text-xs text-red-600">{errors.email.message}</p> : null}
            </div>

            <div>
              <label className="text-sm font-medium text-zinc-800">{t("auth.password")}</label>
              <div className="relative mt-1">
                <Lock className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
                <input
                  className="w-full rounded-2xl border border-zinc-200 bg-white py-2.5 ps-10 pe-12 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100 text-start"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute end-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-700 focus:outline-none focus:ring-4 focus:ring-sky-100"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password ? <p className="mt-1 text-xs text-red-600">{errors.password.message}</p> : null}
            </div>

            <button
              className="group inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-sky-600 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:from-indigo-500 hover:to-sky-500 focus:outline-none focus:ring-4 focus:ring-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? t("auth.signingIn") : t("auth.signIn")}
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
            </button>
          </form>

          <div className="mt-6 rounded-2xl bg-zinc-50 px-4 py-3 text-xs text-zinc-600">
            {t("auth.seedHint")}
          </div>
        </div>
      </div>
    </div>
  );
}
