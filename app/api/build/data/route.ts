import { NextResponse } from "next/server";
import { liveBuildUser, listProjects, listEntries, listParties, hasBlankPassword } from "@/lib/build";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const me = await liveBuildUser();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  try {
    const [projects, entries, parties, blankPassword] = await Promise.all([
      listProjects(),
      listEntries(),
      listParties(),
      hasBlankPassword(me.username).catch(() => false),
    ]);
    return NextResponse.json({
      me: { name: me.name, username: me.username, role: me.role, blankPassword },
      projects,
      entries,
      parties,
    });
  } catch {
    return NextResponse.json({ error: "Could not load data. Is the DB set up?" }, { status: 500 });
  }
}
