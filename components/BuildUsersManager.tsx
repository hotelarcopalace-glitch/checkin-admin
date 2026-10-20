"use client";

import { useCallback, useEffect, useState } from "react";
import { formatISTLong } from "@/lib/time";

type U = {
  id: string;
  username: string;
  name: string;
  mobile: string | null;
  active: boolean;
  hasPassword: boolean;
  lastLoginAt: string | null;
};
type Otp = { username: string; mobile: string; code: string; expiresAt: string };

const field = "h-10 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200";
const ghost = "rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50";

function minutesLeft(iso: string) {
  return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60000));
}

export default function BuildUsersManager() {
  const [users, setUsers] = useState<U[] | null>(null);
  const [otps, setOtps] = useState<Otp[]>([]);
  const [loadErr, setLoadErr] = useState("");
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [mobile, setMobile] = useState("");

  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editMobile, setEditMobile] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/build-users", { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setLoadErr(j.error || "Could not load users.");
        return;
      }
      setLoadErr("");
      setUsers(j.users);
      setOtps(j.otps || []);
    } catch {
      setLoadErr("Network error.");
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000); // fresh OTPs show up without a reload
    return () => clearInterval(t);
  }, [load]);

  async function call(method: "POST" | "PATCH", body: unknown, ok: string) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/build-users", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsg({ text: j.error || "Could not save.", bad: true });
        setBusy(false);
        return false;
      }
      setMsg({ text: ok, bad: false });
      await load();
      setBusy(false);
      return true;
    } catch {
      setMsg({ text: "Network error. Try again.", bad: true });
      setBusy(false);
      return false;
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const done = await call(
      "POST",
      { name, username, mobile },
      `Added ${username.trim().toLowerCase()}. Their password is blank: they set it from the login page with an OTP.`
    );
    if (done) {
      setName("");
      setUsername("");
      setMobile("");
    }
  }

  function startEdit(u: U) {
    setEditId(u.id);
    setEditName(u.name);
    setEditMobile(u.mobile ?? "");
  }

  async function saveEdit(u: U) {
    const body: Record<string, unknown> = { id: u.id, name: editName };
    if (editMobile.trim()) body.mobile = editMobile;
    if (await call("PATCH", body, `Saved ${u.username}.`)) setEditId(null);
  }

  function blank(u: U) {
    if (!window.confirm(`Clear the password of ${u.username}? They will have to set a new one with an OTP.`)) return;
    call("PATCH", { id: u.id, blankPassword: true }, `${u.username}: password is now blank.`);
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-800">Add a user</h2>
        <p className="mt-1 text-sm text-slate-500">
          The password starts blank. The person sets it the first time with an OTP for this mobile number.
        </p>
        <form onSubmit={add} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="min-w-[10rem] flex-1 text-sm font-medium text-slate-600">
            Name
            <input id="bu-name" value={name} onChange={(e) => setName(e.target.value)} className={`mt-1.5 ${field}`} placeholder="Mohan Verma" />
          </label>
          <label className="min-w-[10rem] flex-1 text-sm font-medium text-slate-600">
            Username
            <input id="bu-username" value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" autoCorrect="off" className={`mt-1.5 ${field}`} placeholder="mohan" />
          </label>
          <label className="min-w-[10rem] flex-1 text-sm font-medium text-slate-600">
            Mobile number
            <input id="bu-mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} inputMode="tel" className={`mt-1.5 ${field}`} placeholder="98290 12345" />
          </label>
          <button disabled={busy} className="h-10 rounded-lg bg-amber-700 px-4 text-sm font-semibold text-white transition hover:bg-amber-800 disabled:opacity-60">
            Add user
          </button>
        </form>
        {msg && <p className={`mt-3 text-sm ${msg.bad ? "text-red-700" : "text-emerald-700"}`}>{msg.text}</p>}
      </div>

      {otps.length > 0 && (
        <div className="rounded-2xl border border-amber-400 bg-amber-50 p-5">
          <h2 className="text-base font-semibold text-slate-800">OTPs waiting to be read out</h2>
          <p className="mt-1 text-sm text-slate-600">
            SMS sending is not connected yet, so the OTP does not reach the phone. Tell the person this code by call or message. It expires in 10 minutes.
          </p>
          <ul className="mt-2 divide-y divide-amber-200/70">
            {otps.map((o) => (
              <li key={o.username} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                <span className="font-mono text-2xl font-bold tracking-[0.18em] text-amber-800">{o.code}</span>
                <span className="text-sm text-slate-700">
                  <strong>{o.username}</strong> <span className="text-slate-500">· {o.mobile}</span>
                  <br />
                  <span className="text-xs text-slate-500">Expires in {minutesLeft(o.expiresAt)} min</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-800">BuildKhata users</h2>
        {loadErr && <p className="mt-3 text-sm text-red-700">{loadErr}</p>}
        {!users && !loadErr && <p className="mt-3 text-sm text-slate-500">Loading…</p>}
        {users && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-2 py-2">Name</th>
                  <th className="px-2 py-2">Username</th>
                  <th className="px-2 py-2">Mobile</th>
                  <th className="px-2 py-2">Password</th>
                  <th className="px-2 py-2">Last login</th>
                  <th className="px-2 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const editing = editId === u.id;
                  return (
                    <tr key={u.id} className={`border-b border-slate-100 last:border-0 ${u.active ? "" : "opacity-55"}`}>
                      <td className="px-2 py-3 font-medium text-slate-800">
                        {editing ? <input value={editName} onChange={(e) => setEditName(e.target.value)} className={field} aria-label="Name" /> : u.name}
                      </td>
                      <td className="px-2 py-3 text-slate-600">{u.username}</td>
                      <td className="px-2 py-3 text-slate-600">
                        {editing ? (
                          <input value={editMobile} onChange={(e) => setEditMobile(e.target.value)} inputMode="tel" className={field} aria-label="Mobile number" placeholder="98290 12345" />
                        ) : (
                          u.mobile ?? <span className="text-slate-400">Not added</span>
                        )}
                      </td>
                      <td className="px-2 py-3">
                        {!u.active ? (
                          <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-600">Switched off</span>
                        ) : u.hasPassword ? (
                          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">Set</span>
                        ) : (
                          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">Blank, waiting for OTP</span>
                        )}
                      </td>
                      <td className="px-2 py-3 text-slate-500">{u.lastLoginAt ? formatISTLong(u.lastLoginAt) : "Never"}</td>
                      <td className="px-2 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {editing ? (
                            <>
                              <button disabled={busy} onClick={() => saveEdit(u)} className="rounded-lg bg-amber-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-800 disabled:opacity-60">Save</button>
                              <button onClick={() => setEditId(null)} className={ghost}>Cancel</button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => startEdit(u)} className={ghost}>Edit</button>
                              {u.active && <button disabled={busy} onClick={() => blank(u)} className={ghost}>Blank password</button>}
                              <button
                                disabled={busy}
                                onClick={() => call("PATCH", { id: u.id, active: !u.active }, `${u.username} is now ${u.active ? "switched off" : "switched on"}.`)}
                                className={`${ghost} ${u.active ? "!text-red-700" : ""}`}
                              >
                                {u.active ? "Switch off" : "Switch on"}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-4 border-l-[3px] border-amber-500 pl-3 text-sm text-slate-500">
          Users are never deleted, only switched off, so old entries keep their name. The 5 original users keep their current passwords until you add a mobile number and blank them.
        </p>
      </div>
    </div>
  );
}
