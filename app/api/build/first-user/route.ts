import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import { BUILD_USERNAME_RE, createFirstBuildUser } from "@/lib/build";
import { BUILD_COOKIE, buildCookieMaxAge, createBuildToken } from "@/lib/build-auth";
import { clientIp, tooMany } from "@/lib/rate-limit";
import { normaliseMobile } from "@/lib/sms-insert";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Creates the first BuildKhata account (the admin) while the app has no users at all, then signs it in.
export async function POST(req: Request) {
  if (!hasDatabase()) return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  if (await tooMany(`build-first:ip:${clientIp(req)}`, 10, 600)) {
    return NextResponse.json({ error: "Too many attempts. Please wait a few minutes." }, { status: 429 });
  }

  let b: Record<string, unknown> = {};
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const name = String(b.name ?? "").trim().slice(0, 80);
  const username = String(b.username ?? "").trim().toLowerCase();
  const mobile = normaliseMobile(String(b.mobile ?? ""));
  const password = String(b.password ?? "");
  if (!name) return NextResponse.json({ error: "Enter your name." }, { status: 400 });
  if (!BUILD_USERNAME_RE.test(username)) {
    return NextResponse.json({ error: "Username: 3-30 letters, numbers, dot, dash or underscore." }, { status: 400 });
  }
  if (!mobile) return NextResponse.json({ error: "Enter a valid mobile number." }, { status: 400 });
  if (password.length < 4) return NextResponse.json({ error: "The password must be at least 4 characters." }, { status: 400 });

  try {
    const r = await createFirstBuildUser({ username, name, mobile, password });
    if ("error" in r) {
      return NextResponse.json(
        { error: r.error === "not-first" ? "The app already has users. Please sign in." : "That username is already taken." },
        { status: 409 }
      );
    }
    const res = NextResponse.json({ ok: true, name: r.user.name });
    res.cookies.set(BUILD_COOKIE, await createBuildToken(r.user.username, r.user.name), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: buildCookieMaxAge,
    });
    return res;
  } catch {
    return NextResponse.json({ error: "Could not create the account." }, { status: 500 });
  }
}
