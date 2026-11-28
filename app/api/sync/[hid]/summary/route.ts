import { NextResponse } from "next/server";
import { CHUNK_ID_RE, MAX_SUMMARY_BYTES, authHotel, authMobile, getSummary, putSummary } from "@/lib/sync-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ hid: string }> };

/**
 * PUT /api/sync/<hotel id>/summary   {"rt": "<sha256 of the phones' read token>", "blob": "<base64>"}
 * From the hotel PC (push token): the report summary for the owner phone app, encrypted with the
 * hotel's mobile key. See "Owner phone app" in lib/sync-store.ts.
 */
export async function PUT(req: Request, ctx: Ctx) {
  const { hid } = await ctx.params;
  const auth = await authHotel(hid, req);
  if (!auth || auth.role !== "write") return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const raw = await req.text();
  if (raw.length > MAX_SUMMARY_BYTES) return NextResponse.json({ ok: false, error: "Too large" }, { status: 413 });
  let j: Record<string, unknown> | null = null;
  try {
    j = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    /* handled below */
  }
  const rt = j?.rt;
  const blob = j?.blob;
  if (typeof rt !== "string" || !CHUNK_ID_RE.test(rt) || typeof blob !== "string" || blob.length < 40 || !/^[A-Za-z0-9+/=]+$/.test(blob)) {
    return NextResponse.json({ ok: false, error: "Bad summary" }, { status: 400 });
  }
  // the phones' token must not be one of the tokens that open the full data
  if (rt === auth.hotel.write_hash || rt === auth.hotel.read_hash) {
    return NextResponse.json({ ok: false, error: "Bad summary" }, { status: 400 });
  }
  await putSummary(hid, rt, blob);
  return NextResponse.json({ ok: true });
}

/**
 * GET /api/sync/<hotel id>/summary   ->   {"name", "at", "blob"}   (204 while the hotel has sent nothing yet)
 * For the owner phone app (its own read token). The blob can be opened only with the mobile key.
 */
export async function GET(req: Request, ctx: Ctx) {
  const { hid } = await ctx.params;
  const hotel = await authMobile(hid, req);
  if (!hotel) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const s = await getSummary(hid);
  if (!s) return new NextResponse(null, { status: 204 });
  return NextResponse.json({ name: hotel.name, at: s.at, blob: s.blob }, { headers: { "cache-control": "no-store" } });
}
