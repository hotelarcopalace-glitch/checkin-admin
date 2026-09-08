"use client";

import { useState } from "react";

export default function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (next !== confirm) {
      setMsg({ ok: false, text: "Naya password aur confirm match nahi kar rahe." });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsg({ ok: true, text: "Password change ho gaya. Agli baar naye password se login karein." });
        setCurrent("");
        setNext("");
        setConfirm("");
      } else {
        setMsg({ ok: false, text: data.error || "Failed." });
      }
    } catch {
      setMsg({ ok: false, text: "Network error." });
    }
    setBusy(false);
  }

  const input =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none";

  return (
    <form onSubmit={submit} className="max-w-md space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Current password</label>
        <input
          type="password"
          className={input}
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">New password</label>
        <input
          type="password"
          className={input}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          placeholder="min 6 characters"
          autoComplete="new-password"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Confirm new password</label>
        <input
          type="password"
          className={input}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
        />
      </div>
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
      >
        {busy ? "Saving…" : "Change password"}
      </button>
      {msg && <p className={`text-sm ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</p>}
    </form>
  );
}
