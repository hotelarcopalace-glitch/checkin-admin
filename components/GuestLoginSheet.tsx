"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Step = "mobile" | "otp";

// Bottom sheet that slides up when a guest opens the site without a session.
// Mobile number -> OTP -> logged in. While no SMS gateway is wired (OTP_SKIP),
// the code is shown on screen.
export default function GuestLoginSheet() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("mobile");
  const [mobile, setMobile] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [skip, setSkip] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const field =
    "w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/user/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error || "Could not send the code.");
      else {
        setDevCode(data.devCode ?? null);
        setSkip(Boolean(data.skipVerification));
        setStep("otp");
      }
    } catch {
      setError("Network error.");
    }
    setBusy(false);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/user/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not verify.");
        setBusy(false);
        return;
      }
      router.refresh();
    } catch {
      setError("Network error.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-slate-900/40" />
      <div className="relative w-full max-w-md rounded-t-3xl bg-white p-6 pb-8 shadow-2xl sm:rounded-3xl">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-200 sm:hidden" />
        <div className="mb-5 text-center">
          <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-600 text-lg font-bold text-white">
            C
          </div>
          <h2 className="text-lg font-semibold tracking-tight">Apne messages dekhein</h2>
          <p className="mt-1 text-sm text-slate-500">
            Mobile number daalein — OTP se login karein.
          </p>
        </div>

        {step === "mobile" ? (
          <form onSubmit={sendOtp} className="space-y-4">
            <input
              className={field}
              type="tel"
              inputMode="numeric"
              placeholder="98765 43210"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              autoFocus
              required
            />
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-indigo-600 px-3 py-3.5 text-base font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
            >
              {busy ? "Sending…" : "Send OTP"}
            </button>
          </form>
        ) : (
          <form onSubmit={verify} className="space-y-4">
            <p className="text-sm text-slate-600">
              Code sent to <strong>{mobile}</strong>.{" "}
              <button
                type="button"
                onClick={() => {
                  setStep("mobile");
                  setCode("");
                  setError(null);
                }}
                className="text-indigo-600 underline"
              >
                Change
              </button>
            </p>
            {skip && (
              <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                SMS abhi connect nahi hai — koi bhi code chalega.
                {devCode && (
                  <>
                    {" "}
                    Aapka code: <strong className="tracking-widest">{devCode}</strong>
                  </>
                )}
              </div>
            )}
            <input
              className={`${field} text-center tracking-[0.5em]`}
              inputMode="numeric"
              maxLength={6}
              placeholder="••••••"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              autoFocus
            />
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-indigo-600 px-3 py-3.5 text-base font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
            >
              {busy ? "Verifying…" : "Verify & continue"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
