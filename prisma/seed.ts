import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PERMISSIONS } from "../src/lib/rbac/permissions";
import { seedCompanyChartOfAccounts } from "../src/lib/accounting/coa/seed";
import { IRAQ_UASC_COA_STARTER } from "../src/lib/accounting/coa/iraq-uasc";

const prisma = new PrismaClient();

async function main() {
  const company = await prisma.company.upsert({
    where: { id: "single-company" },
    update: {},
    create: { id: "single-company", name: "My Company", baseCurrencyCode: "IQD", secondaryCurrency: "USD" },
  });

	// Seed a starter Chart of Accounts (idempotent)
	await seedCompanyChartOfAccounts({ prisma, companyId: company.id, roots: IRAQ_UASC_COA_STARTER });

  const perms = Object.values(PERMISSIONS);
  for (const key of perms) {
    await prisma.permission.upsert({ where: { key }, update: {}, create: { key } });
  }

  const superAdmin = await prisma.role.upsert({
    where: { key: "SUPER_ADMIN" },
    update: {},
    create: { key: "SUPER_ADMIN", name: "Super Admin" },
  });

  // Give SUPER_ADMIN admin:all (and keep other permissions available for future roles)
  const adminAll = await prisma.permission.findUnique({ where: { key: PERMISSIONS.ADMIN_ALL } });
  if (adminAll) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: superAdmin.id, permissionId: adminAll.id } },
      update: {},
      create: { roleId: superAdmin.id, permissionId: adminAll.id },
    });
  }

  const email = (process.env.INITIAL_ADMIN_EMAIL ?? "admin@example.com").toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD ?? "ChangeMe123!";
  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: { companyId: company.id },
    create: { email, name: "Admin", passwordHash, companyId: company.id },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: superAdmin.id } },
    update: {},
    create: { userId: user.id, roleId: superAdmin.id },
  });
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
