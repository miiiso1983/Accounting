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
    subtitle: "Use your admin email and password to access the dashboard.",
    marketingTitle: "Financial clarity, built in",
    marketingSubtitle: "Modern accounting workflows with a clean interface, designed to work equally well in English and Arabic (RTL).",
    backToHome: "Back to home",
    securityNote: "Secure sign-in",
    email: "Email",
    password: "Password",
    signIn: "Sign in",
    signingIn: "Signing in…",
    showPassword: "Show password",
    hidePassword: "Hide password",
    seedHint: "Don’t have credentials yet? Run the Prisma seed to create the initial admin user.",
    validation: {
      emailInvalid: "Please enter a valid email",
      passwordRequired: "Password is required",
    },
    features: {
      coa: {
        title: "Chart of accounts",
        desc: "A structured COA ready for daily bookkeeping.",
      },
      journal: {
        title: "Journal entries",
        desc: "Draft, post, and keep an auditable trail.",
      },
      invoices: {
        title: "Invoices & customers",
        desc: "Create invoices and track receivables.",
      },
    },
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
    viewAll: "View all",
    total: "Total",
    journalEntry: "Journal entry",
    noDescription: "No description",
    meta: {
      company: "Company: {name}",
      periodThisMonth: "This month",
    },
    empty: {
      noCompanyTitle: "No company assigned",
      noCompanyDesc: "Your user does not have a company yet. Please assign a company and try again.",
      noInvoices: "No invoices yet.",
      noEntries: "No journal entries yet.",
    },
    stats: {
      salesThisMonth: "Sales (this month)",
      salesThisMonthDesc: "Based on issued invoices.",
      receivables: "Outstanding receivables",
      receivablesDesc: "Invoices that are sent or overdue.",
      postedEntries: "Posted entries",
      postedEntriesDesc: "Journal entries with POSTED status.",
      customers: "Customers",
      customersDesc: "Active customer records.",
    },
    recentInvoices: "Recent invoices",
    recentInvoicesDesc: "Latest issued invoices.",
    recentEntries: "Recent journal entries",
    recentEntriesDesc: "Latest entries created in the system.",
    mini: {
      accountsTitle: "Accounts",
      accountsDesc: "Total accounts in your chart of accounts.",
      invoicesTitle: "Invoices",
      invoicesDesc: "Total invoices created for the company.",
    },
    open: {
      coa: "Open Chart of Accounts",
      journal: "Create / view journal entries",
      customers: "Manage customers",
      invoices: "Create invoices",
    },
    chartTitle: "Sales trend (last 6 months)",
    chartDesc: "A quick visual of invoice totals over time.",
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
    subtitle: "استخدم بريد المدير الإلكتروني وكلمة المرور للدخول إلى لوحة التحكم.",
    marketingTitle: "وضوح مالي، بواجهة حديثة",
    marketingSubtitle: "مهام محاسبية أساسية بواجهة نظيفة تدعم الإنجليزية والعربية (RTL) بشكل كامل.",
    backToHome: "العودة للرئيسية",
    securityNote: "تسجيل دخول آمن",
    email: "البريد الإلكتروني",
    password: "كلمة المرور",
    signIn: "دخول",
    signingIn: "جاري تسجيل الدخول…",
    showPassword: "إظهار كلمة المرور",
    hidePassword: "إخفاء كلمة المرور",
    seedHint: "لا تملك بيانات دخول؟ شغّل Prisma seed لإنشاء مستخدم المدير لأول مرة.",
    validation: {
      emailInvalid: "يرجى إدخال بريد إلكتروني صحيح",
      passwordRequired: "كلمة المرور مطلوبة",
    },
    features: {
      coa: {
        title: "دليل الحسابات",
        desc: "هيكل حسابات جاهز للعمل اليومي.",
      },
      journal: {
        title: "القيود اليومية",
        desc: "مسودة/ترحيل مع سجل تدقيق واضح.",
      },
      invoices: {
        title: "الفواتير والعملاء",
        desc: "إنشاء فواتير ومتابعة الذمم.",
      },
    },
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
    viewAll: "عرض الكل",
    total: "الإجمالي",
    journalEntry: "قيد",
    noDescription: "بدون وصف",
    meta: {
      company: "الشركة: {name}",
      periodThisMonth: "هذا الشهر",
    },
    empty: {
      noCompanyTitle: "لا توجد شركة مرتبطة",
      noCompanyDesc: "حساب المستخدم غير مرتبط بشركة. يرجى ربط شركة ثم المحاولة مرة أخرى.",
      noInvoices: "لا توجد فواتير بعد.",
      noEntries: "لا توجد قيود بعد.",
    },
    stats: {
      salesThisMonth: "المبيعات (هذا الشهر)",
      salesThisMonthDesc: "بناءً على الفواتير الصادرة.",
      receivables: "الذمم المستحقة",
      receivablesDesc: "فواتير مُرسلة أو متأخرة.",
      postedEntries: "القيود المُرحّلة",
      postedEntriesDesc: "القيود بحالة POSTED.",
      customers: "العملاء",
      customersDesc: "إجمالي سجلات العملاء.",
    },
    recentInvoices: "أحدث الفواتير",
    recentInvoicesDesc: "آخر الفواتير الصادرة.",
    recentEntries: "أحدث القيود",
    recentEntriesDesc: "آخر القيود المُضافة للنظام.",
    mini: {
      accountsTitle: "الحسابات",
      accountsDesc: "إجمالي الحسابات ضمن دليل الحسابات.",
      invoicesTitle: "الفواتير",
      invoicesDesc: "إجمالي الفواتير الخاصة بالشركة.",
    },
    open: {
      coa: "فتح دليل الحسابات",
      journal: "إنشاء/عرض القيود",
      customers: "إدارة العملاء",
      invoices: "إنشاء الفواتير",
    },
    chartTitle: "اتجاه المبيعات (آخر 6 أشهر)",
    chartDesc: "عرض سريع لمجاميع الفواتير عبر الوقت.",
  },
  language: {
    switchToArabic: "العربية",
    switchToEnglish: "English",
  },
};

export function getMessages(locale: Locale): Messages {
  return locale === "ar" ? ar : en;
}
