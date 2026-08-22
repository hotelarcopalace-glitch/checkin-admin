import Link from "next/link";
import { DbNotReady, listSms } from "@/lib/sms";
import { formatDate, SetupNotice, StatCard, StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard · Checkin Admin" };

export default async function DashboardPage() {
  let data;
  try {
    data = await listSms({ page: 1, pageSize: 6 });
  } catch (err) {
    if (err instanceof DbNotReady) {
      return (
        <div className="space-y-5">
          <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
          <SetupNotice reason={err.reason} />
        </div>
      );
    }
    throw err;
  }

  const { stats, rows } = data;
  const rate = stats.total ? Math.round((stats.delivered / stats.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Overview of SMS activity on checkin.co.in</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total SMS" value={stats.total} />
        <StatCard label="Delivered" value={stats.delivered} tone="good" hint={`${rate}% delivery rate`} />
        <StatCard label="Pending" value={stats.pending} tone="warn" hint="queued or sent" />
        <StatCard label="Failed" value={stats.failed} tone="bad" />
      </div>

      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold">Recent messages</h2>
          <Link href="/admin/sms" className="text-sm font-medium text-indigo-600 hover:underline">
            View all →
          </Link>
        </div>
        <ul className="divide-y divide-slate-100">
          {rows.length === 0 && (
            <li className="px-4 py-6 text-sm text-slate-500">No messages yet.</li>
          )}
          {rows.map((row) => (
            <li key={row.id} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {row.guest_name || "Unknown"}{" "}
                  <span className="font-normal text-slate-400">· {row.recipient}</span>
                </p>
                <p className="truncate text-sm text-slate-500">{row.message}</p>
              </div>
              <div className="shrink-0 text-right">
                <StatusBadge status={row.status} />
                <p className="mt-1 text-xs text-slate-400">{formatDate(row.created_at)}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
