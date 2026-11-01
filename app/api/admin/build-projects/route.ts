import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { hasDatabase } from "@/lib/db";
import { listHiddenProjects, purgeProject, restoreProject } from "@/lib/build";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function admin() {
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  return session && !session.tag ? session : null;
}

const NO_COLUMNS = "BuildKhata tables are not ready. Run the database setup first.";
const isMissing = (err: unknown) => ["42P01", "42703"].includes((err as { code?: string }).code ?? "");

// Projects deleted in the BuildKhata app are only hidden. Here the Checkin admin sees them, can bring one
// back, or erase it for good together with all of its entries.
export async function GET() {
  if (!(await admin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasDatabase()) return NextResponse.json({ error: "DATABASE_URL is not set." }, { status: 503 });
  try {
    return NextResponse.json({ projects: await listHiddenProjects() });
  } catch (err) {
    if (isMissing(err)) return NextResponse.json({ error: NO_COLUMNS }, { status: 503 });
    return NextResponse.json({ error: "Could not load hidden projects." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  if (!(await admin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasDatabase()) return NextResponse.json({ error: "DATABASE_URL is not set." }, { status: 503 });
  let id = "";
  try {
    id = String((await req.json())?.id ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Invalid project." }, { status: 400 });
  try {
    const ok = await restoreProject(id);
    if (!ok) return NextResponse.json({ error: "That project is not hidden." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not restore." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  if (!(await admin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasDatabase()) return NextResponse.json({ error: "DATABASE_URL is not set." }, { status: 503 });
  let id = "";
  let confirm = "";
  try {
    const b = await req.json();
    id = String(b?.id ?? "");
    confirm = String(b?.confirm ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Invalid project." }, { status: 400 });
  if (confirm !== "DELETE") return NextResponse.json({ error: 'Type DELETE to confirm.' }, { status: 400 });
  try {
    const gone = await purgeProject(id);
    if (!gone) return NextResponse.json({ error: "Only a hidden project can be erased." }, { status: 404 });
    return NextResponse.json({ ok: true, name: gone.name, entries: gone.entries });
  } catch {
    return NextResponse.json({ error: "Could not erase the project." }, { status: 500 });
  }
}
