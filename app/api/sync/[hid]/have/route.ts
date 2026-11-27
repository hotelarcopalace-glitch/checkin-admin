import { NextResponse } from "next/server";
import { authHotel, cleanIds, missingChunks } from "@/lib/sync-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/sync/<hotel id>/have   {"ids": ["<chunk id>", ...]}   ->   {"ok": true, "missing": [...]}
 * The hotel PC asks which chunks it still has to upload (so unchanged data is never sent twice).
 */
export async function POST(req: Request, ctx: { params: Promise<{ hid: string }> }) {
  const { hid } = await ctx.params;
  const auth = await authHotel(hid, req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  let ids: string[] | null = null;
  try {
    ids = cleanIds(((await req.json()) as { ids?: unknown }).ids);
  } catch {
    /* handled below */
  }
  if (!ids) return NextResponse.json({ ok: false, error: "Bad body" }, { status: 400 });
  return NextResponse.json({ ok: true, missing: await missingChunks(hid, ids) });
}
