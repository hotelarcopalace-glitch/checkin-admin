"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Scrim, csvCell, downloadText, fmtDate, fmtDateYear, money, money0 } from "./build-shared";
import type { Entry, Kind, Party, PartyKind, Project } from "./build-shared";

// BuildKhata: supplier / labour khata (parties and their ledgers) and in-app user management for admins.

const WORD: Record<PartyKind, { one: string; many: string; ic: string; add: string }> = {
  SUP: { one: "supplier", many: "Suppliers", ic: "📦", add: "＋ Add supplier" },
  LAB: { one: "labour", many: "Labour", ic: "👷", add: "＋ Add labour" },
};
const CAT_WORD: Record<Kind, string> = { IN: "Payment", MAT: "Material", LAB: "Labour" };

async function send(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, j };
}

/* ---------------------------------------------------------------- Khata tab */

export function PartiesView({ parties, entries, onOpen, onAdd }: { parties: Party[]; entries: Entry[]; onOpen: (id: string) => void; onAdd: (kind: PartyKind) => void }) {
  const [tab, setTab] = useState<PartyKind>("SUP");
  const stats = useMemo(() => {
    const m: Record<string, { total: number; n: number; last: string }> = {};
    for (const e of entries) {
      if (!e.partyId) continue;
      const s = (m[e.partyId] = m[e.partyId] || { total: 0, n: 0, last: "" });
      s.total += e.amount;
      s.n += 1;
      if (e.date > s.last) s.last = e.date;
    }
    return m;
  }, [entries]);
  const list = parties.filter((p) => p.kind === tab && p.active);
  const count = (k: PartyKind) => parties.filter((p) => p.kind === k && p.active).length;
  const W = WORD[tab];
  return (
    <>
      <div className="sec-h"><h3>Khata</h3><button className="pill" onClick={() => onAdd(tab)}>{W.add}</button></div>
      <div className="seg">
        <button className={tab === "SUP" ? "on" : ""} onClick={() => setTab("SUP")}>Suppliers · {count("SUP")}</button>
        <button className={tab === "LAB" ? "on" : ""} onClick={() => setTab("LAB")}>Labour · {count("LAB")}</button>
      </div>
      {list.length ? (
        <div className="card">
          {list.map((p) => {
            const s = stats[p.id];
            return (
              <button key={p.id} className="pcard" onClick={() => onOpen(p.id)}>
                <span className={"pav " + p.kind}>{W.ic}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="nm">{p.name}</div>
                  <div className="cl">{s ? `${s.n} payment${s.n > 1 ? "s" : ""} · last ${fmtDate(s.last)}` : "No payments yet"}</div>
                </div>
                <div className="bal"><div className="b tnum">{money(s?.total || 0)}</div><div className="t">total paid</div></div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="empty">No {W.many.toLowerCase()} yet. Tap “{W.add.replace("＋ ", "")}”, or type a new name while making a payment.</div>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- Party sheet (create / edit) */

export function PartySheet({ kind, party, onClose, onSaved }: { kind: PartyKind; party?: Party; onClose: () => void; onSaved: (p: Party) => void }) {
  const [k, setK] = useState<PartyKind>(party?.kind || kind);
  const [name, setName] = useState(party?.name || "");
  const [phone, setPhone] = useState(party?.phone || "");
  const [note, setNote] = useState(party?.note || "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim()) { setErr("Enter a name."); return; }
    setBusy(true); setErr("");
    try {
      const body = party ? { id: party.id, name, phone, note } : { kind: k, name, phone, note };
      const r = await send("/api/build/party", party ? "PATCH" : "POST", body);
      if (!r.ok) { setErr(r.j.error || "Could not save."); setBusy(false); return; }
      onSaved(r.j.party);
    } catch { setErr("Network error."); setBusy(false); }
  }

  return (
    <Scrim onClose={onClose}>
      <div className="grab" />
      <h2>{party ? "Edit " : "New "}{WORD[k].one}</h2>
      {!party && (
        <div className="seg" style={{ marginTop: 12 }}>
          <button className={k === "SUP" ? "on" : ""} onClick={() => setK("SUP")}>Supplier</button>
          <button className={k === "LAB" ? "on" : ""} onClick={() => setK("LAB")}>Labour</button>
        </div>
      )}
      <div className="field"><label>Name</label><input value={name} onChange={(e) => { setName(e.target.value); setErr(""); }} placeholder={k === "SUP" ? "e.g. Sharma Cement Store" : "e.g. Raju Mistri"} /></div>
      <div className="field"><label>Mobile · optional</label><input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98290 12345" /></div>
      <div className="field"><label>Note · optional</label><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Cement, GST no. etc." /></div>
      {err && <div className="err show">{err}</div>}
      <div className="srow">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={busy}>{busy ? "Saving…" : party ? "Save" : `Save ${WORD[k].one}`}</button>
      </div>
    </Scrim>
  );
}

/* ---------------------------------------------------------------- Ledger */

export function PartyLedger({ party, entries, projects, onEdit }: { party?: Party; entries: Entry[]; projects: Project[]; onEdit: () => void }) {
  const [pid, setPid] = useState("");
  const [copied, setCopied] = useState(false);
  const projName = useMemo(() => { const m: Record<string, string> = {}; projects.forEach((p) => (m[p.id] = p.name)); return m; }, [projects]);
  const all = useMemo(() => (party ? entries.filter((e) => e.partyId === party.id) : []), [entries, party]);
  const projIds = useMemo(() => Array.from(new Set(all.map((e) => e.projectId))), [all]);
  const list = pid ? all.filter((e) => e.projectId === pid) : all;

  // Oldest first for the running total, shown newest first.
  const asc = useMemo(() => [...list].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : Number(a.id) - Number(b.id))), [list]);
  const rows = useMemo(() => {
    let run = 0;
    return asc.map((e) => { run += e.amount; return { e, run }; }).reverse();
  }, [asc]);
  const total = list.reduce((a, e) => a + e.amount, 0);
  if (!party) return <div className="empty">This name was not found.</div>;

  const scope = pid ? projName[pid] || "Project" : "All projects";
  function csv() {
    const lines = [["Date", "Project", "Category", "Note", "Paid", "Running total", "By user"].join(",")];
    for (const { e, run } of [...rows].reverse()) {
      lines.push([csvCell(e.date), csvCell(projName[e.projectId] || ""), csvCell(e.category), csvCell(e.note), e.amount, run, csvCell(e.user)].join(","));
    }
    lines.push(["", "", "", "Total paid", total, "", ""].join(","));
    downloadText(`Khata_${party!.name.replace(/[^\w]+/g, "_")}.csv`, lines.join("\n"));
  }
  async function share() {
    const text =
      `${party!.name} — ${WORD[party!.kind].one} khata (${scope})\n` +
      rows.slice().reverse().map(({ e }) => `${fmtDateYear(e.date)}  ₹${money0(e.amount)}  ${projName[e.projectId] || ""}${e.note ? " · " + e.note : ""}`).join("\n") +
      `\nTotal paid: ${money(total)}`;
    try {
      if (navigator.share) { await navigator.share({ title: `${party!.name} khata`, text }); return; }
    } catch { return; }
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* ignore */ }
  }

  return (
    <>
      <div className="hero">
        <div className="lab">{WORD[party.kind].ic} {party.name}{party.phone ? " · " + party.phone : ""}</div>
        <div className="big tnum" style={{ color: "var(--out)" }}>{money(total)}</div>
        <div className="lab">Total paid · {list.length} payment{list.length === 1 ? "" : "s"}{!pid && projIds.length > 1 ? ` · ${projIds.length} projects` : ""}</div>
        {party.note && <div className="vnote">{party.note}</div>}
      </div>
      {projIds.length > 1 && (
        <div className="chips">
          <button className={"chip" + (!pid ? " on" : "")} onClick={() => setPid("")}>All projects</button>
          {projIds.map((id) => <button key={id} className={"chip" + (pid === id ? " on" : "")} onClick={() => setPid(id)}>{projName[id] || "Project"}</button>)}
        </div>
      )}
      {rows.length ? (
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="led">
            <thead><tr><th>Date</th><th className="r">Paid</th><th className="r">Total</th></tr></thead>
            <tbody>
              {rows.map(({ e, run }) => (
                <tr key={e.id}>
                  <td>{fmtDate(e.date)}<span className="sub">{[projName[e.projectId], e.category, e.note].filter(Boolean).join(" · ")}</span></td>
                  <td className="r n">{money0(e.amount)}</td>
                  <td className="r n">{money0(run)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td>Total</td><td className="r n">{money0(total)}</td><td /></tr></tfoot>
          </table>
        </div>
      ) : (
        <div className="empty">No payments to {party.name} yet. Pick this name in a {party.kind === "SUP" ? "material purchase" : "labour payment"} and it shows up here.</div>
      )}
      <div className="srow" style={{ marginTop: 0 }}>
        <button className="btn ghost" onClick={csv} disabled={!rows.length}>⬇ CSV</button>
        <button className="btn ghost" onClick={share} disabled={!rows.length}>{copied ? "Copied ✓" : "Share"}</button>
        <button className="btn ghost" onClick={onEdit}>✎ Edit</button>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- Name picker used in the payment form */

export function PartyPicker({ kind, parties, partyId, text, onChange }: { kind: PartyKind; parties: Party[]; partyId: string; text: string; onChange: (partyId: string, text: string) => void }) {
  const [open, setOpen] = useState(false);
  const W = WORD[kind];
  const q = text.trim().toLowerCase();
  const pool = parties.filter((p) => p.kind === kind && p.active);
  const matches = pool.filter((p) => !q || p.name.toLowerCase().includes(q)).slice(0, 8);
  const exact = pool.some((p) => p.name.toLowerCase() === q);
  return (
    <div className="field">
      <label>{W.one === "supplier" ? "Supplier" : "Labour name"}</label>
      <input
        value={text}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 160)}
        onChange={(e) => { onChange("", e.target.value); setOpen(true); }}
        placeholder={`Pick or type a ${W.one} name`}
      />
      {partyId && <div className="pk-note">✓ Linked to the {W.one}'s khata</div>}
      {!partyId && text.trim() && !open && <div className="pk-note">New name — it will be added to your {W.many.toLowerCase()}</div>}
      {open && (matches.length > 0 || (q && !exact)) && (
        <div className="opts">
          {matches.map((p) => (
            <button key={p.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(p.id, p.name); setOpen(false); }}>{p.name}</button>
          ))}
          {q && !exact && (
            <button type="button" className="new" onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange("", text.trim()); setOpen(false); }}>
              ＋ Create “{text.trim()}” as new {W.one}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Manage users (admin only) */

type U = { id: string; username: string; name: string; role: "admin" | "staff"; mobile: string | null; active: boolean; hasPassword: boolean; lastLoginAt: string | null };

export function UsersSheet({ onClose }: { onClose: () => void }) {
  const [users, setUsers] = useState<U[] | null>(null);
  const [meId, setMeId] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState("");
  const [f, setF] = useState({ name: "", username: "", mobile: "", role: "staff" as "admin" | "staff" });
  const [en, setEn] = useState("");
  const [em, setEm] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await send("/api/build/users", "GET");
      if (!r.ok) { setErr(r.j.error || "Could not load users."); return; }
      setUsers(r.j.users);
      setMeId(r.j.meId);
    } catch { setErr("Network error."); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function act(body: Record<string, unknown>, ok: string) {
    setBusy(true); setErr(""); setMsg("");
    try {
      const r = await send("/api/build/users", "PATCH", body);
      if (!r.ok) { setErr(r.j.error || "Could not save."); setBusy(false); return false; }
      setMsg(ok);
      await load();
      setBusy(false);
      return true;
    } catch { setErr("Network error."); setBusy(false); return false; }
  }

  async function add() {
    if (!f.name.trim() || !f.username.trim() || !f.mobile.trim()) { setErr("Enter name, username and mobile number."); return; }
    setBusy(true); setErr(""); setMsg("");
    try {
      const r = await send("/api/build/users", "POST", f);
      if (!r.ok) { setErr(r.j.error || "Could not add."); setBusy(false); return; }
      setMsg(`Added ${f.username.trim().toLowerCase()}. Their password is blank: they sign in with just the username and set one.`);
      setF({ name: "", username: "", mobile: "", role: "staff" });
      setAdding(false);
      await load();
    } catch { setErr("Network error."); }
    setBusy(false);
  }

  return (
    <Scrim onClose={onClose}>
      <div className="grab" />
      <h2>Manage users</h2>
      {err && <div className="err show">{err}</div>}
      {msg && <div className="okmsg">{msg}</div>}
      {!users && !err && <div className="empty">Loading…</div>}
      {users && (
        <div className="card" style={{ marginTop: 12 }}>
          {users.map((u) => {
            const editing = editId === u.id;
            return (
              <div key={u.id} className={"urow" + (u.active ? "" : " off")}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="nm">
                    {u.name} <span className={"tag " + (u.role === "admin" ? "adm" : "stf")}>{u.role === "admin" ? "Admin" : "Staff"}</span>
                    {!u.active && <span className="tag offt">Switched off</span>}
                  </div>
                  <div className="cl">{u.username} · {u.mobile || "no mobile"} · {u.hasPassword ? "password set" : "password blank"}</div>
                  {editing ? (
                    <div className="uedit">
                      <input value={en} onChange={(e) => setEn(e.target.value)} placeholder="Name" />
                      <input value={em} onChange={(e) => setEm(e.target.value)} inputMode="tel" placeholder="Mobile" />
                      <div className="mini">
                        <button disabled={busy} onClick={async () => { if (await act({ id: u.id, name: en, mobile: em }, "Saved.")) setEditId(""); }}>Save</button>
                        <button onClick={() => setEditId("")}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="mini">
                      <button onClick={() => { setEditId(u.id); setEn(u.name); setEm(u.mobile || ""); }}>Edit</button>
                      {u.active && <button disabled={busy} onClick={() => act({ id: u.id, role: u.role === "admin" ? "staff" : "admin" }, u.role === "admin" ? "Now staff." : "Now admin.")}>{u.role === "admin" ? "Make staff" : "Make admin"}</button>}
                      {u.active && <button disabled={busy} onClick={() => { if (window.confirm(`Clear the password of ${u.username}? Anyone who knows the username can sign in until a new password is set.`)) act({ id: u.id, blankPassword: true }, "Password cleared."); }}>Blank password</button>}
                      <button className="d" disabled={busy} onClick={() => act({ id: u.id, active: !u.active }, u.active ? "Switched off." : "Switched on.")}>{u.active ? "Switch off" : "Switch on"}</button>
                      {u.id === meId && <span className="you">You</span>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {adding ? (
        <div className="card cpad" style={{ marginTop: 12 }}>
          <div className="eyebrow">Add user</div>
          <div className="field" style={{ marginTop: 8 }}><label>Name</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div className="field"><label>Username</label><input autoCapitalize="none" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></div>
          <div className="field"><label>Mobile number</label><input inputMode="tel" value={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.value })} /></div>
          <div className="field"><label>Role</label>
            <div className="seg">
              <button className={f.role === "staff" ? "on" : ""} onClick={() => setF({ ...f, role: "staff" })}>Staff</button>
              <button className={f.role === "admin" ? "on" : ""} onClick={() => setF({ ...f, role: "admin" })}>Admin</button>
            </div>
          </div>
          <div className="demo" style={{ textAlign: "left" }}>The password starts blank. They sign in with just the username, then set a password.</div>
          <div className="srow" style={{ marginTop: 6 }}>
            <button className="btn ghost" onClick={() => setAdding(false)}>Cancel</button>
            <button className="btn primary" onClick={add} disabled={busy}>{busy ? "Adding…" : "Add user"}</button>
          </div>
        </div>
      ) : (
        <div className="srow">
          <button className="btn ghost" onClick={onClose}>Close</button>
          <button className="btn primary" onClick={() => { setAdding(true); setMsg(""); setErr(""); }}>＋ Add user</button>
        </div>
      )}
    </Scrim>
  );
}

export const KHATA_CSS = `
.bk .seg{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:3px;gap:2px}
.bk .seg button{padding:9px 6px;font-size:13.5px;font-weight:600;color:var(--muted);border-radius:9px}
.bk .seg button.on{background:var(--brand-soft);color:var(--brand)}
.bk .pav{width:38px;height:38px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:18px;flex:0 0 auto}
.bk .pav.SUP{background:var(--out-soft)}
.bk .pav.LAB{background:var(--lab-soft)}
.bk .chips{display:flex;gap:6px;flex-wrap:wrap}
.bk .chip{font-size:12.5px;font-weight:600;border:1px solid var(--line);background:var(--surface);border-radius:999px;padding:5px 11px;color:var(--muted)}
.bk .chip.on{background:var(--brand-soft);color:var(--brand);border-color:transparent}
.bk .led{width:100%;border-collapse:collapse;font-size:13px}
.bk .led th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--faint);padding:9px 12px;border-bottom:1px solid var(--line)}
.bk .led td{padding:10px 12px;border-top:1px solid var(--line);vertical-align:top}
.bk .led .r{text-align:right}
.bk .led td.n{font-variant-numeric:tabular-nums;font-weight:600;white-space:nowrap}
.bk .led .sub{display:block;color:var(--muted);font-size:11.5px;font-weight:400;margin-top:1px}
.bk .led tfoot td{border-top:2px solid var(--line);font-weight:700}
.bk .opts{border:1px solid var(--line);border-radius:11px;background:var(--surface);overflow:hidden;margin-top:6px}
.bk .opts button{display:block;width:100%;text-align:left;padding:11px 13px;font-size:14.5px;border-top:1px solid var(--line)}
.bk .opts button:first-child{border-top:0}
.bk .opts button.new{color:var(--brand);font-weight:700;background:var(--brand-soft)}
.bk .pk-note{font-size:12px;color:var(--faint);margin-top:4px}
.bk .urow{display:flex;gap:10px;padding:12px 14px;border-top:1px solid var(--line)}
.bk .card .urow:first-child{border-top:none}
.bk .urow.off .nm,.bk .urow.off .cl{opacity:.55}
.bk .urow .nm{font-weight:600;font-size:15px}
.bk .urow .cl{font-size:12px;color:var(--muted);margin-top:1px;word-break:break-word}
.bk .tag{font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:999px;margin-left:5px;vertical-align:1px}
.bk .tag.adm{background:var(--brand-soft);color:var(--brand)}
.bk .tag.stf{background:var(--lab-soft);color:var(--lab-ink)}
.bk .tag.offt{background:var(--line);color:var(--muted)}
.bk .mini{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;align-items:center}
.bk .mini button{font-size:12px;font-weight:600;border:1px solid var(--line);background:var(--surface-2);border-radius:8px;padding:5px 9px}
.bk .mini button.d{color:var(--out)}
.bk .mini button:disabled{opacity:.5}
.bk .mini .you{font-size:11px;color:var(--faint)}
.bk .uedit{display:grid;gap:8px;margin-top:8px}
.bk .uedit input{height:42px;border:1px solid var(--line);border-radius:10px;padding:0 11px;background:var(--surface-2);width:100%}
.bk .okmsg{margin-top:8px;font-size:12.5px;color:var(--in-ink);background:var(--in-soft);border-radius:10px;padding:8px 11px}
`;
