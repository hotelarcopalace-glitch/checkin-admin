import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { hasDatabase, query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Deletes a single message. Admin session required. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasDatabase()) {
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  }

  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Bad id." }, { status: 400 });

  const rows = await query<{ id: string }>(
    `DELETE FROM sms_messages WHERE id = $1 RETURNING id::text`,
    [Number(id)]
  );
  if (rows.length === 0) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ ok: true, deleted: rows[0].id });
}
