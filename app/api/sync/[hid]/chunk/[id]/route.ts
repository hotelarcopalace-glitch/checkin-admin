import { NextResponse } from "next/server";
import { tooMany } from "@/lib/rate-limit";
import { CHUNK_ID_RE, MAX_CHUNK_BYTES, authHotel, getChunk, putChunk, underQuota } from "@/lib/sync-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ hid: string; id: string }> };

/** PUT /api/sync/<hotel id>/chunk/<chunk id>   body = one encrypted chunk (hotel's push token only). */
export async function PUT(req: Request, ctx: Ctx) {
  const { hid, id } = await ctx.params;
  if (!CHUNK_ID_RE.test(id)) return NextResponse.json({ ok: false, error: "Bad chunk id" }, { status: 400 });
  const auth = await authHotel(hid, req);
  if (!auth || auth.role !== "write") return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!underQuota(auth.hotel)) return NextResponse.json({ ok: false, error: "Storage limit reached" }, { status: 507 });
  // A full first upload of a large hotel is about 1,000 chunks; this only stops a runaway client.
  if (await tooMany(`sync-put:${hid}`, 30_000, 3600)) {
    return NextResponse.json({ ok: false, error: "Too many uploads" }, { status: 429 });
  }
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > MAX_CHUNK_BYTES) return NextResponse.json({ ok: false, error: "Too large" }, { status: 413 });
  const data = Buffer.from(await req.arrayBuffer());
  // nonce (12) + at least a tag (16)
  if (data.length < 28 || data.length > MAX_CHUNK_BYTES) {
    return NextResponse.json({ ok: false, error: "Bad chunk" }, { status: 400 });
  }
  await putChunk(hid, id, data);
  return NextResponse.json({ ok: true });
}

/** GET /api/sync/<hotel id>/chunk/<chunk id>   ->   the encrypted chunk (either token). */
export async function GET(req: Request, ctx: Ctx) {
  const { hid, id } = await ctx.params;
  if (!CHUNK_ID_RE.test(id)) return NextResponse.json({ ok: false, error: "Bad chunk id" }, { status: 400 });
  const auth = await authHotel(hid, req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const data = await getChunk(hid, id);
  if (!data) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: { "content-type": "application/octet-stream", "cache-control": "no-store" },
  });
}
