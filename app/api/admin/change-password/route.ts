import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { hasDatabase } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import {
  createAdminUser,
  getAdminUserByName,
  setAdminUserPassword,
  validPassword,
} from "@/lib/admin-users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A signed-in user changes their own password.
// - Normal DB user  -> verify current against the DB, update it.
// - Recovery admin  -> no DB row yet, so verify current against the env hash
//   and "promote" it into the DB. After this the DB password is authoritative
//   and the old env password stops working (login ignores env once a row exists).
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

  const user = session.username;

  try {
    // Already a DB user (includes a recovery admin that was promoted earlier).
    const dbRow = await getAdminUserByName(user);
    if (dbRow) {
      if (!(await verifyPassword(currentPassword, dbRow.password_hash)))
        return NextResponse.json({ error: "Current password is wrong." }, { status: 401 });
      await setAdminUserPassword(dbRow.id, newPassword);
      return NextResponse.json({ ok: true });
    }

    // Recovery admin (still env-only): verify current against env, then promote.
    const envUser = process.env.ADMIN_USERNAME ?? "";
    const envHash = process.env.ADMIN_PASSWORD_HASH ?? "";
    if (envUser && envHash && user.toLowerCase() === envUser.toLowerCase()) {
      if (!(await verifyPassword(currentPassword, envHash)))
        return NextResponse.json({ error: "Current password is wrong." }, { status: 401 });
      await createAdminUser(user, newPassword);
      return NextResponse.json({ ok: true, promoted: true });
    }

    return NextResponse.json({ error: "This account cannot change its password here." }, {
      status: 400,
    });
  } catch {
    return NextResponse.json({ error: "Could not change password." }, { status: 503 });
  }
}
