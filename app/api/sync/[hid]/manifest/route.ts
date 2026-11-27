import { NextResponse } from "next/server";
import { MAX_MANIFEST_BYTES, authHotel, getManifest, notePull, parseEnvelope, putManifest } from "@/lib/sync-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ hid: string }> };

/**
 * PUT /api/sync/<hotel id>/manifest   body = the snapshot envelope (see lib/sync-store.ts)
 * Makes it the hotel's current snapshot. 409 + {"missing": [...]} while chunks are still missing.
 */
export async function PUT(req: Request, ctx: Ctx) {
  const { hid } = await ctx.params;
  const auth = await authHotel(hid, req);
  if (!auth || auth.role !== "write") return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const raw = await req.text();
  if (raw.length > MAX_MANIFEST_BYTES) return NextResponse.json({ ok: false, error: "Too large" }, { status: 413 });
  const env = parseEnvelope(raw);
  if (!env) return NextResponse.json({ ok: false, error: "Bad manifest" }, { status: 400 });
  const r = await putManifest(hid, env);
  if (!r.ok) return NextResponse.json({ ok: false, error: "Chunks missing", missing: r.missing }, { status: 409 });
  return NextResponse.json({ ok: true, usedBytes: r.usedBytes });
}

/**
 * GET /api/sync/<hotel id>/manifest   ->   the current snapshot envelope, or 204 when the hotel has not pushed yet.
 * `?ts=<14 digits>`: answers 304 when that is still the current snapshot (the office PC's cheap "anything new?").
 */
export async function GET(req: Request, ctx: Ctx) {
  const { hid } = await ctx.params;
  const auth = await authHotel(hid, req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const raw = await getManifest(hid);
  if (!raw) return new NextResponse(null, { status: 204 });
  const have = new URL(req.url).searchParams.get("ts");
  if (have && /^\d{14}$/.test(have) && raw.includes(`"ts":"${have}"`)) return new NextResponse(null, { status: 304 });
  if (auth.role === "read") await notePull(hid);
  return new NextResponse(raw, { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
