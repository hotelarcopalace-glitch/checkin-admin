import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { hasDatabase, query } from "@/lib/db";
import { readApiKey } from "@/lib/apikey";
import { normaliseMobile } from "@/lib/sms-insert";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Accepts the live SMS key OR an optional test key, so checkin.exe can run a
// live test without touching the production key.
function keyOk(provided: string | null): boolean {
  if (!provided) return false;
  const live = process.env.SMS_API_KEY;
  const test = process.env.SMS_API_KEY_TEST;
  return (!!live && provided === live) || (!!test && provided === test);
}

const SITE = (process.env.SITE_URL ?? "https://checkin.co.in").replace(/\/+$/, "");
const DEFAULT_TTL_MIN = 1440; // 24h
const MAX_TTL_MIN = 7 * 1440; // 7 days

/**
 * Mints a magic login link for a guest's mobile number and returns it as JSON.
 * checkin.exe reads the "url" field and drops it into the OTP SMS it sends.
 * The website does NOT send any SMS — it only creates the link.
 *
 * POST /api/magic/create
 *   auth : Authorization: Bearer <SMS_API_KEY>   (or X-API-Key)
 *   body : { "mobile": "9876500011", "hotel": "Hotel Arco Palace", "tag": "@Arco Team", "ttlMinutes": 1440 }
 *   resp : { "ok": true, "url": "https://checkin.co.in/l/AbC123...", "token": "...", "mobile": "+919876500011", "expires_at": "..." }
 */
export async function POST(req: Request) {
  if (!keyOk(readApiKey(req))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!hasDatabase()) {
    return NextResponse.json({ ok: false, error: "Database is not configured." }, { status: 503 });
  }

  const params: Record<string, unknown> = {};
  for (const [k, v] of new URL(req.url).searchParams.entries()) params[k] = v;
  try {
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) Object.assign(params, (await req.json()) ?? {});
    else {
      const form = await req.formData();
      for (const [k, v] of form.entries()) if (typeof v === "string") params[k] = v;
    }
  } catch {
    /* query-string values may still carry the fields */
  }

  const pick = (keys: string[]) => {
    for (const k of keys) {
      const v = params[k];
      if (typeof v === "string" && v.trim()) return v.trim();
      if (typeof v === "number") return String(v);
    }
    return null;
  };

  const rawMobile = pick(["mobile", "mobileNo", "mobile_no", "phone", "phone_number"]);
  if (!rawMobile) return NextResponse.json({ ok: false, error: "mobile is required" }, { status: 400 });
  const mobile = normaliseMobile(rawMobile);
  if (!mobile) return NextResponse.json({ ok: false, error: "mobile is not a valid number" }, { status: 400 });

  const hotel = pick(["hotel", "hotelName", "hotel_name", "name"]);
  const tag = pick(["tag", "sms_tag", "hotelTag"]);

  let ttl = Number(pick(["ttlMinutes", "ttl", "ttl_minutes"]) ?? DEFAULT_TTL_MIN);
  if (!Number.isFinite(ttl) || ttl <= 0) ttl = DEFAULT_TTL_MIN;
  ttl = Math.min(ttl, MAX_TTL_MIN);

  const token = randomBytes(9).toString("base64url"); // 12 url-safe chars (72-bit, unguessable) — short URL, still secure

  try {
    const rows = await query<{ expires_at: string }>(
      `INSERT INTO magic_links (token, mobile, hotel_tag, name, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + ($5 || ' minutes')::interval)
       RETURNING expires_at`,
      [token, mobile, tag, hotel, String(ttl)]
    );
    const url = `${SITE}/l?${token}`;
    return NextResponse.json({ ok: true, url, token, mobile, expires_at: rows[0].expires_at });
  } catch (err) {
    if (typeof err === "object" && err && (err as { code?: string }).code === "42P01") {
      return NextResponse.json(
        { ok: false, error: "Table magic_links does not exist. Run the database setup first." },
        { status: 503 }
      );
    }
    return NextResponse.json({ ok: false, error: "Could not create link." }, { status: 500 });
  }
}
