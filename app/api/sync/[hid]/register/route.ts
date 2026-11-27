import { NextResponse } from "next/server";
import { clientIp, tooMany } from "@/lib/rate-limit";
import { HID_RE, registerHotel } from "@/lib/sync-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/sync/<hotel id>/register   {"setup": "<one-time code>", "write": "<sha256>", "read": "<sha256>"}
 *
 * Called once by CKSYNC.exe on the hotel PC. The setup code comes from the admin panel; "write"
 * and "read" are the SHA-256 hashes of the two tokens the hotel PC derived from a secret it made
 * itself (the secret and the encryption key never come here). The setup code stops working after this.
 */
export async function POST(req: Request, ctx: { params: Promise<{ hid: string }> }) {
  const { hid } = await ctx.params;
  if (!HID_RE.test(hid)) return NextResponse.json({ ok: false, error: "Bad hotel id" }, { status: 400 });
  if (await tooMany(`sync-reg:${clientIp(req)}`, 10, 600)) {
    return NextResponse.json({ ok: false, error: "Too many attempts" }, { status: 429 });
  }
  let b: Record<string, unknown>;
  try {
    b = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Bad body" }, { status: 400 });
  }
  const setup = typeof b.setup === "string" ? b.setup.trim().toLowerCase() : "";
  const write = typeof b.write === "string" ? b.write : "";
  const read = typeof b.read === "string" ? b.read : "";
  if (!/^[0-9a-f]{24}$/.test(setup)) return NextResponse.json({ ok: false, error: "Bad setup code" }, { status: 400 });

  const ok = await registerHotel(hid, setup, write, read);
  if (!ok) return NextResponse.json({ ok: false, error: "Setup code is wrong or already used" }, { status: 403 });
  return NextResponse.json({ ok: true });
}
