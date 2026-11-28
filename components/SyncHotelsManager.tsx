"use client";

import { useCallback, useEffect, useState } from "react";

type Hotel = {
  id: string;
  name: string;
  registered: boolean;
  setupPending: boolean;
  quotaMb: number;
  usedBytes: number;
  files: number;
  pushedAt: string | null;
  pulledAt: string | null;
  active: boolean;
  createdAt: string;
};

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
const when = (s: string | null) =>
  s ? new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "never";

export default function SyncHotelsManager() {
  const [hotels, setHotels] = useState<Hotel[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // the setup code is only known right after "Add" / "New setup code"
  const [code, setCode] = useState<{ name: string; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/sync-hotels", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load.");
      setHotels(data.hotels);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function call(method: string, body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/sync-hotels", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Request failed.");
      await load();
      return data as Record<string, string>;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    const data = await call("POST", { name });
    if (data) {
      setCode({ name, text: `${data.id}-${data.setup}` });
      setName("");
    }
  }

  async function reset(h: Hotel) {
    if (!window.confirm(`New setup code for ${h.name}? The hotel PC and the office PC will both have to be set up again.`)) return;
    const data = await call("PATCH", { id: h.id, action: "reset" });
    if (data) setCode({ name: h.name, text: `${data.id}-${data.setup}` });
  }

  async function remove(h: Hotel) {
    if (window.prompt(`This deletes ${h.name} and its stored data from the server. Type DELETE to confirm.`) !== "DELETE") return;
    await call("DELETE", { id: h.id, confirm: "DELETE" });
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="block text-sm font-medium text-slate-700">
          Hotel name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Hotel Sunrise, Jaipur"
            className="mt-1.5 h-10 w-72 max-w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          />
        </label>
        <button
          onClick={add}
          disabled={busy || name.trim().length < 2}
          className="h-10 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
        >
          Add hotel
        </button>
      </div>

      {code && (
        <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-5">
          <p className="text-sm font-semibold text-amber-900">Setup code for {code.name}</p>
          <p className="mt-2 break-all font-mono text-lg font-semibold text-amber-950">{code.text}</p>
          <p className="mt-2 text-sm text-amber-900">
            Type this once on the hotel PC (UTILITY &gt; Misc. &gt; Office Sync &gt; Hotel setup). It is shown only now and works only once.
          </p>
          <button onClick={() => setCode(null)} className="mt-3 rounded-lg border border-amber-400 px-3 py-1.5 text-sm font-medium text-amber-900">
            Done
          </button>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-red-700">{error}</p>}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Hotel</th>
              <th className="px-4 py-3">State</th>
              <th className="px-4 py-3">Last sent by hotel</th>
              <th className="px-4 py-3">Last taken by office</th>
              <th className="px-4 py-3">Stored</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {hotels === null && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-slate-500">
                  Loading…
                </td>
              </tr>
            )}
            {hotels?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-slate-500">
                  No hotels yet. Add the first one above.
                </td>
              </tr>
            )}
            {hotels?.map((h) => (
              <tr key={h.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-800">{h.name}</div>
                  <div className="font-mono text-xs text-slate-500">{h.id}</div>
                </td>
                <td className="px-4 py-3">
                  {!h.active ? (
                    <span className="rounded bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">Off</span>
                  ) : h.registered ? (
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">Set up</span>
                  ) : (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Waiting for hotel setup</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">{when(h.pushedAt)}</td>
                <td className="px-4 py-3 text-slate-600">{when(h.pulledAt)}</td>
                <td className="px-4 py-3 text-slate-600">
                  {mb(h.usedBytes)} <span className="text-xs text-slate-400">of {h.quotaMb} MB · {h.files} files</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => reset(h)} disabled={busy} className="mr-3 text-xs font-medium text-indigo-700 hover:underline">
                    New setup code
                  </button>
                  <button
                    onClick={() => call("PATCH", { id: h.id, action: h.active ? "disable" : "enable" })}
                    disabled={busy}
                    className="mr-3 text-xs font-medium text-slate-600 hover:underline"
                  >
                    {h.active ? "Switch off" : "Switch on"}
                  </button>
                  <button onClick={() => remove(h)} disabled={busy} className="text-xs font-medium text-red-700 hover:underline">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
