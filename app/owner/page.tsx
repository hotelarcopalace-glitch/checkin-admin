"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * CHECKIN Owner: the hotel's Night Audit Summary (Reports > MIS > Night Audit Summary in the
 * desktop program) on the owner's phone: sold rooms, collection and sales, for each of the last
 * weeks, with month-to-date and year-to-date.
 *
 * Where the figures come from: the hotel PC (UTILITY.exe, Office Sync sender) runs that very
 * report in the background at every sync, encrypts its lines with the hotel's "mobile key" and
 * sends them to /api/sync/<hotel id>/summary. This page fetches the blob and opens it in the
 * browser with the key the owner typed or scanned once (UTILITY > Misc. > Office Sync > 7).
 * The key stays in this phone (localStorage); the server only ever sees a token derived from it
 * and cannot read the figures.
 *
 * Must stay in step with MobSend() / MobileKey() in CKSYNC.PRG and MOBSUM.PRG (desktop suite):
 *   key text   = <hotel id, 8> + base32(secret, 20 bytes)      (shown in groups of 4)
 *   read token = hex(HMAC-SHA256(secret, "cksync-mread-v1"))
 *   blob       = nonce(12) + AES-256-GCM(JSON) + tag(16), key = HMAC-SHA256(secret, "cksync-menc-v1")
 *   JSON       = {"v":1,"asof":"YYYYMMDDHHMMSS","wdate":"YYYYMMDD","days":{"YYYYMMDD":"H|..\nR|..|t|m|y\n.."}}
 */

const B32 = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LS_HOTELS = "ckowner.hotels.v1";
const LS_ACTIVE = "ckowner.active.v1";
const LS_DATA = "ckowner.data.v1.";

type Hotel = { hid: string; key: string; name: string };
type Row = { head: boolean; label: string; t: number | null; m: number | null; y: number | null };
type Snapshot = { name: string; at: string; asof: string; wdate: string; days: Record<string, Row[]> };
type Period = "t" | "m" | "y";
type Metric = "sale" | "coll" | "rooms";
type LoadState = "idle" | "loading" | "empty" | "denied" | "offline";

/* ------------------------------------------------------------------ key and crypto */

function parseKey(text: string): { hid: string; key: string } | null {
  let s = text.trim();
  const i = s.indexOf("#k=");
  if (i >= 0) s = s.slice(i + 3);
  s = s.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (s.length !== 40) return null;
  const hid = s.slice(0, 8).toLowerCase();
  const key = s.slice(8);
  for (const ch of key) if (!B32.includes(ch)) return null;
  return { hid, key };
}

function b32decode(s: string): Uint8Array {
  const out: number[] = [];
  let buf = 0;
  let bits = 0;
  for (const ch of s) {
    buf = (buf << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((buf >> bits) & 0xff);
      buf &= (1 << bits) - 1;
    }
  }
  return new Uint8Array(out);
}

async function hmac(key: Uint8Array, msg: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg) as BufferSource));
}

const hex = (u: Uint8Array) => Array.from(u, (b) => b.toString(16).padStart(2, "0")).join("");

function parseRows(text: string): Row[] {
  const rows: Row[] = [];
  const num = (s: string | undefined) => (s === undefined || s === "" || !isFinite(Number(s)) ? null : Number(s));
  for (const line of text.split("\n")) {
    const p = line.split("|");
    if (p[0] === "H" && p[1]) rows.push({ head: true, label: p[1], t: null, m: null, y: null });
    else if (p[0] === "R" && p[1]) rows.push({ head: false, label: p[1], t: num(p[2]), m: num(p[3]), y: num(p[4]) });
  }
  return rows;
}

