export const PERMISSIONS = {
  // Admin
  ADMIN_ALL: "admin:all",

  // User management
  USERS_READ: "users:read",
  USERS_WRITE: "users:write",

  // Accounting core
  COA_READ: "coa:read",
  COA_WRITE: "coa:write",
  JOURNAL_READ: "journal:read",
  JOURNAL_WRITE: "journal:write",
  REPORTS_READ: "reports:read",

  // Invoices
  INVOICE_READ: "invoice:read",
  INVOICE_WRITE: "invoice:write",
  INVOICE_SEND: "invoice:send",

  // Invoice payments / receipts
  INVOICE_PAYMENT_READ: "invoice_payment:read",
  INVOICE_PAYMENT_WRITE: "invoice_payment:write",

  // Estimates
  ESTIMATE_READ: "estimate:read",
  ESTIMATE_WRITE: "estimate:write",

  // Credit Notes
  CREDIT_NOTE_READ: "credit_note:read",
  CREDIT_NOTE_WRITE: "credit_note:write",

  // Expenses
  EXPENSE_READ: "expense:read",
  EXPENSE_WRITE: "expense:write",
  EXPENSE_APPROVE: "expense:approve",

  // Attachments
  ATTACHMENT_READ: "attachment:read",
  ATTACHMENT_WRITE: "attachment:write",

  // Cost centers
  COST_CENTERS_READ: "cost_centers:read",
  COST_CENTERS_WRITE: "cost_centers:write",

  // Branches
  BRANCHES_READ: "branches:read",
  BRANCHES_WRITE: "branches:write",

  // General settings
  SETTINGS_WRITE: "settings:write",

  // Sales representatives
  SALES_REP_READ: "sales_rep:read",
  SALES_REP_WRITE: "sales_rep:write",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
