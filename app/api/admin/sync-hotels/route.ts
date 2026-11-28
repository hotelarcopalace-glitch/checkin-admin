import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { hasDatabase, query } from "@/lib/db";
import { HID_RE, createHotel, deleteHotel, resetHotel, type SyncHotel } from "@/lib/sync-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Full admin only.
async function requireSession() {
  const store = await cookies();
  const s = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  return !s || s.tag ? null : s;
}

const deny = () => NextResponse.json({ error: "Unauthorized" }, { status: 401 });

/** List of Office Sync hotels (no secrets: only whether each side has been set up). */
export async function GET() {
  if (!(await requireSession())) return deny();
  if (!hasDatabase()) return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  const rows = await query<SyncHotel>(`SELECT * FROM sync_hotels ORDER BY created_at DESC`);
  return NextResponse.json({
    hotels: rows.map((h) => ({
      id: h.id,
      name: h.name,
      registered: !!h.write_hash,
      setupPending: !!h.setup_hash,
      quotaMb: h.quota_mb,
      usedBytes: Number(h.used_bytes),
      files: h.files,
      pushedAt: h.pushed_at,
      pulledAt: h.pulled_at,
      summaryAt: h.summary_at,
      active: h.active,
      createdAt: h.created_at,
    })),
  });
}

/** Create a hotel: {"name": "...", "quotaMb": 1024}  ->  {"id", "setup"} (the setup code is shown this once). */
export async function POST(req: Request) {
  if (!(await requireSession())) return deny();
  if (!hasDatabase()) return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const name = String(b?.name ?? "").trim().slice(0, 80);
  const quotaMb = Math.min(20_000, Math.max(100, Math.round(Number(b?.quotaMb ?? 1024)) || 1024));
  if (name.length < 2) return NextResponse.json({ error: "Enter the hotel name." }, { status: 400 });
  return NextResponse.json(await createHotel(name, quotaMb));
}

/** {"id", "action": "reset" | "enable" | "disable"}: new setup code (old tokens stop working), or switch sync on / off. */
export async function PATCH(req: Request) {
  if (!(await requireSession())) return deny();
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const id = String(b?.id ?? "");
  if (!HID_RE.test(id)) return NextResponse.json({ error: "Bad hotel id" }, { status: 400 });
  if (b?.action === "reset") {
    const setup = await resetHotel(id);
    return setup ? NextResponse.json({ id, setup }) : NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (b?.action === "enable" || b?.action === "disable") {
    await query(`UPDATE sync_hotels SET active = $2 WHERE id = $1`, [id, b.action === "enable"]);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Bad action" }, { status: 400 });
}

/** {"id", "confirm": "DELETE"}: removes the hotel and its stored data. */
export async function DELETE(req: Request) {
  if (!(await requireSession())) return deny();
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const id = String(b?.id ?? "");
  if (!HID_RE.test(id) || b?.confirm !== "DELETE") return NextResponse.json({ error: "Bad request" }, { status: 400 });
  await deleteHotel(id);
  return NextResponse.json({ ok: true });
}
