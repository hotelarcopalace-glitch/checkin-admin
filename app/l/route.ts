import { NextResponse } from "next/server";
import { hasDatabase, query } from "@/lib/db";
import { createUserToken, USER_COOKIE, userCookieMaxAge } from "@/lib/user-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Magic login link, query form: /l?<token>  (DLT requires dynamic URLs to end
 * with "?"). Also accepts /l?t=<token>. Valid token logs the guest in and lands
 * on /welcome (thank-you + notification opt-in); invalid/expired -> /sms?expired=1.
 * (The path form /l/<token> is handled by ./[token]/route.ts for older links.)
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const raw = u.search.replace(/^\?/, "");
  let token = "";
  if (raw && !raw.includes("=")) token = raw; // /l?<token>
  else token = u.searchParams.get("t") || u.searchParams.get("k") || "";
  token = decodeURIComponent((token.split("&")[0] || "").trim());

  const bad = new URL("/sms?expired=1", req.url);
  if (!token || !hasDatabase()) return NextResponse.redirect(bad);

  let mobile = "", hotel = "";
  try {
    const rows = await query<{ mobile: string; name: string | null }>(
      `SELECT mobile, name FROM magic_links WHERE token = $1 AND expires_at > NOW() LIMIT 1`,
      [token]
    );
    if (rows.length === 0) return NextResponse.redirect(bad);
    mobile = rows[0].mobile;
    hotel = rows[0].name ?? "";
  } catch {
    return NextResponse.redirect(bad);
  }

  try {
    await query(`UPDATE magic_links SET used_at = COALESCE(used_at, NOW()) WHERE token = $1`, [token]);
    await query(
      `INSERT INTO app_users (mobile, last_login_at) VALUES ($1, NOW())
       ON CONFLICT (mobile) DO UPDATE SET last_login_at = NOW()`,
      [mobile]
    );
  } catch {
    /* login must not fail on an audit write */
  }

  // Land on the welcome page (thank-you + notification opt-in), hotel name in tow.
  const dest = new URL("/welcome", req.url);
  if (hotel) dest.searchParams.set("h", hotel);
  const res = NextResponse.redirect(dest);
  res.cookies.set(USER_COOKIE, await createUserToken(mobile), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: userCookieMaxAge,
  });
  return res;
}
