"use client";

import { useCallback, useEffect, useState } from "react";
import { formatISTLong } from "@/lib/time";

type H = { id: string; name: string; client: string; entries: number; received: number; expense: number; hiddenAt: string | null; hiddenBy: string };

const money = (n: number) => "₹" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n || 0));
const ghost = "rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50";

export default function BuildHiddenProjects() {
  const [items, setItems] = useState<H[] | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState("");
  const [typed, setTyped] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/build-projects", { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error || "Could not load."); return; }
      setErr("");
      setItems(j.projects);
    } catch { setErr("Network error."); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function call(method: "PATCH" | "DELETE", body: Record<string, unknown>, ok: (j: Record<string, unknown>) => string) {
    setBusy(true); setMsg(""); setErr("");
    try {
      const r = await fetch("/api/admin/build-projects", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error || "Could not save."); setBusy(false); return; }
      setMsg(ok(j));
      setConfirmId(""); setTyped("");
      await load();
    } catch { setErr("Network error."); }
    setBusy(false);
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-800">Hidden projects</h2>
      <p className="mt-1 text-sm text-slate-500">
        Projects deleted in the BuildKhata app are only hidden. Their entries are hidden with them. Restore brings everything back. “Delete for good” erases the project and all its entries and cannot be undone (the nightly backup keeps 14 days).
      </p>
      {err && <p className="mt-3 text-sm text-red-700">{err}</p>}
      {msg && <p className="mt-3 text-sm text-emerald-700">{msg}</p>}
      {!items && !err && <p className="mt-3 text-sm text-slate-500">Loading…</p>}
      {items && items.length === 0 && <p className="mt-3 text-sm text-slate-500">No hidden projects.</p>}
      {items && items.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
                <th className="px-2 py-2">Project</th>
                <th className="px-2 py-2">Entries</th>
                <th className="px-2 py-2">Received / Expense</th>
                <th className="px-2 py-2">Hidden by</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 align-top last:border-0">
                  <td className="px-2 py-3">
                    <span className="font-medium text-slate-800">{p.name}</span>{" "}
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10.5px] font-bold text-slate-600">Hidden</span>
                    <div className="text-xs text-slate-500">{p.client}</div>
                  </td>
                  <td className="px-2 py-3 tabular-nums">{p.entries}</td>
                  <td className="px-2 py-3 tabular-nums text-slate-600">{money(p.received)} / {money(p.expense)}</td>
                  <td className="px-2 py-3 text-slate-600">{p.hiddenBy || "—"}<div className="text-xs text-slate-500">{p.hiddenAt ? formatISTLong(p.hiddenAt) : ""}</div></td>
                  <td className="px-2 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      <button disabled={busy} className={ghost} onClick={() => call("PATCH", { id: p.id }, () => `${p.name} is back in the app.`)}>Restore</button>
                      <button disabled={busy} className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50" onClick={() => { setConfirmId(confirmId === p.id ? "" : p.id); setTyped(""); }}>
                        Delete for good
                      </button>
                    </div>
                    {confirmId === p.id && (
                      <div className="mt-2 rounded-xl bg-red-50 p-3 text-sm text-red-800">
                        Type <b>DELETE</b> to erase “{p.name}” and its {p.entries} entr{p.entries === 1 ? "y" : "ies"} forever.
                        <input value={typed} onChange={(e) => setTyped(e.target.value)} className="mt-2 block h-9 w-full rounded-lg border border-red-200 bg-white px-2 text-sm text-slate-800 outline-none focus:border-red-400" placeholder="DELETE" />
                        <div className="mt-2 flex gap-2">
                          <button
                            disabled={busy || typed !== "DELETE"}
                            className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                            onClick={() => call("DELETE", { id: p.id, confirm: "DELETE" }, (j) => `Erased ${String(j.name)} and ${String(j.entries)} entries.`)}
                          >
                            Delete for good
                          </button>
                          <button className={ghost} onClick={() => { setConfirmId(""); setTyped(""); }}>Cancel</button>
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
