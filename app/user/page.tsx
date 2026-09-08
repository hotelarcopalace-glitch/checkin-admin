import { cookies } from "next/headers";
import GuestLoginSheet from "@/components/GuestLoginSheet";
import InstallButton from "@/components/InstallButton";
import NotificationToggle from "@/components/NotificationToggle";
import ProfileEditor from "@/components/ProfileEditor";
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

  // Not logged in -> a branded landing with the login bottom sheet on top.
  if (!session) {
    return (
      <main className="min-h-screen bg-slate-50">
        {/* hero */}
        <div className="bg-gradient-to-b from-indigo-600 to-violet-600 px-5 pb-16 pt-10 text-white">
          <div className="mx-auto w-full max-w-lg">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 text-lg font-bold">
                C
              </span>
              <span className="text-lg font-semibold tracking-tight">Checkin</span>
            </div>
            <h1 className="mt-6 text-2xl font-bold leading-snug">
              Apne hotel ke messages, receipts &amp; alerts — ek jagah, apne mobile par.
            </h1>
            <p className="mt-2 text-sm text-white/80">
              Mobile number se login karein aur apne saare messages turant dekhein.
            </p>
          </div>
        </div>

        {/* feature cards (peek behind the sheet) */}
        <div className="mx-auto -mt-10 w-full max-w-lg space-y-3 px-5 pb-40">
          {[
            { i: "✉", t: "Messages", d: "Hotel ke saare SMS ek jagah." },
            { i: "🧾", t: "Receipts & Bills", d: "Entry/exit receipts, KOT, bills." },
            { i: "🔔", t: "Instant Alerts", d: "Naya message aate hi notification." },
          ].map((f) => (
            <div
              key={f.t}
              className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-lg">
                {f.i}
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-800">{f.t}</p>
                <p className="text-sm text-slate-500">{f.d}</p>
              </div>
            </div>
          ))}
        </div>

        <GuestLoginSheet />
      </main>
    );
  }

  let rows: Row[] = [];
  let name = "";
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
    try {
      const u = await query<{ name: string | null }>(
        `SELECT name FROM app_users WHERE mobile = $1 LIMIT 1`,
        [session.mobile]
      );
      name = u[0]?.name ?? "";
    } catch {
      name = "";
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto w-full max-w-lg space-y-5">
        <header className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold tracking-tight">My messages</h1>
          <form action="/api/user/logout" method="post">
            <button className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
              Log out
            </button>
          </form>
        </header>

        <ProfileEditor mobile={session.mobile} initialName={name} />
        <InstallButton />
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
