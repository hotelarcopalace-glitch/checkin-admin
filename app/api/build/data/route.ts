import { NextResponse } from "next/server";
import { currentBuildUser } from "@/lib/build-auth";
import { listProjects, listEntries, hasBlankPassword } from "@/lib/build";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const me = await currentBuildUser();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  try {
    const [projects, entries, blankPassword] = await Promise.all([
      listProjects(),
      listEntries(),
      hasBlankPassword(me.username).catch(() => false),
    ]);
    return NextResponse.json({ me: { name: me.name, username: me.username, blankPassword }, projects, entries });
  } catch {
    return NextResponse.json({ error: "Could not load data. Is the DB set up?" }, { status: 500 });
  }
}
