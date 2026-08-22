"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DbSetupButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function run() {
    setBusy(true);
    setMessage(null);
    setFailed(false);
    try {
      const res = await fetch("/api/admin/db-setup?seed=1", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFailed(true);
        setMessage(data.error || "Setup failed.");
      } else {
        setMessage(`Table ready — ${data.rows} row${data.rows === 1 ? "" : "s"} in sms_messages.`);
        router.refresh();
      }
    } catch {
      setFailed(true);
      setMessage("Network error.");
    }
    setBusy(false);
  }

  return (
    <div className="mt-3">
      <button
        onClick={run}
        disabled={busy}
        className="rounded-lg bg-amber-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-amber-800 disabled:opacity-60"
      >
        {busy ? "Setting up…" : "Run database setup"}
      </button>
      {message && (
        <p className={`mt-2 text-sm ${failed ? "text-red-700" : "text-emerald-700"}`}>{message}</p>
      )}
    </div>
  );
}
