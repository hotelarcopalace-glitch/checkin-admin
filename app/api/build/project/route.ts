import { NextResponse } from "next/server";
import { currentBuildUser } from "@/lib/build-auth";
import { createProject, updateProject, deleteProject } from "@/lib/build";

export const runtime = "nodejs";

// Estimated project value: blank means "not set"; otherwise a positive amount.
function parseValue(raw: unknown): number | null | "bad" {
  if (raw === null || raw === undefined || String(raw).trim() === "") return null;
  const n = Number(String(raw).replace(/[,\s₹]/g, ""));
  if (!Number.isFinite(n) || n < 0 || n > 1e12) return "bad";
  return n === 0 ? null : Math.round(n * 100) / 100;
}

export async function POST(req: Request) {
  const me = await currentBuildUser();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let name = "";
  let client = "";
  let value: number | null | "bad" = null;
  try {
    const b = await req.json();
    name = String(b.name ?? "").trim();
    client = String(b.client ?? "").trim();
    value = parseValue(b.value);
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!name) return NextResponse.json({ error: "Project name is required." }, { status: 400 });
  if (value === "bad") return NextResponse.json({ error: "Enter a valid project value." }, { status: 400 });

  try {
    const project = await createProject(name, client, value);
    return NextResponse.json({ ok: true, project });
  } catch {
    return NextResponse.json({ error: "Could not create project." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const me = await currentBuildUser();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let id = "";
  let name = "";
  let client = "";
  let value: number | null | "bad" = null;
  try {
    const b = await req.json();
    id = String(b.id ?? "").trim();
    name = String(b.name ?? "").trim();
    client = String(b.client ?? "").trim();
    value = parseValue(b.value);
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!id) return NextResponse.json({ error: "Missing project id." }, { status: 400 });
  if (!name) return NextResponse.json({ error: "Project name is required." }, { status: 400 });
  if (value === "bad") return NextResponse.json({ error: "Enter a valid project value." }, { status: 400 });

  try {
    const project = await updateProject(id, name, client, value);
    if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    return NextResponse.json({ ok: true, project });
  } catch {
    return NextResponse.json({ error: "Could not update project." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const me = await currentBuildUser();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  try {
    await deleteProject(id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not delete project." }, { status: 500 });
  }
}
