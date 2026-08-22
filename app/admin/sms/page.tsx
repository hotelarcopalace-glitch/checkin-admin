import Link from "next/link";
import { Suspense } from "react";
import ClearDataButton from "@/components/ClearDataButton";
import DeleteSmsButton from "@/components/DeleteSmsButton";
import SmsFilters from "@/components/SmsFilters";
import { SetupNotice } from "@/components/ui";
import { DbNotReady, listSms, parseFilters, type SmsRow } from "@/lib/sms";

export const dynamic = "force-dynamic";
export const metadata = { title: "SMS Notifications · Checkin Admin" };

type SearchParams = Record<string, string | string[] | undefined>;

/** The hotel's receipts say "Entry Receipt" / "Exit Receipt" — surface that as a pill. */
function kindOf(message: string): "entry" | "exit" | null {
  const text = message.toLowerCase();
  if (text.includes("entry receipt")) return "entry";
  if (text.includes("exit receipt")) return "exit";
  return null;
}

function when(value: Date | string | null) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function Pills({ row }: { row: SmsRow }) {
  const kind = kindOf(row.message);
  return (
    <>
      {kind && <span className={`pill pill-${kind}`}>{kind.toUpperCase()}</span>}
      <span className={`pill pill-${row.status}`}>{row.status.toUpperCase()}</span>
    </>
  );
}

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
        <div className="sms-page">
          <h1>SMS Notifications</h1>
          <SetupNotice reason={err.reason} />
        </div>
      );
    }
    throw err;
  }

  const { rows, pages, stats } = data;
  const startIndex = (filters.page - 1) * filters.pageSize;
  const pageLink = (page: number) => {
    const next = new URLSearchParams(qs.toString());
    next.set("page", String(page));
    return `/admin/sms?${next.toString()}`;
  };

  return (
    <div className="sms-page">
      <h1>SMS Notifications</h1>
      <div className="sub">Messages and alerts received on the registered numbers.</div>

      <Suspense fallback={null}>
        <SmsFilters />
      </Suspense>

      <div className="total">
        <span>Total SMS - {stats.total.toLocaleString("en-IN")}</span>
        <span className="dim">Delivered {stats.delivered}</span>
        <span className="dim">Pending {stats.pending}</span>
        <span className="dim">Failed {stats.failed}</span>
        <a href={`/api/sms/export?${qs.toString()}`} className="btn btn-ghost" style={{ marginLeft: "auto" }}>
          ⤓ Export CSV
        </a>
      </div>

      {/* desktop table */}
      <div className="table-shell">
        <table>
          <thead>
            <tr>
              <th style={{ width: 55 }}>S.No.</th>
              <th style={{ width: 160 }}>Mobile No</th>
              <th>SMS Text</th>
              <th style={{ width: 150 }}>Template</th>
              <th style={{ width: 150 }}>Source IP</th>
              <th style={{ width: 150 }}>Created</th>
              <th style={{ width: 120 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="dim" style={{ padding: "34px 10px", textAlign: "center" }}>
                  No messages found. Try clearing the filters.
                </td>
              </tr>
            )}
            {rows.map((row, i) => (
              <tr key={row.id}>
                <td className="mono">{startIndex + i + 1}</td>
                <td className="mono">
                  {row.recipient}
                  {row.guest_name && <div className="dim">{row.guest_name}</div>}
                </td>
                <td className="sms-text">
                  <Pills row={row} />
                  {row.message}
                  {row.error && <div style={{ color: "#c0392b", fontSize: 12 }}>⚠ {row.error}</div>}
                </td>
                <td className="dim">
                  {row.template || "—"}
                  <div className="dim" style={{ fontSize: 11.5 }}>{row.provider || "—"}</div>
                </td>
                <td className="dim mono">{row.source_ip || "—"}</td>
                <td className="dim mono">{when(row.sent_at ?? row.created_at)}</td>
                <td>
                  <DeleteSmsButton id={row.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="pager">
          <span>
            Page {filters.page} of {pages}
          </span>
          <span>
            {filters.page > 1 ? (
              <Link href={pageLink(filters.page - 1)}>← Previous</Link>
            ) : (
              <span className="off">← Previous</span>
            )}{" "}
            {filters.page < pages ? (
              <Link href={pageLink(filters.page + 1)}>Next →</Link>
            ) : (
              <span className="off">Next →</span>
            )}
          </span>
        </div>
      </div>

      {/* mobile cards */}
      <div className="cards">
        {rows.length === 0 && (
          <div className="mcard dim" style={{ textAlign: "center" }}>
            No messages found.
          </div>
        )}
        {rows.map((row, i) => (
          <div className="mcard" key={row.id}>
            <div className="top">
              <span className="num">
                #{startIndex + i + 1} · {row.recipient}
              </span>
              <Pills row={row} />
            </div>
            <div className="txt">{row.message}</div>
            {row.error && (
              <div style={{ color: "#c0392b", fontSize: 12, marginTop: 6 }}>⚠ {row.error}</div>
            )}
            <div className="meta">
              <span>{row.source_ip || row.provider || ""}</span>
              <span>{when(row.sent_at ?? row.created_at)}</span>
            </div>
            <div style={{ marginTop: 10 }}>
              <DeleteSmsButton id={row.id} />
            </div>
          </div>
        ))}
        <div className="pager" style={{ border: 0 }}>
          <span>
            Page {filters.page} of {pages}
          </span>
          <span>
            {filters.page > 1 ? (
              <Link href={pageLink(filters.page - 1)}>← Prev</Link>
            ) : (
              <span className="off">← Prev</span>
            )}{" "}
            {filters.page < pages ? (
              <Link href={pageLink(filters.page + 1)}>Next →</Link>
            ) : (
              <span className="off">Next →</span>
            )}
          </span>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <ClearDataButton total={stats.total} />
      </div>
    </div>
  );
}
