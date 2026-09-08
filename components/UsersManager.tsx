"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type AdminUser = {
  id: string;
  username: string;
  created_at: string;
  last_login_at: string | null;
};

function fmt(v: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

export default function UsersManager({
  users,
  envAdmin,
}: {
  users: AdminUser[];
  envAdmin: string;
}) {
  const router = useRouter();

  // create form
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // per-row reset password
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPw, setResetPw] = useState("");
  const [rowMsg, setRowMsg] = useState<{ id: string; ok: boolean; text: string } | null>(null);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsg({ ok: true, text: `User "${username}" ban gaya.` });
        setUsername("");
        setPassword("");
        router.refresh();
      } else {
        setMsg({ ok: false, text: data.error || "Failed." });
      }
    } catch {
      setMsg({ ok: false, text: "Network error." });
    }
    setBusy(false);
  }

  async function resetPassword(id: string) {
    setRowMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: resetPw }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setRowMsg({ id, ok: true, text: "Password badal diya." });
        setResetId(null);
        setResetPw("");
      } else {
        setRowMsg({ id, ok: false, text: data.error || "Failed." });
      }
    } catch {
      setRowMsg({ id, ok: false, text: "Network error." });
    }
  }

  async function deleteUser(id: string, name: string) {
    if (!confirm(`Delete user "${name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
      if (res.ok) router.refresh();
      else {
        const data = await res.json().catch(() => ({}));
        setRowMsg({ id, ok: false, text: data.error || "Failed." });
      }
    } catch {
      setRowMsg({ id, ok: false, text: "Network error." });
    }
  }

  const input =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none";

  return (
    <div className="space-y-6">
      {/* Create user */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-medium text-slate-700">Add a new admin user</p>
        <p className="mt-1 text-sm text-slate-500">
          Aap username aur password yahin set karein. Ye user isi password se{" "}
          <code>/mng-x7k9</code> me login kar payega.
        </p>
        <form onSubmit={createUser} className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-[180px] flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-500">Username</label>
            <input
              className={input}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. reception"
              autoComplete="off"
            />
          </div>
          <div className="min-w-[180px] flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-500">Password</label>
            <input
              className={input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="min 6 characters"
              autoComplete="new-password"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
          >
            {busy ? "Creating…" : "Create user"}
          </button>
        </form>
        {msg && (
          <p className={`mt-2 text-sm ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</p>
        )}
      </div>

      {/* Users list */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Username</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Last login</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr className="bg-amber-50/40">
              <td className="px-4 py-3 font-medium text-slate-800">
                {envAdmin}{" "}
                <span className="ml-1 rounded bg-amber-200 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">
                  built-in recovery
                </span>
              </td>
              <td className="px-4 py-3 text-slate-500">—</td>
              <td className="px-4 py-3 text-slate-500">—</td>
              <td className="px-4 py-3 text-right text-xs text-slate-400">
                password: use “Change password”
              </td>
            </tr>

            {users.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  Abhi koi admin user nahi bana. Upar se add karein.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3 font-medium text-slate-800">{u.username}</td>
                  <td className="px-4 py-3 text-slate-500">{fmt(u.created_at)}</td>
                  <td className="px-4 py-3 text-slate-500">{fmt(u.last_login_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-end gap-2">
                      {resetId === u.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
                            value={resetPw}
                            onChange={(e) => setResetPw(e.target.value)}
                            placeholder="new password"
                            autoComplete="new-password"
                          />
                          <button
                            onClick={() => resetPassword(u.id)}
                            className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => {
                              setResetId(null);
                              setResetPw("");
                            }}
                            className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setResetId(u.id);
                              setResetPw("");
                              setRowMsg(null);
                            }}
                            className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Reset password
                          </button>
                          <button
                            onClick={() => deleteUser(u.id, u.username)}
                            className="rounded-lg border border-red-300 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                      {rowMsg && rowMsg.id === u.id && (
                        <span
                          className={`text-xs ${rowMsg.ok ? "text-green-700" : "text-red-600"}`}
                        >
                          {rowMsg.text}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
