import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { hasDatabase, query } from "@/lib/db";
import { BUILD_USERNAME_RE, createBuildUser, listBuildUsers, updateBuildUser, type BuildRole } from "@/lib/build";
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
const roleOf = (v: unknown): BuildRole | undefined => (v === "admin" ? "admin" : v === "staff" ? "staff" : undefined);

// BuildKhata logins, for the Checkin admin only: list (plus live OTPs to read out if an SMS did not arrive),
// add a user with a blank password, edit name/mobile/role, switch off/on, blank the password.
// The same rules as the in-app "Manage users" apply (the last active admin cannot be removed).
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
    const r = await createBuildUser({ username, name, mobile, role: roleOf(b.role) ?? "staff" });
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
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

  const patch: Parameters<typeof updateBuildUser>[1] = {};
  if (b.name !== undefined) {
    const name = String(b.name).trim().slice(0, 80);
    if (!name) return NextResponse.json({ error: "Enter the person's name." }, { status: 400 });
    patch.name = name;
  }
  if (b.mobile !== undefined) {
    const mobile = normaliseMobile(String(b.mobile));
    if (!mobile) return NextResponse.json({ error: "Enter a valid mobile number." }, { status: 400 });
    patch.mobile = mobile;
  }
  if (b.role !== undefined) {
    const role = roleOf(b.role);
    if (!role) return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    patch.role = role;
  }
  if (b.active !== undefined) patch.active = b.active === true;
  if (b.blankPassword === true) patch.blankPassword = true;

  try {
    const r = await updateBuildUser(id, patch);
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (isMissing(err)) return NextResponse.json({ error: NO_TABLES }, { status: 503 });
    return NextResponse.json({ error: "Could not save the change." }, { status: 500 });
  }
}
