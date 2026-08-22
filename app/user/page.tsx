import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import NotificationToggle from "@/components/NotificationToggle";
import { formatDate, StatusBadge } from "@/components/ui";
import { hasDatabase, query } from "@/lib/db";
import { USER_COOKIE, verifyUserToken } from "@/lib/user-auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "My messages · Checkin" };

type Row = {
  id: string;
  message: string;
  status: string;
  created_at: Date;
};

export default async function UserHome() {
  const store = await cookies();
  const session = await verifyUserToken(store.get(USER_COOKIE)?.value);
  if (!session) redirect("/user/login");

  let rows: Row[] = [];
  if (hasDatabase()) {
    try {
      rows = await query<Row>(
        `SELECT id::text, message, status, created_at
         FROM sms_messages WHERE recipient = $1
         ORDER BY created_at DESC LIMIT 50`,
        [session.mobile]
      );
    } catch {
      rows = [];
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto w-full max-w-lg space-y-5">
        <header className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">My messages</h1>
            <p className="text-sm text-slate-500">{session.mobile}</p>
          </div>
          <form action="/api/user/logout" method="post">
            <button className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
              Log out
            </button>
          </form>
        </header>

        <NotificationToggle />

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <p className="border-b border-slate-200 px-4 py-3 text-sm font-semibold">
            Messages for your number
          </p>
          <ul className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-slate-500">
                No messages yet. New ones will appear here.
              </li>
            )}
            {rows.map((row) => (
              <li key={row.id} className="px-4 py-3">
                <p className="text-sm text-slate-800">{row.message}</p>
                <p className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                  <StatusBadge status={row.status} />
                  {formatDate(row.created_at)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
