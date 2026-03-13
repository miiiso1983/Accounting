import { Prisma } from "@/generated/prisma/client";

export const INTERACTIVE_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 30_000,
} as const;

export function readTransactionErrorMessage(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2028") {
    return "Database transaction timed out. Please try again.";
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unknown error";
}
