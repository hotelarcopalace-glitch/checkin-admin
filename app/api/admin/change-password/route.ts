import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { hasDatabase } from "@/lib/db";
import { changeAdminUserPassword, validPassword } from "@/lib/admin-users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A logged-in DB user changes their own password.
export async function POST(req: Request) {
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasDatabase())
    return NextResponse.json({ error: "DATABASE_URL is not set." }, { status: 503 });

  let currentPassword = "";
  let newPassword = "";
  try {
    const body = await req.json();
    currentPassword = String(body.currentPassword ?? "");
    newPassword = String(body.newPassword ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!validPassword(newPassword))
    return NextResponse.json(
      { error: "New password must be at least 6 characters." },
      { status: 400 }
    );

  try {
    const result = await changeAdminUserPassword(session.username, currentPassword, newPassword);
    if (result === "not-db-user")
      return NextResponse.json(
        {
          error:
            "You are signed in as the built-in recovery admin, whose password lives in the server settings and cannot be changed here. Create your own admin user under Users, then sign in as that user to change its password.",
        },
        { status: 400 }
      );
    if (result === "wrong-current")
      return NextResponse.json({ error: "Current password is wrong." }, { status: 401 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not change password." }, { status: 503 });
  }
}
