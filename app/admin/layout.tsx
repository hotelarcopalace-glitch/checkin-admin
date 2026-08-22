import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import NavLink from "@/components/NavLink";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!session) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white p-4 md:block">
        <Link href="/admin" className="mb-6 flex items-center gap-2 px-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
            C
          </span>
          <span className="font-semibold tracking-tight">Checkin</span>
        </Link>
        <nav className="space-y-1">
          <NavLink href="/admin" label="Dashboard" icon="▦" />
          <NavLink href="/admin/sms" label="SMS List" icon="✉" />
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-3">
          <div className="flex items-center gap-3 md:hidden">
            <Link href="/admin" className="text-sm font-semibold">
              Checkin
            </Link>
            <Link href="/admin/sms" className="text-sm text-slate-500">
              SMS List
            </Link>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm text-slate-500">
              Signed in as <strong className="text-slate-700">{session.username}</strong>
            </span>
            <form action="/api/auth/logout" method="post">
              <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                Log out
              </button>
            </form>
          </div>
        </header>

        <main className="flex-1 p-5">{children}</main>
      </div>
    </div>
  );
}
