import { redirect } from "next/navigation";
import { readAdminSessionFromServerCookies } from "@/lib/admin-auth";
import { loadActiveAdminAllowlistByEmail } from "@/lib/admin-db";
import AdminDashboardClient from "./admin-dashboard-client";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const session = await readAdminSessionFromServerCookies();
  if (!session?.uid || !session.email) {
    redirect("/admin-login?next=/admin-console");
  }

  const allowlist = await loadActiveAdminAllowlistByEmail(session.email);
  if (!allowlist?.active || !allowlist.role) {
    redirect("/admin-login?next=/admin-console");
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <header className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">Arc Console</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">Admin Dashboard</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Signed in as <span className="font-medium text-zinc-900">{session?.email || "unknown"}</span> (
          {session?.role || "unknown role"}).
        </p>
      </header>
      <AdminDashboardClient actorUid={session?.uid || ""} actorEmail={session?.email || ""} actorRole={session?.role || ""} />
    </main>
  );
}
