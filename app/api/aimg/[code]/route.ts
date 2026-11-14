import { NextResponse } from "next/server";
import { CODE_RE, MAX_IMAGE, imagePut, imageTake } from "@/lib/aadhaar-relay";
import { clientIp, tooMany } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ID card photo relay between a phone and checkin.exe. See lib/aadhaar-relay.ts.
 *
 * POST /api/aimg/<code>?side=f|b   body = one JPEG (the phone page /s/<code> shrinks it first)
 *                                  -> {"ok":true}
 * GET  /api/aimg/<code>            polled by checkin.exe while its "ID Photo" box is open
 *                                  -> 200 image/jpeg (one photo, once) or 204.
 *        The side is in the Content-Type ("image/jpeg; side=f") because every curl version
 *        can print that with -w "%{content_type}"; it is repeated in X-Side.
 *
 * Same trust model as /api/ascan: <code> is the only credential. Only JPEGs are accepted.
 * Nothing here is logged or stored outside memory.
 */

type Ctx = { params: Promise<{ code: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  if (!CODE_RE.test(code)) return NextResponse.json({ ok: false, error: "Bad code" }, { status: 400 });
  const side = new URL(req.url).searchParams.get("side");
  if (side !== "f" && side !== "b") return NextResponse.json({ ok: false, error: "Bad side" }, { status: 400 });
  if (await tooMany(`aimg-post:${clientIp(req)}`, 30, 60)) {
    return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
  }
  if (Number(req.headers.get("content-length") ?? "0") > MAX_IMAGE) {
    return NextResponse.json({ ok: false, error: "Too large" }, { status: 413 });
  }

  let data: ArrayBuffer;
  try {
    data = await req.arrayBuffer();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad body" }, { status: 400 });
  }
  if (data.byteLength > MAX_IMAGE) return NextResponse.json({ ok: false, error: "Too large" }, { status: 413 });
  const head = new Uint8Array(data, 0, Math.min(3, data.byteLength));
  if (data.byteLength < 2000 || head[0] !== 0xff || head[1] !== 0xd8 || head[2] !== 0xff) {
    return NextResponse.json({ ok: false, error: "Not a JPEG" }, { status: 422 });
  }

  imagePut(code, side, data);
  return NextResponse.json({ ok: true });
}

export async function GET(req: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  if (!CODE_RE.test(code)) return new Response(null, { status: 400 });
  if (await tooMany(`aimg-get:${clientIp(req)}`, 600, 60)) return new Response(null, { status: 429 });

  const img = imageTake(code);
  if (!img) return new Response(null, { status: 204 });
  return new Response(img.data, {
    status: 200,
    headers: {
      "Content-Type": `image/jpeg; side=${img.side}`,
      "X-Side": img.side,
      "Cache-Control": "no-store",
    },
  });
}
