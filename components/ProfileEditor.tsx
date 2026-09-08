"use client";

import { useState } from "react";

export default function ProfileEditor({
  mobile,
  initialName,
}: {
  mobile: string;
  initialName: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialName);
  const [saved, setSaved] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/user/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSaved(data.name ?? name);
        setMsg("Profile save ho gaya.");
        setOpen(false);
      } else {
        setMsg(data.error || "Failed.");
      }
    } catch {
      setMsg("Network error.");
    }
    setBusy(false);
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-800">{saved || "Guest"}</p>
          <p className="text-sm text-slate-500">{mobile}</p>
        </div>
        <button
          onClick={() => {
            setOpen((v) => !v);
            setMsg(null);
          }}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          {open ? "Close" : "Edit profile"}
        </button>
      </div>

      {open && (
        <form onSubmit={save} className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-[180px] flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-500">Your name</label>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ramesh"
              maxLength={60}
              autoFocus
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </form>
      )}
      {msg && <p className="mt-2 text-sm text-slate-600">{msg}</p>}
    </section>
  );
}
