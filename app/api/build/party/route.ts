import { NextResponse } from "next/server";
import { createParty, isPartyKind, liveBuildUser, updateParty } from "@/lib/build";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Suppliers and labour names. Any signed-in user can add or edit one; they are never deleted so ledgers stay whole.
export async function POST(req: Request) {
  const me = await liveBuildUser();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  let b: Record<string, unknown> = {};
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const name = String(b.name ?? "").trim();
  if (!isPartyKind(b.kind)) return NextResponse.json({ error: "Choose supplier or labour." }, { status: 400 });
  if (!name) return NextResponse.json({ error: "Enter a name." }, { status: 400 });
  try {
    const r = await createParty(b.kind, name, String(b.phone ?? ""), String(b.note ?? ""));
    if (r.existed) return NextResponse.json({ error: "That name already exists.", party: r.party }, { status: 409 });
    return NextResponse.json({ ok: true, party: r.party });
  } catch {
    return NextResponse.json({ error: "Could not save." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const me = await liveBuildUser();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  let b: Record<string, unknown> = {};
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const id = String(b.id ?? "");
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Invalid party." }, { status: 400 });
  const p: Parameters<typeof updateParty>[1] = {};
  if (b.name !== undefined) {
    if (!String(b.name).trim()) return NextResponse.json({ error: "Enter a name." }, { status: 400 });
    p.name = String(b.name);
  }
  if (b.phone !== undefined) p.phone = String(b.phone);
  if (b.note !== undefined) p.note = String(b.note);
  if (b.active !== undefined) p.active = b.active === true;
  try {
    const r = await updateParty(id, p);
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, party: r.party });
  } catch {
    return NextResponse.json({ error: "Could not save." }, { status: 500 });
  }
}
