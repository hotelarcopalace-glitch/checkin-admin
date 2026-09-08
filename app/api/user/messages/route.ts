import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { hasDatabase, query } from "@/lib/db";
import { USER_COOKIE, verifyUserToken } from "@/lib/user-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Used by the on-site guest widget: is the visitor logged in, and their messages.
export async function GET() {
  const store = await cookies();
  const session = await verifyUserToken(store.get(USER_COOKIE)?.value);
  if (!session) return NextResponse.json({ loggedIn: false });

  let messages: { message: string; status: string; created_at: string }[] = [];
  let name = "";
  if (hasDatabase()) {
    try {
      messages = await query(
        `SELECT message, status, created_at
         FROM sms_messages WHERE recipient = $1
         ORDER BY created_at DESC LIMIT 50`,
        [session.mobile]
      );
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

  return NextResponse.json({ loggedIn: true, mobile: session.mobile, name, messages });
}
