import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { allSmsForExport, DbNotReady, parseFilters } from "@/lib/sms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = value instanceof Date ? value.toISOString() : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET(req: Request) {
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  try {
    const rows = await allSmsForExport(parseFilters(sp));
    const header = [
      "id",
      "recipient",
      "guest_name",
      "message",
      "status",
      "provider",
      "template",
      "segments",
      "cost",
      "error",
      "source_ip",
      "created_at",
      "sent_at",
    ];
    const csv = [
      header.join(","),
      ...rows.map((row) =>
        header.map((key) => csvCell((row as unknown as Record<string, unknown>)[key])).join(",")
      ),
    ].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="sms-list.csv"`,
      },
    });
  } catch (err) {
    if (err instanceof DbNotReady) return new NextResponse(err.message, { status: 503 });
    throw err;
  }
}
