import { NextResponse } from "next/server";
import { createSessionToken, SESSION_COOKIE, sessionMaxAge } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";

export const runtime = "nodejs";

// Small in-memory throttle. Good enough for a single-admin panel.
const attempts = new Map<string, { count: number; until: number }>();
const WINDOW_MS = 5 * 60_000;
const MAX_ATTEMPTS = 10;

function throttled(ip: string) {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.until < now) {
    attempts.set(ip, { count: 1, until: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (throttled(ip)) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429 }
    );
  }

  let username = "";
  let password = "";
  try {
    const body = await req.json();
    username = String(body.username ?? "");
    password = String(body.password ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const expectedUser = process.env.ADMIN_USERNAME;
  const expectedHash = process.env.ADMIN_PASSWORD_HASH;
  if (!expectedUser || !expectedHash || !process.env.SESSION_SECRET) {
    return NextResponse.json(
      { error: "Admin login is not configured on the server." },
      { status: 500 }
    );
  }

  const ok =
    username.toLowerCase() === expectedUser.toLowerCase() &&
    (await verifyPassword(password, expectedHash));

  if (!ok) {
    return NextResponse.json({ error: "Wrong username or password." }, { status: 401 });
  }

  attempts.delete(ip);
  const token = await createSessionToken(expectedUser);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: sessionMaxAge,
  });
  return res;
}
