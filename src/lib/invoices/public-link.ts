import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_BASE_URL = "https://phpstack-1510634-6273369.cloudwaysapps.com";

function getInvoiceLinkSecret() {
  return (
    process.env.INVOICE_PUBLIC_TOKEN_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH_SECRET ||
    `${getAppBaseUrl()}:invoice-public-link`
  );
}

export function getAppBaseUrl() {
  return (process.env.NEXTAUTH_URL || process.env.APP_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function createInvoiceAccessToken(invoiceId: string) {
  return createHmac("sha256", getInvoiceLinkSecret()).update(`invoice:${invoiceId}`).digest("base64url");
}

export function buildPublicInvoiceUrl(invoiceId: string) {
  const url = new URL(`/invoice/${invoiceId}`, getAppBaseUrl());
  url.searchParams.set("access", createInvoiceAccessToken(invoiceId));
  return url.toString();
}

export function hasValidPublicInvoiceAccess(invoiceId: string, accessToken: string | null | undefined) {
  if (!accessToken) return false;

  const received = accessToken.trim();
  const expected = createInvoiceAccessToken(invoiceId);
  if (received.length !== expected.length) return false;

  return timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}