import { handleSmsInsert } from "@/lib/sms-insert";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handleSmsInsert;
export const POST = handleSmsInsert;
