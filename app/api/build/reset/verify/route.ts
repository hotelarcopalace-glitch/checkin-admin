import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { hasDatabase, query } from "@/lib/db";
import { buildUserState, hashFingerprint } from "@/lib/build";
import { createBuildResetToken } from "@/lib/build-auth";
import { clientIp, tooMany } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ATTEMPTS = 5;

function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// Step 2: checks the OTP. A right code returns a 10-minute token that lets the caller set a new
// password. Five wrong codes burn the OTP.
export async function POST(req: Request) {
  if (!hasDatabase()) return NextResponse.json({ error: "Database not configured." }, { status: 503 });

  let username = "";
  let code = "";
  try {
    const b = await req.json();
    username = String(b?.username ?? "").trim().toLowerCase();
    code = String(b?.code ?? "").replace(/\s/g, "");
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!username || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "Enter the 6-digit OTP." }, { status: 400 });
  }
  if (await tooMany(`build-otp-verify:ip:${clientIp(req)}`, 30, 600)) {
    return NextResponse.json({ error: "Too many attempts. Please wait a few minutes and try again." }, { status: 429 });
  }

  const wrong = NextResponse.json({ error: "That OTP is wrong or has expired. Request a new one." }, { status: 400 });
  try {
    const otps = await query<{ id: string; code: string; attempts: number }>(
      `SELECT id::text AS id, code, attempts FROM build_otps
       WHERE lower(username) = $1 AND used_at IS NULL AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [username]
    );
    const otp = otps[0];
    if (!otp || otp.attempts >= MAX_ATTEMPTS) return wrong;

    if (!same(otp.code, code)) {
      await query(
        "UPDATE build_otps SET attempts = attempts + 1, used_at = CASE WHEN attempts + 1 >= $2 THEN NOW() ELSE used_at END WHERE id = $1",
        [otp.id, MAX_ATTEMPTS]
      );
      return wrong;
    }

    const user = await buildUserState(username);
    if (!user || !user.active) return wrong;
    await query("UPDATE build_otps SET used_at = NOW() WHERE id = $1", [otp.id]);
    const token = await createBuildResetToken(user.username, hashFingerprint(user.passwordHash));
    return NextResponse.json({ ok: true, token, name: user.name });
  } catch {
    return NextResponse.json({ error: "Could not check the OTP." }, { status: 500 });
  }
}
