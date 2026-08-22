import { NextResponse } from "next/server";
import { apiKeyValid, readApiKey } from "@/lib/apikey";
import { hasDatabase, query } from "@/lib/db";
import { STATUSES } from "@/lib/sms-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Incoming = {
  recipient?: unknown;
  guest_name?: unknown;
  message?: unknown;
  status?: unknown;
  provider?: unknown;
  template?: unknown;
  segments?: unknown;
  cost?: unknown;
  error?: unknown;
  sent_at?: unknown;
};

type Clean = {
  recipient: string;
  guest_name: string | null;
  message: string;
  status: string;
  provider: string | null;
  template: string | null;
  segments: number;
  cost: number;
  error: string | null;
  sent_at: string | null;
};

function str(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function clean(raw: Incoming, index: number): Clean | string {
  const recipient = str(raw.recipient, 32);
  if (!recipient) return `item ${index}: "recipient" is required`;
  if (!/^[+0-9][0-9 ()-]{5,}$/.test(recipient)) return `item ${index}: "recipient" is not a phone number`;

  const message = str(raw.message, 2000);
  if (!message) return `item ${index}: "message" is required`;

  const status = (str(raw.status, 16) ?? "sent").toLowerCase();
  if (!STATUSES.includes(status as never)) {
    return `item ${index}: "status" must be one of ${STATUSES.join(", ")}`;
  }

  const segments = Number(raw.segments ?? (Math.ceil(message.length / 160) || 1));
  const cost = Number(raw.cost ?? 0);
  if (!Number.isFinite(segments) || segments < 1) return `item ${index}: "segments" must be a positive number`;
  if (!Number.isFinite(cost) || cost < 0) return `item ${index}: "cost" must be zero or more`;

  let sent_at = str(raw.sent_at, 40);
  if (sent_at && Number.isNaN(Date.parse(sent_at))) return `item ${index}: "sent_at" is not a valid date`;
  // Delivered/sent messages without an explicit timestamp are stamped now.
  if (!sent_at && (status === "sent" || status === "delivered")) sent_at = new Date().toISOString();

  return {
    recipient,
    guest_name: str(raw.guest_name, 120),
    message,
    status,
    provider: str(raw.provider, 40),
    template: str(raw.template, 60),
    segments: Math.min(10, Math.trunc(segments)),
    cost,
    error: str(raw.error, 300),
    sent_at,
  };
}

/**
 * POST /api/sms/log
 * Auth: Authorization: Bearer <SMS_API_KEY>  (or X-API-Key)
 * Body: one message object, or { messages: [...] }, or a bare array. Max 100 per call.
 */
export async function POST(req: Request) {
  if (!apiKeyValid(readApiKey(req))) {
    return NextResponse.json({ error: "Invalid or missing API key." }, { status: 401 });
  }
  if (!hasDatabase()) {
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const list: Incoming[] = Array.isArray(body)
    ? body
    : Array.isArray((body as { messages?: unknown })?.messages)
      ? ((body as { messages: Incoming[] }).messages)
      : [body as Incoming];

  if (list.length === 0) return NextResponse.json({ error: "No messages given." }, { status: 400 });
  if (list.length > 100) {
    return NextResponse.json({ error: "Too many messages — 100 per request." }, { status: 400 });
  }

  const rows: Clean[] = [];
  for (const [index, raw] of list.entries()) {
    const result = clean(raw ?? {}, index);
    if (typeof result === "string") return NextResponse.json({ error: result }, { status: 400 });
    rows.push(result);
  }

  const columns = [
    "recipient",
    "guest_name",
    "message",
    "status",
    "provider",
    "template",
    "segments",
    "cost",
    "error",
    "sent_at",
  ] as const;

  const params: unknown[] = [];
  const tuples = rows.map((row) => {
    const placeholders = columns.map((column) => {
      params.push(row[column]);
      return `$${params.length}`;
    });
    return `(${placeholders.join(",")})`;
  });

  try {
    const inserted = await query<{ id: string }>(
      `INSERT INTO sms_messages (${columns.join(",")})
       VALUES ${tuples.join(",")}
       RETURNING id::text`,
      params
    );
    return NextResponse.json(
      { ok: true, inserted: inserted.length, ids: inserted.map((r) => r.id) },
      { status: 201 }
    );
  } catch (err) {
    if (typeof err === "object" && err && (err as { code?: string }).code === "42P01") {
      return NextResponse.json(
        { error: "Table sms_messages does not exist. Run the database setup first." },
        { status: 503 }
      );
    }
    throw err;
  }
}
