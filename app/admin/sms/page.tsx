import Link from "next/link";
import { Suspense } from "react";
import SmsFilters from "@/components/SmsFilters";
import { formatDate, SetupNotice, StatCard, StatusBadge } from "@/components/ui";
import { DbNotReady, listSms, parseFilters } from "@/lib/sms";

export const dynamic = "force-dynamic";
export const metadata = { title: "SMS List · Checkin Admin" };

type SearchParams = Record<string, string | string[] | undefined>;

export default async function SmsListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const qs = new URLSearchParams(
    Object.entries(sp).flatMap(([k, v]) =>
      v === undefined ? [] : [[k, Array.isArray(v) ? v[0] : v] as [string, string]]
    )
  );

  let data;
  try {
    data = await listSms(filters);
  } catch (err) {
    if (err instanceof DbNotReady) {
      return (
        <div className="space-y-5">
          <h1 className="text-xl font-semibold tracking-tight">SMS List</h1>
          <SetupNotice reason={err.reason} />
        </div>
      );
    }
    throw err;
  }

  const { rows, total, pages, stats } = data;
  const pageLink = (page: number) => {
    const next = new URLSearchParams(qs.toString());
    next.set("page", String(page));
    return `/admin/sms?${next.toString()}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">SMS List</h1>
          <p className="mt-1 text-sm text-slate-500">
            {total.toLocaleString("en-IN")} message{total === 1 ? "" : "s"} matching your filters
          </p>
        </div>
        <a
          href={`/api/sms/export?${qs.toString()}`}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          ⤓ Export CSV
        </a>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Matching" value={stats.total} />
        <StatCard label="Delivered" value={stats.delivered} tone="good" />
        <StatCard label="Pending" value={stats.pending} tone="warn" />
        <StatCard label="Failed" value={stats.failed} tone="bad" />
      </div>

      <Suspense fallback={null}>
        <SmsFilters />
      </Suspense>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Recipient</th>
                <th className="px-4 py-3 font-medium">Message</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Template</th>
                <th className="px-4 py-3 font-medium">Sent at</th>
                <th className="px-4 py-3 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    No messages found. Try clearing the filters.
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.id} className="align-top hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{row.recipient}</p>
                    <p className="text-xs text-slate-400">{row.guest_name || "—"}</p>
                  </td>
                  <td className="max-w-md px-4 py-3">
                    <p className="text-slate-700">{row.message}</p>
                    {row.error && <p className="mt-1 text-xs text-red-600">⚠ {row.error}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-slate-700">{row.template || "—"}</p>
                    <p className="text-xs text-slate-400">{row.provider || "—"}</p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                    {formatDate(row.sent_at ?? row.created_at)}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap text-slate-600">
                    ₹{Number(row.cost).toFixed(2)}
                    <span className="block text-xs text-slate-400">
                      {row.segments} seg{row.segments === 1 ? "" : "s"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm">
          <p className="text-slate-500">
            Page {filters.page} of {pages}
          </p>
          <div className="flex gap-2">
            <PageButton href={pageLink(filters.page - 1)} disabled={filters.page <= 1}>
              ← Previous
            </PageButton>
            <PageButton href={pageLink(filters.page + 1)} disabled={filters.page >= pages}>
              Next →
            </PageButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function PageButton({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const base = "rounded-lg border px-3 py-1.5 text-sm font-medium transition";
  if (disabled) {
    return (
      <span className={`${base} border-slate-200 text-slate-300`} aria-disabled>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className={`${base} border-slate-300 text-slate-700 hover:bg-slate-50`}>
      {children}
    </Link>
  );
}
