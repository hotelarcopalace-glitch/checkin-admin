import { NextResponse } from "next/server";
import { hasDatabase, query } from "@/lib/db";
import { buildUserState, hashFingerprint } from "@/lib/build";
import { BUILD_COOKIE, buildCookieMaxAge, createBuildToken, verifyBuildResetToken } from "@/lib/build-auth";
import { hashPassword } from "@/lib/password";
import { clientIp, tooMany } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Step 3: sets the new password using the token from the OTP step, then signs the user in.
export async function POST(req: Request) {
  if (!hasDatabase()) return NextResponse.json({ error: "Database not configured." }, { status: 503 });

  let token = "";
  let password = "";
  try {
    const b = await req.json();
    token = String(b?.token ?? "");
    password = String(b?.password ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (password.length < 4) {
    return NextResponse.json({ error: "The password must be at least 4 characters." }, { status: 400 });
  }
  if (await tooMany(`build-pw-set:ip:${clientIp(req)}`, 20, 600)) {
    return NextResponse.json({ error: "Too many attempts. Please wait a few minutes and try again." }, { status: 429 });
  }

  const proof = await verifyBuildResetToken(token);
  const expired = NextResponse.json({ error: "This step has expired. Start again and request a new OTP." }, { status: 400 });
  if (!proof) return expired;

  try {
    const user = await buildUserState(proof.username);
    if (!user || !user.active) return expired;
    // Token is good for one use: it dies once the password has changed.
    if (hashFingerprint(user.passwordHash) !== proof.fp) return expired;

    await query("UPDATE build_users SET password_hash = $1, last_login_at = NOW() WHERE id = $2", [
      await hashPassword(password),
      user.id,
    ]);
    const res = NextResponse.json({ ok: true, name: user.name });
    res.cookies.set(BUILD_COOKIE, await createBuildToken(user.username, user.name), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: buildCookieMaxAge,
    });
    return res;
  } catch {
    return NextResponse.json({ error: "Could not set the password." }, { status: 500 });
  }
}