async function fetchSnapshot(h: Hotel): Promise<{ state: LoadState; snap?: Snapshot }> {
  const secret = b32decode(h.key);
  const token = hex(await hmac(secret, "cksync-mread-v1"));
  let res: Response;
  try {
    res = await fetch(`/api/sync/${h.hid}/summary`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
  } catch {
    return { state: "offline" };
  }
  if (res.status === 204) return { state: "empty" };
  if (res.status === 401) return { state: "denied" };
  if (!res.ok) return { state: "offline" };
  try {
    const j = (await res.json()) as { name: string; at: string; blob: string };
    const raw = Uint8Array.from(atob(j.blob), (c) => c.charCodeAt(0));
    const enc = await hmac(secret, "cksync-menc-v1");
    const k = await crypto.subtle.importKey("raw", enc as BufferSource, "AES-GCM", false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) as BufferSource }, k, raw.slice(12) as BufferSource);
    const d = JSON.parse(new TextDecoder().decode(plain)) as { asof: string; wdate: string; days: Record<string, string> };
    const days: Record<string, Row[]> = {};
    for (const [date, text] of Object.entries(d.days ?? {})) if (/^\d{8}$/.test(date)) days[date] = parseRows(String(text));
    return { state: "idle", snap: { name: String(j.name ?? ""), at: String(j.at ?? ""), asof: String(d.asof ?? ""), wdate: String(d.wdate ?? ""), days } };
  } catch {
    // the blob did not open with this key
    return { state: "denied" };
  }
}

/* ------------------------------------------------------------------ small helpers */

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9%]/g, "");
const find = (rows: Row[] | undefined, label: string) => rows?.find((r) => !r.head && norm(r.label) === norm(label));

