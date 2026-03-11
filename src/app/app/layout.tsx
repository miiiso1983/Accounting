import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/options";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-6xl p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-zinc-500">Accounting</div>
            <div className="text-xl font-semibold text-zinc-900">Dashboard</div>
          </div>
          <div className="text-sm text-zinc-600">Signed in as {session.user.email ?? "(no email)"}</div>
        </div>
        {children}
      </div>
    </div>
  );
}
