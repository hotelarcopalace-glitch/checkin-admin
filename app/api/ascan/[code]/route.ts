import { NextResponse } from "next/server";
import { CODE_RE, MAX_PAYLOAD, looksLikeAadhaarQr, relayPut, relayTake } from "@/lib/aadhaar-relay";
import { clientIp, tooMany } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Aadhaar QR relay between a phone and checkin.exe. See lib/aadhaar-relay.ts.
 *
 * POST /api/ascan/<code>   body = the raw QR text (text/plain, or JSON {"payload": "..."})
 *        from the phone page /s/<code>.               -> {"ok":true}
 * GET  /api/ascan/<code>   polled by checkin.exe.     -> 200 text/plain (the QR text, once) or 204
 *
 * No API key: <code> is a 12-character random secret that only that PC and the phone that
 * opened its link know. Only text shaped like an Aadhaar QR is accepted, so this cannot be
 * used as a general message drop. Nothing here is logged or stored outside memory.
 */

type Ctx = { params: Promise<{ code: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  if (!CODE_RE.test(code)) return NextResponse.json({ ok: false, error: "Bad code" }, { status: 400 });
  if (await tooMany(`ascan-post:${clientIp(req)}`, 40, 60)) {
    return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
  }

  let text = "";
  try {
    const raw = await req.text();
    if (raw.length > MAX_PAYLOAD + 200) {
      return NextResponse.json({ ok: false, error: "Too large" }, { status: 413 });
    }
    if ((req.headers.get("content-type") ?? "").includes("application/json")) {
      const j = JSON.parse(raw) as { payload?: unknown };
      text = typeof j.payload === "string" ? j.payload : "";
    } else {
      text = raw;
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Bad body" }, { status: 400 });
  }
  text = text.trim();
  if (!looksLikeAadhaarQr(text)) {
    return NextResponse.json({ ok: false, error: "Not an Aadhaar QR" }, { status: 422 });
  }

  relayPut(code, text);
  return NextResponse.json({ ok: true });
}

export async function GET(req: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  if (!CODE_RE.test(code)) return new Response(null, { status: 400 });
  // checkin.exe polls about every 2 seconds while its scan box is open; several PCs of one
  // hotel share an IP, so the limit is generous.
  if (await tooMany(`ascan-get:${clientIp(req)}`, 600, 60)) return new Response(null, { status: 429 });

  const payload = relayTake(code);
  if (payload === null) return new Response(null, { status: 204 });
  return new Response(payload, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