const toDate = (d: string) => new Date(Number(d.slice(0, 4)), Number(d.slice(4, 6)) - 1, Number(d.slice(6, 8)));
const niceDate = (d: string) => toDate(d).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const shortDate = (d: string) => toDate(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

function niceStamp(iso: string) {
  const t = new Date(iso);
  if (isNaN(t.getTime())) return "";
  return t.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

const isCount = (label: string) => ["NEWARRIVALS", "SOLDROOMS"].includes(norm(label));
const isPercent = (label: string) => norm(label).includes("%");

function money(n: number | null, decimals = 2) {
  if (n === null) return "—";
  return n.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** 1,25,000 -> "1.25 L", 1,20,00,000 -> "1.2 Cr": big figures for the three tiles at the top. */
function compact(n: number | null) {
  if (n === null) return "—";
  const a = Math.abs(n);
  if (a >= 1e7) return `${(n / 1e7).toFixed(2).replace(/\.?0+$/, "")} Cr`;
  if (a >= 1e5) return `${(n / 1e5).toFixed(2).replace(/\.?0+$/, "")} L`;
  return Math.round(n).toLocaleString("en-IN");
}

function cell(r: Row, p: Period) {
  const v = r[p];
  if (v === null) return "—";
  if (isCount(r.label)) return Math.round(v).toLocaleString("en-IN");
  if (isPercent(r.label)) return `${v.toFixed(2)}%`;
  return money(v);
}

const PERIODS: { id: Period; label: string }[] = [
  { id: "t", label: "Day" },
  { id: "m", label: "Month to date" },
  { id: "y", label: "Year to date" },
];

const METRICS: { id: Metric; label: string; row: string }[] = [
  { id: "sale", label: "Sale", row: "TOTAL SALE" },
  { id: "coll", label: "Collection", row: "Total :" },
  { id: "rooms", label: "Sold rooms", row: "SOLD ROOMS" },
];

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: the app still works for this visit */
  }
}

/* ------------------------------------------------------------------ page */

export default function OwnerPage() {
  const [ready, setReady] = useState(false);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [active, setActive] = useState("");
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [state, setState] = useState<LoadState>("idle");
  const [date, setDate] = useState("");
  const [period, setPeriod] = useState<Period>("t");
  const [metric, setMetric] = useState<Metric>("sale");
  const [sheet, setSheet] = useState(false);
  const lastFetch = useRef(0);

  const hotel = hotels.find((h) => h.hid === active) ?? hotels[0];

  const refresh = useCallback(async (h: Hotel) => {
    setState("loading");
    lastFetch.current = Date.now();
    const r = await fetchSnapshot(h);
    if (r.snap) {
      setSnap(r.snap);
      save(LS_DATA + h.hid, r.snap);
      if (r.snap.name && r.snap.name !== h.name) {
        setHotels((list) => {
          const next = list.map((x) => (x.hid === h.hid ? { ...x, name: r.snap!.name } : x));
          save(LS_HOTELS, next);
          return next;
        });
      }
    }
    setState(r.state);
  }, []);

  const addHotel = useCallback((text: string): string | null => {
    const k = parseKey(text);
    if (!k) return "That does not look like a mobile app key. It has the hotel id and 8 groups of 4 letters.";
    setHotels((list) => {
      const next = [...list.filter((x) => x.hid !== k.hid), { hid: k.hid, key: k.key, name: "" }];
      save(LS_HOTELS, next);
      return next;
    });
    setActive(k.hid);
    save(LS_ACTIVE, k.hid);
    return null;
  }, []);

  // first load: saved hotels, and a key that arrived in the link (#k=...), which is then taken out of the address
  useEffect(() => {
    const list = load<Hotel[]>(LS_HOTELS, []).filter((h) => h && typeof h.hid === "string" && typeof h.key === "string");
    setHotels(list);
    setActive(load<string>(LS_ACTIVE, list[0]?.hid ?? ""));
    if (location.hash.startsWith("#k=")) {
      addHotel(location.hash);
      history.replaceState(null, "", location.pathname);
    }
    setReady(true);
  }, [addHotel]);

  // hotel chosen: show what this phone saw last, then fetch the latest
  useEffect(() => {
    if (!ready || !hotel) return;
    setSnap(load<Snapshot | null>(LS_DATA + hotel.hid, null));
    setDate("");
    void refresh(hotel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, hotel?.hid, hotel?.key]);

  // coming back to the app after a while: fetch again
  useEffect(() => {
    const onShow = () => {
      if (document.visibilityState === "visible" && hotel && Date.now() - lastFetch.current > 60_000) void refresh(hotel);
    };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [hotel, refresh]);

  const dates = useMemo(() => (snap ? Object.keys(snap.days).sort() : []), [snap]);

  // like the report itself: open on the last audited day (the day before the working date)
  const defaultDate = useMemo(() => {
    if (!snap || !dates.length) return "";
    const audited = dates.filter((d) => d < snap.wdate);
    return audited.length ? audited[audited.length - 1] : dates[dates.length - 1];
  }, [snap, dates]);

  const sel = date && dates.includes(date) ? date : defaultDate;
  const rows = snap && sel ? snap.days[sel] : undefined;
  const idx = dates.indexOf(sel);
  const running = !!snap && sel === snap.wdate;

  if (!ready) return <main className="min-h-dvh bg-[#f6f2ea]" />;

  if (!hotel) return <Setup onAdd={addHotel} />;

  const removeHotel = (hid: string) => {
    const next = hotels.filter((h) => h.hid !== hid);
    setHotels(next);
    save(LS_HOTELS, next);
    try {
      localStorage.removeItem(LS_DATA + hid);
    } catch {
      /* ignore */
    }
    const a = next[0]?.hid ?? "";
    setActive(a);
    save(LS_ACTIVE, a);
    if (!next.length) setSnap(null);
  };

  const stale = snap ? Date.now() - new Date(snap.at).getTime() > 2 * 60 * 60 * 1000 : false;

  return (
    <main className="min-h-dvh bg-[#f6f2ea] pb-10 text-[#241d12]">
      {/* top: hotel, date, period */}
      <div className="sticky top-0 z-10 bg-[#1c1710] px-4 pb-3 pt-[calc(env(safe-area-inset-top)+12px)] text-white shadow-md">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <button onClick={() => setSheet(true)} className="min-w-0 flex-1 text-left" aria-label="Hotels">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[17px] font-semibold">{hotel.name || snap?.name || "My hotel"}</span>
              <svg width="12" height="12" viewBox="0 0 12 12" className="shrink-0 opacity-70" aria-hidden>
                <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="text-[11px] uppercase tracking-[0.14em] text-[#efb04e]">Night Audit Summary</div>
          </button>
          <button
            onClick={() => void refresh(hotel)}
            disabled={state === "loading"}
            aria-label="Refresh"
            className="grid h-10 w-10 place-items-center rounded-full bg-white/10 active:bg-white/20 disabled:opacity-60"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" className={state === "loading" ? "animate-spin" : ""} aria-hidden>
              <path
                d="M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        {snap && sel && (
          <div className="mx-auto mt-3 max-w-xl">
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => idx > 0 && setDate(dates[idx - 1])}
                disabled={idx <= 0}
                aria-label="Previous day"
                className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-lg active:bg-white/20 disabled:opacity-30"
              >
                ‹
              </button>
              <div className="text-center">
                <div className="text-[15px] font-semibold">{niceDate(sel)}</div>
                <div className={`text-[11px] ${running ? "text-[#efb04e]" : "text-white/60"}`}>{running ? "Running day — figures so far" : "Night audit done"}</div>
              </div>
              <button
                onClick={() => idx < dates.length - 1 && setDate(dates[idx + 1])}
                disabled={idx >= dates.length - 1}
                aria-label="Next day"
                className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-lg active:bg-white/20 disabled:opacity-30"
              >
                ›
              </button>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-1 rounded-full bg-white/10 p-1 text-[13px]">
              {PERIODS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPeriod(p.id)}
                  className={`rounded-full py-1.5 font-medium transition ${period === p.id ? "bg-[#ef9f27] text-[#1c1710]" : "text-white/75"}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mx-auto max-w-xl px-4">
        {state === "denied" && (
          <Notice tone="red" title="This key no longer opens the hotel's figures">
            The hotel was set up again, or the key was typed wrongly. Remove this hotel (tap its name above) and add it again with the key shown on the
            hotel computer: UTILITY › Misc. › Office Sync › 7. Mobile app key.
          </Notice>
        )}
        {state === "offline" && (
          <Notice tone="amber" title="Could not reach the server">
            Check the internet on this phone and tap refresh.{snap ? " Showing what this phone saw last." : ""}
          </Notice>
        )}
        {state === "empty" && !snap && (
          <Notice tone="amber" title="The hotel has not sent anything yet">
            The hotel computer sends its figures by itself every few minutes while it is on and connected to the internet. It needs the latest CHECKIN and
            UTILITY programs.
          </Notice>
        )}
        {stale && state !== "offline" && snap && (
          <Notice tone="amber" title={`Last received from the hotel: ${niceStamp(snap.at)}`}>
            The hotel computer may be switched off or without internet. These are the figures as of that time.
          </Notice>
        )}

        {!snap && state === "loading" && <p className="mt-10 text-center text-sm text-[#7a6f5c]">Getting the figures…</p>}

        {snap && rows && (
          <>
            <Tiles rows={rows} period={period} />
            {running && (
              <p className="mt-3 rounded-xl bg-[#fff6e3] px-3.5 py-2.5 text-[12.5px] leading-snug text-[#7a5410]">
                This day is still running. Collection and F&amp;B are as of now; sold rooms and room revenue are added when the Night Audit is done.
              </p>
            )}
            <Trend snap={snap} dates={dates} sel={sel} metric={metric} onMetric={setMetric} onPick={setDate} />
            <Sections rows={rows} period={period} />
            <p className="mt-6 text-center text-[11.5px] leading-relaxed text-[#8a7f6b]">
                Received from the hotel computer: {niceStamp(snap.at)}
              <br />
              Same figures as Reports › MIS › Night Audit Summary in CHECKIN.
            </p>
          </>
        )}
        {snap && !rows && state !== "loading" && <p className="mt-10 text-center text-sm text-[#7a6f5c]">No report days received yet.</p>}

        <InstallHint />
      </div>

      {sheet && (
        <HotelSheet
          hotels={hotels}
          active={hotel.hid}
          onClose={() => setSheet(false)}
          onPick={(hid) => {
            setActive(hid);
            save(LS_ACTIVE, hid);
            setSheet(false);
          }}
          onRemove={removeHotel}
          onAdd={addHotel}
        />
      )}
    </main>
  );
}

/* ------------------------------------------------------------------ pieces */

function Notice({ tone, title, children }: { tone: "red" | "amber"; title: string; children: React.ReactNode }) {
  const c = tone === "red" ? "border-red-200 bg-red-50 text-red-900" : "border-amber-200 bg-amber-50 text-amber-900";
  return (
    <div className={`mt-4 rounded-2xl border px-4 py-3 ${c}`}>
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-1 text-[13px] leading-snug opacity-90">{children}</div>
    </div>
  );
}

function Tiles({ rows, period }: { rows: Row[]; period: Period }) {
  const sold = find(rows, "SOLD ROOMS");
  const occ = find(rows, "% of OCCUPANCY");
  const coll = find(rows, "Total :");
  const sale = find(rows, "TOTAL SALE");
  const tile = "rounded-2xl bg-white px-3 py-3 shadow-sm ring-1 ring-black/5";
  return (
    <div className="mt-4 grid grid-cols-3 gap-2.5">
      <div className={tile}>
        <div className="text-[11px] font-medium uppercase tracking-wide text-[#8a7f6b]">Sold rooms</div>
        <div className="mt-1 text-[24px] font-semibold leading-none tabular-nums">{sold && sold[period] !== null ? Math.round(sold[period]!).toLocaleString("en-IN") : "—"}</div>
        <div className="mt-1.5 text-[11.5px] text-[#8a7f6b]">{occ && occ[period] !== null ? `${occ[period]!.toFixed(1)}% occupied` : " "}</div>
      </div>
      <div className={tile}>
        <div className="text-[11px] font-medium uppercase tracking-wide text-[#8a7f6b]">Collection</div>
        <div className="mt-1 text-[24px] font-semibold leading-none tabular-nums">{compact(coll ? coll[period] : null)}</div>
        <div className="mt-1.5 text-[11.5px] text-[#8a7f6b]">₹ received</div>
      </div>
      <div className={tile}>
        <div className="text-[11px] font-medium uppercase tracking-wide text-[#8a7f6b]">Sale</div>
        <div className="mt-1 text-[24px] font-semibold leading-none tabular-nums">{compact(sale ? sale[period] : null)}</div>
        <div className="mt-1.5 text-[11.5px] text-[#8a7f6b]">₹ before taxes</div>
      </div>
    </div>
  );
}

function Trend({
  snap,
  dates,
  sel,
  metric,
  onMetric,
  onPick,
}: {
  snap: Snapshot;
  dates: string[];
  sel: string;
  metric: Metric;
  onMetric: (m: Metric) => void;
  onPick: (d: string) => void;
}) {
  const row = METRICS.find((m) => m.id === metric)!.row;
  const shown = dates.slice(-31);
  const vals = shown.map((d) => find(snap.days[d], row)?.t ?? 0);
  const max = Math.max(1, ...vals);
  if (shown.length < 2) return null;
  const W = 320;
  const H = 96;
  const step = W / shown.length;
  const bar = Math.max(2, step - 2.5);
  const selVal = find(snap.days[sel], row)?.t ?? null;
  return (
    <section className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold">Day by day</h2>
        <div className="flex gap-1 rounded-full bg-[#f1ebdf] p-0.5 text-[12px]">
          {METRICS.map((m) => (
            <button
              key={m.id}
              onClick={() => onMetric(m.id)}
              className={`rounded-full px-2.5 py-1 font-medium ${metric === m.id ? "bg-[#1c1710] text-white" : "text-[#6b604d]"}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img" aria-label="Day by day chart">
        {shown.map((d, i) => {
          const h = Math.max(1.5, (Math.max(0, vals[i]) / max) * (H - 6));
          const on = d === sel;
          return (
            <g key={d} onClick={() => onPick(d)} className="cursor-pointer">
              <rect x={i * step} y={0} width={step} height={H} fill="transparent" />
              <rect x={i * step + (step - bar) / 2} y={H - h} width={bar} height={h} rx={1.5} fill={on ? "#ef9f27" : d === snap.wdate ? "#e9dcc3" : "#cdbf9f"} />
            </g>
          );
        })}
      </svg>
      <div className="mt-1.5 flex justify-between text-[11px] text-[#8a7f6b]">
        <span>{shortDate(shown[0])}</span>
        <span className="font-medium text-[#241d12]">
          {shortDate(sel)}: {metric === "rooms" ? (selVal === null ? "—" : Math.round(selVal)) : `₹ ${money(selVal, 0)}`}
        </span>
        <span>{shortDate(shown[shown.length - 1])}</span>
      </div>
      <p className="mt-1 text-center text-[11px] text-[#a79c88]">Tap a bar to open that day</p>
    </section>
  );
}

/** The report's own sections, in its own order: TOTAL SUMMARY, COLLECTION, OCCUPANCY ANALYSIS. */
function Sections({ rows, period }: { rows: Row[]; period: Period }) {
  const sections: { title: string; rows: Row[] }[] = [];
  for (const r of rows) {
    if (r.head || !sections.length) sections.push({ title: r.head ? r.label : "Summary", rows: [] });
    if (!r.head) sections[sections.length - 1].rows.push(r);
  }
  const titles: Record<string, string> = { TOTALSUMMARY: "Sales", COLLECTION: "Collection", OCCUPANCYANALYSIS: "Rooms" };
  // the line that totals the lines above it, per section
  const totals: Record<string, string> = { TOTALSUMMARY: "TOTALSALE", COLLECTION: "TOTAL" };
  return (
    <>
      {sections.map((s) => {
        const key = norm(s.title);
        const ti = s.rows.findIndex((r) => norm(r.label) === totals[key]);
        const total = ti >= 0 ? s.rows[ti][period] : null;
        return (
          <section key={s.title} className="mt-4 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
            <h2 className="border-b border-[#f0e9dc] px-4 py-2.5 text-[13px] font-semibold">{titles[key] ?? s.title}</h2>
            <ul>
              {s.rows.map((r, i) => {
                const isTotal = i === ti;
                const part = ti >= 0 && i < ti && total && r[period] !== null ? Math.max(0, Math.min(1, r[period]! / total)) : null;
                return (
                  <li key={r.label} className={`px-4 py-2.5 ${isTotal ? "bg-[#fbf3e2]" : ""} ${i ? "border-t border-[#f5efe4]" : ""}`}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className={`text-[13.5px] ${isTotal ? "font-semibold" : "text-[#4a4133]"}`}>{pretty(r.label)}</span>
                      <span className={`tabular-nums ${isTotal ? "text-[16px] font-semibold" : "text-[14px] font-medium"}`}>{cell(r, period)}</span>
                    </div>
                    {part !== null && (
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[#f1ebdf]">
                        <div className="h-full rounded-full bg-[#ef9f27]" style={{ width: `${part * 100}%` }} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </>
  );
}

/** "ROOM REVENUE" -> "Room revenue"; a few of the report's short names spelt out. */
function pretty(label: string) {
  const fixed: Record<string, string> = {
    FB: "F & B",
    BTC: "B.T.C. (credit)",
    EWALLET: "e-Wallet",
    "TOTAL": "Total collection",
    "ROOMRENTAVRG": "Average room rent",
    "%OFOCCUPANCY": "Occupancy",
    "INHOUSEOS": "In house (outstanding)",
    "MISCSERVICES": "Misc. services",
  };
  const k = norm(label);
  if (fixed[k]) return fixed[k];
  const s = label.toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function KeyForm({ onAdd, cta }: { onAdd: (text: string) => string | null; cta: string }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const r = onAdd(text);
        setErr(r);
        if (!r) setText("");
      }}
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        placeholder="ABCD2345-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
        className="w-full rounded-xl border border-[#d9cfbc] bg-white px-3.5 py-3 font-mono text-[15px] uppercase outline-none focus:border-[#ef9f27] focus:ring-2 focus:ring-[#ef9f27]/30"
      />
      {err && <p className="mt-2 text-[13px] text-red-700">{err}</p>}
      <button type="submit" disabled={text.trim().length < 20} className="mt-3 h-12 w-full rounded-xl bg-[#ef9f27] text-[15px] font-semibold text-[#1c1710] active:bg-[#dd8f1c] disabled:opacity-50">
        {cta}
      </button>
    </form>
  );
}

function Setup({ onAdd }: { onAdd: (text: string) => string | null }) {
  return (
    <main className="min-h-dvh bg-[#1c1710] px-5 pb-10 pt-[calc(env(safe-area-inset-top)+36px)] text-white">
      <div className="mx-auto max-w-md">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon-192.png" alt="" width={64} height={64} className="rounded-2xl" />
        <h1 className="mt-5 text-[26px] font-semibold leading-tight">CHECKIN Owner</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-white/75">Sold rooms, collection and sales of your hotel, on your phone. The same figures as the Night Audit Summary report.</p>

        <div className="mt-7 rounded-2xl bg-[#f6f2ea] p-5 text-[#241d12]">
          <h2 className="text-[15px] font-semibold">Add your hotel</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13.5px] leading-snug text-[#5c5242]">
            <li>
              On the hotel computer open <b>UTILITY › Misc. › Office Sync › 7. Mobile app key</b>.
            </li>
            <li>Scan the QR code shown there with this phone&apos;s camera, or type the key below.</li>
          </ol>
          <div className="mt-4">
            <KeyForm onAdd={onAdd} cta="Add hotel" />
          </div>
        </div>
        <p className="mt-5 text-[12px] leading-relaxed text-white/50">
          The key stays in this phone. The figures are locked on the hotel computer before they are sent, and only this key opens them.
        </p>
      </div>
    </main>
  );
}

function HotelSheet({
  hotels,
  active,
  onClose,
  onPick,
  onRemove,
  onAdd,
}: {
  hotels: Hotel[];
  active: string;
  onClose: () => void;
  onPick: (hid: string) => void;
  onRemove: (hid: string) => void;
  onAdd: (text: string) => string | null;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="fixed inset-0 z-20 flex items-end bg-black/50" onClick={onClose}>
      <div className="max-h-[85dvh] w-full overflow-y-auto rounded-t-3xl bg-[#f6f2ea] px-4 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-4" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto max-w-xl">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-black/15" />
          <h2 className="text-[15px] font-semibold">Hotels on this phone</h2>
          <ul className="mt-3 space-y-2">
            {hotels.map((h) => (
              <li key={h.hid} className={`flex items-center gap-2 rounded-xl bg-white px-3.5 py-3 ring-1 ${h.hid === active ? "ring-[#ef9f27]" : "ring-black/5"}`}>
                <button onClick={() => onPick(h.hid)} className="min-w-0 flex-1 text-left">
                  <div className="truncate text-[14.5px] font-medium">{h.name || "Hotel"}</div>
                  <div className="font-mono text-[11px] uppercase text-[#8a7f6b]">{h.hid}</div>
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`Remove ${h.name || "this hotel"} from this phone?`)) onRemove(h.hid);
                  }}
                  className="rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium text-red-700 active:bg-red-50"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          {adding ? (
            <div className="mt-4">
              <p className="mb-2 text-[13px] text-[#5c5242]">Key from the other hotel&apos;s computer (UTILITY › Misc. › Office Sync › 7):</p>
              <KeyForm
                onAdd={(t) => {
                  const r = onAdd(t);
                  if (!r) onClose();
                  return r;
                }}
                cta="Add hotel"
              />
            </div>
          ) : (
            <button onClick={() => setAdding(true)} className="mt-4 h-11 w-full rounded-xl border border-[#d9cfbc] bg-white text-[14px] font-medium active:bg-[#f1ebdf]">
              + Add another hotel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

type InstallEvent = Event & { prompt: () => Promise<void> };

/** "Install" on Android (the browser offers it); on an iPhone, how to put it on the home screen. */
function InstallHint() {
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;
    setIos(/iPhone|iPad|iPod/.test(navigator.userAgent));
    const on = (e: Event) => {
      e.preventDefault();
      setEvt(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", on);
    return () => window.removeEventListener("beforeinstallprompt", on);
  }, []);
  if (evt) {
    return (
      <button
        onClick={() => {
          void evt.prompt();
          setEvt(null);
        }}
        className="mt-6 h-11 w-full rounded-xl bg-[#1c1710] text-[14px] font-medium text-white active:opacity-90"
      >
        Install as an app on this phone
      </button>
    );
  }
  if (ios) {
    return (
      <p className="mt-6 rounded-xl bg-white px-4 py-3 text-[12.5px] leading-snug text-[#5c5242] ring-1 ring-black/5">
        To keep this as an app on your iPhone: tap <b>Share</b> and then <b>Add to Home Screen</b>. The app on the home screen asks for the hotel&apos;s key once more.
      </p>
    );
  }
  return null;
}
