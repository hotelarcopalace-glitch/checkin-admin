import { NextResponse } from "next/server";
import { hasDatabase, query } from "@/lib/db";
import { buildUserState } from "@/lib/build";
import { clientIp, tooMany } from "@/lib/rate-limit";
import { sendOtpSms } from "@/lib/sms-gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OTP_TTL_MINUTES = 10;

// Step 1 of "first time / forgot password": makes an OTP for the user's registered mobile.
// The code is never returned to the browser. It is sent to the user's mobile by SMS; if that fails
// an admin can still read it on the BuildKhata admin page.
// The answer is the same whether or not the username exists.
export async function POST(req: Request) {
  if (!hasDatabase()) return NextResponse.json({ error: "Database not configured." }, { status: 503 });

  let username = "";
  try {
    username = String((await req.json())?.username ?? "").trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!username) return NextResponse.json({ error: "Enter your username." }, { status: 400 });

  if ((await tooMany(`build-otp:u:${username}`, 5, 600)) || (await tooMany(`build-otp:ip:${clientIp(req)}`, 20, 600))) {
    return NextResponse.json({ error: "Too many attempts. Please wait a few minutes and try again." }, { status: 429 });
  }

  try {
    const user = await buildUserState(username);
    if (user && user.active && user.mobile) {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      await query(
        `INSERT INTO build_otps (username, mobile, code, expires_at)
         VALUES ($1, $2, $3, NOW() + ($4 || ' minutes')::interval)`,
        [user.username, user.mobile, code, String(OTP_TTL_MINUTES)]
      );
      await sendOtpSms(user.mobile, code, "buildkhata");
    }
  } catch {
    return NextResponse.json({ error: "Could not create the OTP. Ask the admin to run the database setup." }, { status: 503 });
  }
  return NextResponse.json({ ok: true, expiresInMinutes: OTP_TTL_MINUTES });
}
