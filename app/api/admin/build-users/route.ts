import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { hasDatabase, query } from "@/lib/db";
import { BUILD_USERNAME_RE, listBuildUsers } from "@/lib/build";
import { normaliseMobile } from "@/lib/sms-insert";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PendingOtp = { username: string; mobile: string; code: string; expiresAt: string };

async function admin() {
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  return session && !session.tag ? session : null;
}

const NO_TABLES = "BuildKhata tables are not ready. Run the database setup first.";
const isMissing = (err: unknown) => ["42P01", "42703"].includes((err as { code?: string }).code ?? "");

// BuildKhata logins, for the admin only: list (plus live OTPs to read out until an SMS gateway
// is connected), add a user with a blank password, edit name/mobile, switch off/on, blank the password.
export async function GET() {
  if (!(await admin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasDatabase()) return NextResponse.json({ error: "DATABASE_URL is not set." }, { status: 503 });
  try {
    const users = await listBuildUsers();
    const otps = await query<PendingOtp>(
      `SELECT DISTINCT ON (username) username, mobile, code, expires_at AS "expiresAt"
       FROM build_otps WHERE used_at IS NULL AND expires_at > NOW() AND attempts < 5
       ORDER BY username, created_at DESC`
    );
    return NextResponse.json({ users, otps });
  } catch (err) {
    if (isMissing(err)) return NextResponse.json({ error: NO_TABLES }, { status: 503 });
    return NextResponse.json({ error: "Could not load users." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!(await admin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasDatabase()) return NextResponse.json({ error: "DATABASE_URL is not set." }, { status: 503 });

  let b: Record<string, unknown> = {};
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const username = String(b.username ?? "").trim().toLowerCase();
  const name = String(b.name ?? "").trim().slice(0, 80);
  const mobile = normaliseMobile(String(b.mobile ?? ""));
  if (!BUILD_USERNAME_RE.test(username)) {
    return NextResponse.json({ error: "Username: 3-30 letters, numbers, dot, dash or underscore." }, { status: 400 });
  }
  if (!name) return NextResponse.json({ error: "Enter the person's name." }, { status: 400 });
  if (!mobile) return NextResponse.json({ error: "Enter a valid mobile number." }, { status: 400 });

  try {
    const rows = await query(
      `INSERT INTO build_users (username, name, mobile, password_hash)
       VALUES ($1, $2, $3, '') ON CONFLICT (username) DO NOTHING RETURNING id`,
      [username, name, mobile]
    );
    if (rows.length === 0) return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (isMissing(err)) return NextResponse.json({ error: NO_TABLES }, { status: 503 });
    return NextResponse.json({ error: "Could not add the user." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  if (!(await admin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasDatabase()) return NextResponse.json({ error: "DATABASE_URL is not set." }, { status: 503 });

  let b: Record<string, unknown> = {};
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const id = String(b.id ?? "");
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Invalid user." }, { status: 400 });

  const sets: string[] = [];
  const vals: unknown[] = [];
  const add = (col: string, v: unknown) => {
    vals.push(v);
    sets.push(`${col} = $${vals.length}`);
  };

  if (b.name !== undefined) {
    const name = String(b.name).trim().slice(0, 80);
    if (!name) return NextResponse.json({ error: "Enter the person's name." }, { status: 400 });
    add("name", name);
  }
  if (b.mobile !== undefined) {
    const mobile = normaliseMobile(String(b.mobile));
    if (!mobile) return NextResponse.json({ error: "Enter a valid mobile number." }, { status: 400 });
    add("mobile", mobile);
  }
  if (b.active !== undefined) add("active", b.active === true);
  if (b.blankPassword === true) {
    const [u] = await query<{ mobile: string | null }>("SELECT mobile FROM build_users WHERE id = $1", [id]).catch(() => []);
    if (u && !u.mobile && b.mobile === undefined) {
      return NextResponse.json({ error: "Add a mobile number first. The OTP goes there." }, { status: 400 });
    }
    add("password_hash", "");
  }
  if (sets.length === 0) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });

  try {
    vals.push(id);
    const rows = await query(`UPDATE build_users SET ${sets.join(", ")} WHERE id = $${vals.length} RETURNING id`, vals);
    if (rows.length === 0) return NextResponse.json({ error: "User not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (isMissing(err)) return NextResponse.json({ error: NO_TABLES }, { status: 503 });
    return NextResponse.json({ error: "Could not save the change." }, { status: 500 });
  }
}
