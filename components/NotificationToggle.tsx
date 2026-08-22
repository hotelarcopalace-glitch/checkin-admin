"use client";

import { useEffect, useState } from "react";
import { firebaseReady, onForegroundMessage, requestPushToken } from "@/lib/firebase-client";

export default function NotificationToggle() {
  const [state, setState] = useState<"idle" | "on" | "busy">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ title: string; body: string } | null>(null);

  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      setState("on");
    }
    onForegroundMessage((title, body) => setToast({ title, body }));
  }, []);

  async function enable() {
    setState("busy");
    setError(null);
    setMessage(null);
    try {
      const token = await requestPushToken();
      const res = await fetch("/api/user/device", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save this device.");
      setState("on");
      setMessage(`Notifications are on — ${data.devices} device(s) registered.`);
    } catch (err) {
      setState("idle");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (!firebaseReady()) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">Notifications not set up yet</p>
        <p className="mt-1">
          The Firebase keys are missing on the server, so alerts cannot be switched on. Everything
          else on this page works.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-medium text-slate-800">Message alerts</p>
      <p className="mt-1 text-sm text-slate-500">
        Get a notification on this device the moment a new message arrives for your number.
      </p>

      <button
        onClick={enable}
        disabled={state === "busy" || state === "on"}
        className={`mt-3 rounded-lg px-4 py-2 text-sm font-semibold transition ${
          state === "on"
            ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
            : "bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
        }`}
      >
        {state === "on" ? "✓ Notifications on" : state === "busy" ? "Setting up…" : "Turn on notifications"}
      </button>

      {message && <p className="mt-2 text-sm text-emerald-700">{message}</p>}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      {toast && (
        <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
          <p className="text-sm font-semibold text-indigo-900">{toast.title}</p>
          <p className="text-sm text-indigo-800">{toast.body}</p>
        </div>
      )}
    </div>
  );
}
