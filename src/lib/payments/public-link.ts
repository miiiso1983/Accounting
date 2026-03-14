import { createHmac, timingSafeEqual } from "node:crypto";

import { getAppBaseUrl } from "@/lib/invoices/public-link";

function getReceiptLinkSecret() {
  return (
    process.env.PAYMENT_RECEIPT_PUBLIC_TOKEN_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH_SECRET ||
    `${getAppBaseUrl()}:payment-receipt-public-link`
  );
}

function createReceiptAccessToken(paymentId: string) {
  return createHmac("sha256", getReceiptLinkSecret()).update(`receipt:${paymentId}`).digest("base64url");
}

export function buildPublicReceiptUrl(paymentId: string) {
  const url = new URL(`/receipt/${paymentId}`, getAppBaseUrl());
  url.searchParams.set("access", createReceiptAccessToken(paymentId));
  return url.toString();
}

export function hasValidPublicReceiptAccess(paymentId: string, accessToken: string | null | undefined) {
  if (!accessToken) return false;

  const received = accessToken.trim();
  const expected = createReceiptAccessToken(paymentId);
  if (received.length !== expected.length) return false;

  return timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}
