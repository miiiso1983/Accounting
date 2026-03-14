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
    update: { name: "شركة التيم لتكنلوجيا المعلومات" },
    create: { id: "single-company", name: "شركة التيم لتكنلوجيا المعلومات", baseCurrencyCode: "IQD", secondaryCurrency: "USD" },
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

	// Starter roles (so the Admin UI has more than SUPER_ADMIN to choose from)
	// These are conservative defaults and can be augmented with direct user permissions.
	const starterRoles = [
		{ key: "ADMIN", name: "مدير" },
		{ key: "ACCOUNTANT", name: "محاسب" },
		{ key: "SALES", name: "مبيعات" },
		{ key: "PURCHASING", name: "مشتريات" },
		{ key: "VIEWER", name: "مشاهدة" },
	] as const;

	const upsertedRoles = await Promise.all(
		starterRoles.map((r) =>
			prisma.role.upsert({
				where: { key: r.key },
				update: { name: r.name },
				create: { key: r.key, name: r.name },
			}),
		),
	);

	const permissionKeysByRole: Record<(typeof starterRoles)[number]["key"], string[]> = {
		ADMIN: [
			PERMISSIONS.USERS_READ,
			PERMISSIONS.USERS_WRITE,
			PERMISSIONS.COA_READ,
			PERMISSIONS.COA_WRITE,
			PERMISSIONS.JOURNAL_READ,
			PERMISSIONS.JOURNAL_WRITE,
			PERMISSIONS.REPORTS_READ,
			PERMISSIONS.INVOICE_READ,
			PERMISSIONS.INVOICE_WRITE,
			PERMISSIONS.INVOICE_SEND,
			PERMISSIONS.EXPENSE_READ,
			PERMISSIONS.EXPENSE_WRITE,
			PERMISSIONS.EXPENSE_APPROVE,
			PERMISSIONS.ATTACHMENT_READ,
			PERMISSIONS.ATTACHMENT_WRITE,
		],
		ACCOUNTANT: [
			PERMISSIONS.COA_READ,
			PERMISSIONS.JOURNAL_READ,
			PERMISSIONS.JOURNAL_WRITE,
			PERMISSIONS.REPORTS_READ,
			PERMISSIONS.INVOICE_READ,
			PERMISSIONS.EXPENSE_READ,
			PERMISSIONS.EXPENSE_WRITE,
			PERMISSIONS.EXPENSE_APPROVE,
			PERMISSIONS.ATTACHMENT_READ,
			PERMISSIONS.ATTACHMENT_WRITE,
		],
		SALES: [
			PERMISSIONS.INVOICE_READ,
			PERMISSIONS.INVOICE_WRITE,
			PERMISSIONS.INVOICE_SEND,
			PERMISSIONS.ATTACHMENT_READ,
			PERMISSIONS.ATTACHMENT_WRITE,
		],
		PURCHASING: [
			PERMISSIONS.EXPENSE_READ,
			PERMISSIONS.EXPENSE_WRITE,
			PERMISSIONS.ATTACHMENT_READ,
			PERMISSIONS.ATTACHMENT_WRITE,
		],
		VIEWER: [
			PERMISSIONS.COA_READ,
			PERMISSIONS.JOURNAL_READ,
			PERMISSIONS.REPORTS_READ,
			PERMISSIONS.INVOICE_READ,
			PERMISSIONS.EXPENSE_READ,
			PERMISSIONS.ATTACHMENT_READ,
		],
	};

	const allPermissions = await prisma.permission.findMany({ select: { id: true, key: true } });
	const permissionIdByKey = new Map(allPermissions.map((p) => [p.key, p.id] as const));

	for (const role of upsertedRoles) {
		const permKeys = permissionKeysByRole[role.key as (typeof starterRoles)[number]["key"]] ?? [];
		for (const permKey of permKeys) {
			const permissionId = permissionIdByKey.get(permKey);
			if (!permissionId) continue;
			await prisma.rolePermission.upsert({
				where: { roleId_permissionId: { roleId: role.id, permissionId } },
				update: {},
				create: { roleId: role.id, permissionId },
			});
		}
	}

  // Give SUPER_ADMIN admin:all (and keep other permissions available for future roles)
  const adminAll = await prisma.permission.findUnique({ where: { key: PERMISSIONS.ADMIN_ALL } });
  if (adminAll) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: superAdmin.id, permissionId: adminAll.id } },
      update: {},
      create: { roleId: superAdmin.id, permissionId: adminAll.id },
    });
  }

	const emailRaw = process.env.INITIAL_ADMIN_EMAIL ?? "admin@example.com";
	const passwordEnv = process.env.INITIAL_ADMIN_PASSWORD;
	const nameEnv = process.env.INITIAL_ADMIN_NAME;

	const email = emailRaw.toLowerCase().trim();
	if (!email) throw new Error("INITIAL_ADMIN_EMAIL is empty");
	if (typeof passwordEnv === "string" && passwordEnv.length === 0) {
		throw new Error("INITIAL_ADMIN_PASSWORD is set but empty");
	}
	if (typeof nameEnv === "string" && nameEnv.length === 0) {
		throw new Error("INITIAL_ADMIN_NAME is set but empty");
	}

	// If you provide INITIAL_ADMIN_PASSWORD explicitly, we will also UPDATE the existing admin user's password.
	// This makes it safe to re-run seed when you need to rotate credentials.
	const shouldUpdatePassword = typeof passwordEnv === "string" && passwordEnv.length > 0;
	const shouldUpdateName = typeof nameEnv === "string" && nameEnv.length > 0;

	const password = passwordEnv ?? "ChangeMe123!";
	const passwordHash = await bcrypt.hash(password, 12);
	const name = nameEnv ?? "Admin";

	const user = await prisma.user.upsert({
    where: { email },
		update: {
			companyId: company.id,
			...(shouldUpdatePassword ? { passwordHash } : {}),
			...(shouldUpdateName ? { name } : {}),
		},
		create: { email, name, passwordHash, companyId: company.id },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: superAdmin.id } },
    update: {},
    create: { userId: user.id, roleId: superAdmin.id },
  });

	console.log(`Seeded admin user: ${email}`);
	if (!shouldUpdatePassword && passwordEnv == null) {
		console.log("Admin password used default value. Set INITIAL_ADMIN_PASSWORD to a strong password and re-run seed to rotate it.");
	}
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
