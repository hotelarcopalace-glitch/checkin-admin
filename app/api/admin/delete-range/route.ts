import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { hasDatabase } from "@/lib/db";
import { deleteSmsRange, type SmsFilters } from "@/lib/sms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Deletes every message matching the current filters (date range / number /
 * search / status). Refuses to run with no filter at all — use "Clear all"
 * for that. Admin session required.
 */
export async function POST(req: Request) {
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasDatabase())
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const str = (k: string) => {
    const v = body[k];
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };
  const date = (k: string) => {
    const v = str(k);
    return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
  };

  const filters: SmsFilters = {
    q: str("q"),
    status: str("status"),
    number: str("number"),
    from: date("from"),
    to: date("to"),
    page: 1,
    pageSize: 1,
  };

  if (!filters.q && !filters.status && !filters.number && !filters.from && !filters.to) {
    return NextResponse.json(
      { error: "Pehle koi date range ya filter chuno (warna sab delete ho jayega)." },
      { status: 400 }
    );
  }

  try {
    const deleted = await deleteSmsRange(filters);
    return NextResponse.json({ ok: true, deleted });
  } catch {
    return NextResponse.json({ error: "Could not delete." }, { status: 503 });
  }
}
