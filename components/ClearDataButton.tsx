"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ClearDataButton({ total }: { total: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function clearAll() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/clear-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      const data = await res.json().catch(() => ({}));
      setMessage(res.ok ? `Deleted ${data.deleted} message(s).` : data.error || "Failed.");
      if (res.ok) {
        setAsking(false);
        router.refresh();
      }
    } catch {
      setMessage("Network error.");
    }
    setBusy(false);
  }

  if (total === 0 && !message) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-medium text-slate-700">Danger zone</p>
      <p className="mt-1 text-sm text-slate-500">
        Permanently delete every message in the list. Use this once, to clear demo data
        before real traffic starts.
      </p>

      {!asking ? (
        <button
          onClick={() => setAsking(true)}
          className="mt-3 rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50"
        >
          Clear all messages
        </button>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-700">
            Delete all {total} message{total === 1 ? "" : "s"}? This cannot be undone.
          </span>
          <button
            onClick={clearAll}
            disabled={busy}
            className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
          >
            {busy ? "Deleting…" : "Yes, delete everything"}
          </button>
          <button
            onClick={() => setAsking(false)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      )}

      {message && <p className="mt-2 text-sm text-slate-600">{message}</p>}
    </div>
  );
}
