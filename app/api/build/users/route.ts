import { NextResponse } from "next/server";
import { BUILD_USERNAME_RE, createBuildUser, listBuildUsers, liveBuildUser, updateBuildUser, type BuildRole } from "@/lib/build";
import { normaliseMobile } from "@/lib/sms-insert";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function adminOnly() {
  const me = await liveBuildUser();
  if (!me) return { res: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  if (me.role !== "admin") return { res: NextResponse.json({ error: "Only an admin can manage users." }, { status: 403 }) };
  return { me };
}

const roleOf = (v: unknown): BuildRole | undefined => (v === "admin" ? "admin" : v === "staff" ? "staff" : undefined);

export async function GET() {
  const a = await adminOnly();
  if (a.res) return a.res;
  try {
    return NextResponse.json({ users: await listBuildUsers(), meId: a.me!.id });
  } catch {
    return NextResponse.json({ error: "Could not load users." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const a = await adminOnly();
  if (a.res) return a.res;
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
  } catch {
    return NextResponse.json({ error: "Could not add the user." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const a = await adminOnly();
  if (a.res) return a.res;
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
  } catch {
    return NextResponse.json({ error: "Could not save the change." }, { status: 500 });
  }
}
