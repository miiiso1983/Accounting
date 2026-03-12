import { getServerSession } from "next-auth";
import * as XLSX from "xlsx";

import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac/authorize";
import { PERMISSIONS } from "@/lib/rbac/permissions";

interface RowData {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  address1?: unknown;
  address2?: unknown;
  city?: unknown;
  country?: unknown;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  return String(v).trim() || null;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVOICE_WRITE)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { companyId: true } });
  if (!user?.companyId) return Response.json({ error: "No company assigned" }, { status: 400 });
  const companyId = user.companyId;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }

  const arrayBuffer = await (file as Blob).arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  let rows: RowData[];
  try {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]!]!;
    rows = XLSX.utils.sheet_to_json<RowData>(ws, { defval: "" });
  } catch {
    return Response.json({ error: "Failed to parse file. Ensure it is a valid .xlsx or .csv file." }, { status: 400 });
  }

  if (rows.length === 0) return Response.json({ error: "File is empty" }, { status: 400 });
  if (rows.length > 1000) return Response.json({ error: "Maximum 1000 rows per import" }, { status: 400 });

  const successful: string[] = [];
  const errors: Array<{ row: number; error: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const name = str(row.name);
    if (!name) {
      errors.push({ row: i + 2, error: "Missing name" });
      continue;
    }
    try {
      const customer = await prisma.customer.create({
        data: {
          companyId,
          name,
          email: str(row.email),
          phone: str(row.phone),
          address1: str(row.address1),
          address2: str(row.address2),
          city: str(row.city),
          country: str(row.country),
        },
        select: { id: true },
      });
      successful.push(customer.id);
    } catch (e) {
      errors.push({ row: i + 2, error: e instanceof Error ? e.message : "Unknown error" });
    }
  }

  return Response.json({ imported: successful.length, errors }, { status: 200 });
}

export async function GET() {
  // Return downloadable CSV template
  const template = "name,email,phone,address1,address2,city,country\nExample Customer,customer@email.com,+1234567890,123 Main St,,Baghdad,Iraq\n";
  return new Response(template, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="customers-template.csv"',
    },
  });
}

