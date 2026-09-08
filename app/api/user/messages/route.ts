import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { hasDatabase, query } from "@/lib/db";
import { USER_COOKIE, verifyUserToken } from "@/lib/user-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Used by the on-site guest widget: is the visitor logged in, their total SMS
// count, and their messages (optionally filtered to one date ?date=YYYY-MM-DD).
export async function GET(req: Request) {
  const store = await cookies();
  const session = await verifyUserToken(store.get(USER_COOKIE)?.value);
  if (!session) return NextResponse.json({ loggedIn: false });

  const dateRaw = new URL(req.url).searchParams.get("date") || "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : "";

  let messages: { message: string; status: string; created_at: string }[] = [];
  let name = "";
  let total = 0;
  if (hasDatabase()) {
    try {
      const where = date
        ? `recipient = $1 AND created_at >= $2::date AND created_at < ($2::date + INTERVAL '1 day')`
        : `recipient = $1`;
      const params = date ? [session.mobile, date] : [session.mobile];
      messages = await query(
        `SELECT message, status, created_at FROM sms_messages
         WHERE ${where} ORDER BY created_at DESC LIMIT 300`,
        params
      );
      const t = await query<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM sms_messages WHERE recipient = $1`,
        [session.mobile]
      );
      total = t[0]?.c ?? 0;
    } catch {
      messages = [];
    }
    try {
      const u = await query<{ name: string | null }>(
        `SELECT name FROM app_users WHERE mobile = $1 LIMIT 1`,
        [session.mobile]
      );
      name = u[0]?.name ?? "";
    } catch {
      name = "";
    }
  }

  return NextResponse.json({ loggedIn: true, mobile: session.mobile, name, total, messages });
}
