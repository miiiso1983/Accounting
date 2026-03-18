import test from "node:test";
import assert from "node:assert/strict";

import {
  deriveJournalEntryType,
  formatJournalEntryNumber,
  getJournalEntryTypeLabel,
  getJournalSourceHref,
  getJournalSourceLabel,
  isPaymentReferenceType,
} from "./utils";

test("deriveJournalEntryType distinguishes manual and system entries", () => {
  assert.equal(deriveJournalEntryType(null), "MANUAL");
  assert.equal(deriveJournalEntryType(undefined), "MANUAL");
  assert.equal(deriveJournalEntryType("INVOICE"), "SYSTEM");
});

test("formatJournalEntryNumber uses separate prefixes", () => {
  assert.equal(formatJournalEntryNumber(7, "MANUAL"), "ME-007");
  assert.equal(formatJournalEntryNumber(12, "SYSTEM"), "JE-012");
});

test("payment references are normalized for labels and source links", () => {
  assert.equal(isPaymentReferenceType("PAYMENT"), true);
  assert.equal(isPaymentReferenceType("INVOICE_PAYMENT"), true);
  assert.equal(getJournalSourceLabel("INVOICE_PAYMENT"), "سند قبض / Payment");
  assert.equal(getJournalSourceHref({ referenceType: "INVOICE_PAYMENT", paymentInvoiceId: "inv_1" }), "/app/invoices/inv_1");
  assert.equal(getJournalSourceHref({ referenceType: "FUND_TRANSFER" }), "/app/transfers");
});

test("type labels stay user-facing", () => {
  assert.match(getJournalEntryTypeLabel("MANUAL"), /Manual Journal Entry/);
  assert.match(getJournalEntryTypeLabel("SYSTEM"), /System Journal Entry/);
});