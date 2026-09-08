import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { hasDatabase } from "@/lib/db";
import {
  adminUserExists,
  createAdminUser,
  listAdminUsers,
  validPassword,
  validUsername,
} from "@/lib/admin-users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireSession() {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

export async function GET() {
  if (!(await requireSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasDatabase())
    return NextResponse.json({ error: "DATABASE_URL is not set." }, { status: 503 });
  try {
    return NextResponse.json({ users: await listAdminUsers() });
  } catch {
    return NextResponse.json({ error: "Users table not found. Run DB setup first." }, { status: 503 });
  }
}

export async function POST(req: Request) {
  if (!(await requireSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasDatabase())
    return NextResponse.json({ error: "DATABASE_URL is not set." }, { status: 503 });

  let username = "";
  let password = "";
  try {
    const body = await req.json();
    username = String(body.username ?? "").trim();
    password = String(body.password ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!validUsername(username))
    return NextResponse.json(
      { error: "Username: 3–32 chars, only letters, numbers, . _ -" },
      { status: 400 }
    );
  if (!validPassword(password))
    return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });

  const envUser = process.env.ADMIN_USERNAME ?? "";
  if (username.toLowerCase() === envUser.toLowerCase())
    return NextResponse.json(
      { error: "That username is the built-in recovery admin. Choose a different one." },
      { status: 409 }
    );

  try {
    if (await adminUserExists(username))
      return NextResponse.json({ error: "That username already exists." }, { status: 409 });
    await createAdminUser(username, password);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Could not create user. Run DB setup if this is the first time." },
      { status: 503 }
    );
  }
}
