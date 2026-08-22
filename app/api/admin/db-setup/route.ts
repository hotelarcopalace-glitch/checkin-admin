import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { getPool, hasDatabase } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sql(file: string) {
  return readFileSync(join(process.cwd(), "db", file), "utf8");
}

/**
 * Applies db/schema.sql (idempotent) and optionally seeds demo rows.
 * Admin session required. Safe to run more than once.
 */
export async function POST(req: Request) {
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!hasDatabase()) {
    return NextResponse.json(
      { error: "DATABASE_URL is not set on this deployment." },
      { status: 503 }
    );
  }

  const seed = new URL(req.url).searchParams.get("seed") === "1";
  const client = await getPool().connect();
  try {
    await client.query(sql("schema.sql"));

    let seeded = 0;
    if (seed) {
      const { rows } = await client.query("SELECT COUNT(*)::int AS c FROM sms_messages");
      if (rows[0].c === 0) {
        const result = await client.query(sql("seed.sql"));
        seeded = result.rowCount ?? 0;
      }
    }

    const { rows: count } = await client.query("SELECT COUNT(*)::int AS c FROM sms_messages");
    return NextResponse.json({ ok: true, table: "sms_messages", seeded, rows: count[0].c });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Setup failed" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
