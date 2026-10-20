"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Stage = "login" | "user" | "otp" | "done";

const input =
  "h-12 rounded-xl border border-amber-200 bg-amber-50/40 px-4 text-base outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200";
const label = "text-sm font-medium text-amber-900/70";
const primary = "h-12 rounded-xl bg-amber-700 text-base font-semibold text-amber-50 disabled:opacity-60";
const linkBtn = "text-sm font-medium text-amber-800 underline underline-offset-2";

async function post(url: string, body: unknown) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, j };
}

export default function BuildLoginForm() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  function go(next: Stage) {
    setErr("");
    setStage(next);
  }

  async function run(fn: () => Promise<void>) {
    setErr("");
    setBusy(true);
    try {
      await fn();
    } catch {
      setErr("Network error. Try again.");
    }
    setBusy(false);
  }

  // A new user (or one who just used "Forgot password") has a blank password: leave the field empty.
  const signIn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return setErr("Enter your username.");
    run(async () => {
      const { ok, j } = await post("/api/build/login", { username: username.trim(), password });
      if (ok) return router.replace("/build");
      setErr(j.error || "Login failed.");
    });
  };

  const sendOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return setErr("Enter your username.");
    run(async () => {
      const { ok, j } = await post("/api/build/reset/send", { username: username.trim() });
      if (!ok) return setErr(j.error || "Could not send the OTP.");
      setCode("");
      go("otp");
    });
  };

  const checkOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) return setErr("Enter the 6-digit OTP.");
    run(async () => {
      const { ok, j } = await post("/api/build/reset/verify", { username: username.trim(), code: code.trim() });
      if (!ok) return setErr(j.error || "Wrong OTP.");
      go("done");
    });
  };

  const error = err && <p className="text-sm text-red-600">{err}</p>;

  if (stage === "user") {
    return (
      <form onSubmit={sendOtp} className="flex flex-col gap-4">
        <div>
          <h2 className="text-base font-semibold text-amber-900">Forgot your password?</h2>
          <p className="mt-1 text-sm text-amber-900/60">
            We make an OTP for the mobile number saved on your account. After you enter it, your password is cleared and you are signed in.
          </p>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className={label}>Username</span>
          <input id="reset-username" value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" autoCorrect="off" className={input} />
        </label>
        {error}
        <button type="submit" disabled={busy} className={primary}>{busy ? "Please wait…" : "Get OTP"}</button>
        <button type="button" onClick={() => go("login")} className={linkBtn}>Back to sign in</button>
      </form>
    );
  }

  if (stage === "otp") {
    return (
      <form onSubmit={checkOtp} className="flex flex-col gap-4">
        <div>
          <h2 className="text-base font-semibold text-amber-900">Enter the OTP</h2>
          <p className="mt-1 text-sm text-amber-900/60">
            An OTP was made for <strong>{username.trim()}</strong>. SMS is not connected yet, so ask the admin for the code. It is valid for 10 minutes.
          </p>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className={label}>6-digit OTP</span>
          <input id="reset-otp" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••" className={`${input} tracking-[0.4em]`} />
        </label>
        {error}
        <button type="submit" disabled={busy} className={primary}>{busy ? "Checking…" : "Verify OTP"}</button>
        <div className="flex justify-between">
          <button type="button" onClick={() => go("user")} className={linkBtn}>Send a new OTP</button>
          <button type="button" onClick={() => go("login")} className={linkBtn}>Back to sign in</button>
        </div>
      </form>
    );
  }

  if (stage === "done") {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-base font-semibold text-amber-900">OTP is correct</h2>
          <p className="mt-1 text-sm text-amber-900/60">
            Your password is now blank and you are signed in. Set a new one inside the app: tap your name at the top, then <strong>Change password</strong>, and leave the old password empty.
          </p>
        </div>
        <button type="button" onClick={() => router.replace("/build")} className={primary}>Open BuildKhata</button>
      </div>
    );
  }

  return (
    <form onSubmit={signIn} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className={label}>Username</span>
        <input
          id="login-username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          placeholder="rahul"
          className={input}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={label}>Password</span>
        <input
          id="login-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Leave empty if you have none yet"
          className={input}
        />
      </label>
      {error}
      <button type="submit" disabled={busy} className={primary}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
      <button type="button" onClick={() => go("user")} className={linkBtn}>
        Forgot your password?
      </button>
    </form>
  );
}
