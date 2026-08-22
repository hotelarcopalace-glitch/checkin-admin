import { NextResponse } from "next/server";
import { hasDatabase, query } from "@/lib/db";
import { normaliseMobile } from "@/lib/sms-insert";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OTP_TTL_MINUTES = 10;

// Until an SMS gateway is wired up, OTP_SKIP=true returns the code in the response
// so the flow can be used end to end. Set it to false once SMS sending is live.
const otpSkipEnabled = () => process.env.OTP_SKIP !== "false";

export async function POST(req: Request) {
  if (!hasDatabase()) {
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  }

  let raw = "";
  try {
    raw = String((await req.json())?.mobile ?? "");
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const mobile = normaliseMobile(raw);
  if (!mobile) {
    return NextResponse.json({ error: "Please enter a valid mobile number." }, { status: 400 });
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));

  try {
    await query(
      `INSERT INTO otp_codes (mobile, code, expires_at)
       VALUES ($1, $2, NOW() + ($3 || ' minutes')::interval)`,
      [mobile, code, String(OTP_TTL_MINUTES)]
    );
  } catch (err) {
    if (typeof err === "object" && err && (err as { code?: string }).code === "42P01") {
      return NextResponse.json(
        { error: "Tables are missing. Run the database setup from the admin panel." },
        { status: 503 }
      );
    }
    throw err;
  }

  // TODO: send `code` to `mobile` through the SMS gateway once it is connected.
  return NextResponse.json({
    ok: true,
    mobile,
    expiresInMinutes: OTP_TTL_MINUTES,
    skipVerification: otpSkipEnabled(),
    ...(otpSkipEnabled() ? { devCode: code } : {}),
  });
}
