import type { Locale } from "./index";

export type Messages = Record<string, unknown>;

const en: Messages = {
  common: {
    appName: "Accounting",
    dashboard: "Dashboard",
    signedInAs: "Signed in as {email}",
  },
  nav: {
    overview: "Overview",
    coa: "Chart of Accounts",
    journal: "Journal",
    customers: "Customers",
    invoices: "Invoices",
    signOut: "Sign out",
  },
  auth: {
    title: "Sign in",
    subtitle: "Use your email and password to access the dashboard.",
    email: "Email",
    password: "Password",
    signIn: "Sign in",
    signingIn: "Signing in…",
    seedHint: "Don’t have credentials yet? Run the Prisma seed to create the initial admin user.",
    errors: {
      generic: "Unable to sign in. Please try again.",
      invalidCredentials: "Invalid email or password.",
      configuration: "Authentication is not configured correctly. Please contact support.",
    },
  },
  dashboardPage: {
    title: "Overview",
    subtitle: "Quick insights and shortcuts to your accounting workflows.",
    quickActions: "Quick actions",
    open: {
      coa: "Open Chart of Accounts",
      journal: "Create / view journal entries",
      customers: "Manage customers",
      invoices: "Create invoices",
    },
    kpis: {
      statusTitle: "Status",
      statusValue: "Foundation scaffolded",
      statusDesc: "Next: posting engine, invoicing workflow, expenses, and reporting.",
      currenciesTitle: "Currencies",
      currenciesValue: "IQD / USD",
      currenciesDesc: "Exchange rates will be managed per company.",
      activityTitle: "Activity",
      activityValue: "Coming soon",
      activityDesc: "Recent entries, invoices and postings will appear here.",
    },
    chartTitle: "Sample trend (placeholder)",
    chartDesc: "Replace with real KPIs once reporting is enabled.",
  },
  language: {
    switchToArabic: "العربية",
    switchToEnglish: "English",
  },
};

const ar: Messages = {
  common: {
    appName: "المحاسبة",
    dashboard: "لوحة التحكم",
    signedInAs: "تم تسجيل الدخول باسم {email}",
  },
  nav: {
    overview: "نظرة عامة",
    coa: "دليل الحسابات",
    journal: "القيود",
    customers: "العملاء",
    invoices: "الفواتير",
    signOut: "تسجيل الخروج",
  },
  auth: {
    title: "تسجيل الدخول",
    subtitle: "استخدم بريدك الإلكتروني وكلمة المرور للدخول إلى لوحة التحكم.",
    email: "البريد الإلكتروني",
    password: "كلمة المرور",
    signIn: "دخول",
    signingIn: "جاري تسجيل الدخول…",
    seedHint: "لا تملك بيانات دخول؟ شغّل Prisma seed لإنشاء مستخدم المدير لأول مرة.",
    errors: {
      generic: "تعذّر تسجيل الدخول. حاول مرة أخرى.",
      invalidCredentials: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
      configuration: "إعدادات المصادقة غير صحيحة. يرجى التواصل مع الدعم.",
    },
  },
  dashboardPage: {
    title: "نظرة عامة",
    subtitle: "ملخص سريع وروابط مختصرة للمهام المحاسبية.",
    quickActions: "إجراءات سريعة",
    open: {
      coa: "فتح دليل الحسابات",
      journal: "إنشاء/عرض القيود",
      customers: "إدارة العملاء",
      invoices: "إنشاء الفواتير",
    },
    kpis: {
      statusTitle: "الحالة",
      statusValue: "تم تجهيز الأساسيات",
      statusDesc: "التالي: محرك الترحيل، دورة الفواتير، المصروفات، والتقارير.",
      currenciesTitle: "العملات",
      currenciesValue: "IQD / USD",
      currenciesDesc: "سيتم إدارة أسعار الصرف لكل شركة.",
      activityTitle: "النشاط",
      activityValue: "قريباً",
      activityDesc: "ستظهر هنا أحدث القيود والفواتير والترحيلات.",
    },
    chartTitle: "اتجاه تجريبي (مؤقت)",
    chartDesc: "سيتم استبداله بمؤشرات حقيقية عند تفعيل التقارير.",
  },
  language: {
    switchToArabic: "العربية",
    switchToEnglish: "English",
  },
};

export function getMessages(locale: Locale): Messages {
  return locale === "ar" ? ar : en;
}
