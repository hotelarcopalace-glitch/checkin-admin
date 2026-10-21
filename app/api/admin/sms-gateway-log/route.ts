import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { hasDatabase, query } from "@/lib/db";
import { gatewayConfigured } from "@/lib/sms-gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin only: the last OTP texts handed to the SMS gateway and what it answered, so a missing
// balance or a wrong password is easy to spot. Never returns the gateway login details.
export async function GET() {
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!session || session.tag) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasDatabase()) return NextResponse.json({ error: "DATABASE_URL is not set." }, { status: 503 });
  try {
    const rows = await query(
      "SELECT mobile, purpose, ok, detail, created_at AS \"createdAt\" FROM sms_gateway_log ORDER BY id DESC LIMIT 20"
    );
    return NextResponse.json({ configured: gatewayConfigured(), rows });
  } catch {
    return NextResponse.json({ configured: gatewayConfigured(), rows: [], note: "Run the database setup first." });
  }
}
