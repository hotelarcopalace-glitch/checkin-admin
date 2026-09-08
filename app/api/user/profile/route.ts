import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { hasDatabase, query } from "@/lib/db";
import { USER_COOKIE, verifyUserToken } from "@/lib/user-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Guest updates their own display name.
export async function POST(req: Request) {
  const store = await cookies();
  const session = await verifyUserToken(store.get(USER_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Login karein." }, { status: 401 });
  if (!hasDatabase())
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });

  let name = "";
  try {
    name = String((await req.json())?.name ?? "").trim().slice(0, 60);
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    await query(
      `INSERT INTO app_users (mobile, name, last_login_at) VALUES ($1, $2, NOW())
       ON CONFLICT (mobile) DO UPDATE SET name = EXCLUDED.name`,
      [session.mobile, name || null]
    );
    return NextResponse.json({ ok: true, name });
  } catch {
    return NextResponse.json({ error: "Could not save. Run DB setup." }, { status: 503 });
  }
}
