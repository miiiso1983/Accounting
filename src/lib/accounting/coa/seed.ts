import type { PrismaClient } from "../../../generated/prisma/client";
import type { CoaNode } from "./types";

type SeedArgs = {
  prisma: PrismaClient;
  companyId: string;
  roots: CoaNode[];
};

export async function seedCompanyChartOfAccounts({ prisma, companyId, roots }: SeedArgs) {
  for (const root of roots) {
    await upsertNode(prisma, companyId, root, null);
  }
}

async function upsertNode(prisma: PrismaClient, companyId: string, node: CoaNode, parentId: string | null) {
  const account = await prisma.glAccount.upsert({
    where: { companyId_code: { companyId, code: node.code } },
    update: {
      name: node.name,
      type: node.type,
      normalBalance: node.normalBalance,
      isPosting: node.isPosting,
      currencyCode: node.currencyCode ?? null,
      parentId,
    },
    create: {
      companyId,
      code: node.code,
      name: node.name,
      type: node.type,
      normalBalance: node.normalBalance,
      isPosting: node.isPosting,
      currencyCode: node.currencyCode ?? null,
      parentId,
    },
  });

  const children = node.children ?? [];
  for (const child of children) {
    await upsertNode(prisma, companyId, child, account.id);
  }
}
