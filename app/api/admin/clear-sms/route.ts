import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { hasDatabase, query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Deletes every row in sms_messages. Admin session required, and the caller must
 * send {"confirm":"DELETE"} so it cannot fire from a stray request.
 */
export async function POST(req: Request) {
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!hasDatabase()) {
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  }

  let confirm: unknown;
  try {
    confirm = (await req.json())?.confirm;
  } catch {
    confirm = undefined;
  }
  if (confirm !== "DELETE") {
    return NextResponse.json(
      { error: 'Send {"confirm":"DELETE"} to clear the table.' },
      { status: 400 }
    );
  }

  try {
    const before = await query<{ c: number }>("SELECT COUNT(*)::int AS c FROM sms_messages");
    await query("TRUNCATE TABLE sms_messages RESTART IDENTITY");
    return NextResponse.json({ ok: true, deleted: before[0].c, remaining: 0 });
  } catch (err) {
    if (typeof err === "object" && err && (err as { code?: string }).code === "42P01") {
      return NextResponse.json({ error: "Table sms_messages does not exist." }, { status: 503 });
    }
    throw err;
  }
}
