import { hasDatabase, query } from "./db";
import { STATUSES, type SmsStatus } from "./sms-status";

export { STATUSES };
export type { SmsStatus };

export type SmsRow = {
  id: string;
  recipient: string;
  guest_name: string | null;
  message: string;
  status: SmsStatus;
  provider: string | null;
  template: string | null;
  segments: number;
  cost: string;
  error: string | null;
  source_ip: string | null;
  created_at: Date;
  sent_at: Date | null;
};

export type SmsFilters = {
  q?: string;
  status?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
};

export type SmsStats = {
  total: number;
  delivered: number;
  failed: number;
  pending: number;
  cost: number;
};

export type SmsListResult = {
  rows: SmsRow[];
  total: number;
  pages: number;
  stats: SmsStats;
};

export class DbNotReady extends Error {
  constructor(public reason: "no-url" | "no-table", message: string) {
    super(message);
  }
}

function buildWhere(f: SmsFilters) {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (f.q) {
    params.push(`%${f.q}%`);
    const i = params.length;
    clauses.push(
      `(recipient ILIKE $${i} OR COALESCE(guest_name,'') ILIKE $${i} OR message ILIKE $${i})`
    );
  }
  if (f.status && STATUSES.includes(f.status as SmsStatus)) {
    params.push(f.status);
    clauses.push(`status = $${params.length}`);
  }
  if (f.from) {
    params.push(f.from);
    clauses.push(`created_at >= $${params.length}::date`);
  }
  if (f.to) {
    params.push(f.to);
    clauses.push(`created_at < ($${params.length}::date + INTERVAL '1 day')`);
  }

  return { where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

function assertDb() {
  if (!hasDatabase()) {
    throw new DbNotReady("no-url", "DATABASE_URL is not configured.");
  }
}

function rethrow(err: unknown): never {
  if (typeof err === "object" && err && (err as { code?: string }).code === "42P01") {
    throw new DbNotReady("no-table", "Table sms_messages does not exist yet.");
  }
  throw err;
}

export async function listSms(f: SmsFilters): Promise<SmsListResult> {
  assertDb();
  const { where, params } = buildWhere(f);
  const offset = (f.page - 1) * f.pageSize;

  try {
    const [rows, agg] = await Promise.all([
      query<SmsRow>(
        `SELECT id::text, recipient, guest_name, message, status, provider, template,
                segments, cost::text, error, source_ip, created_at, sent_at
         FROM sms_messages ${where}
         ORDER BY created_at DESC, id DESC
         LIMIT ${f.pageSize} OFFSET ${offset}`,
        params
      ),
      query<Record<string, string>>(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered,
                COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
                COUNT(*) FILTER (WHERE status IN ('queued','sent'))::int AS pending,
                COALESCE(SUM(cost),0)::float8 AS cost
         FROM sms_messages ${where}`,
        params
      ),
    ]);

    const s = agg[0] as unknown as SmsStats;
    return {
      rows,
      total: s.total,
      pages: Math.max(1, Math.ceil(s.total / f.pageSize)),
      stats: s,
    };
  } catch (err) {
    rethrow(err);
  }
}

export async function allSmsForExport(f: SmsFilters): Promise<SmsRow[]> {
  assertDb();
  const { where, params } = buildWhere(f);
  try {
    return await query<SmsRow>(
      `SELECT id::text, recipient, guest_name, message, status, provider, template,
              segments, cost::text, error, source_ip, created_at, sent_at
       FROM sms_messages ${where}
       ORDER BY created_at DESC, id DESC
       LIMIT 10000`,
      params
    );
  } catch (err) {
    rethrow(err);
  }
}

export function parseFilters(sp: Record<string, string | string[] | undefined>): SmsFilters {
  const one = (k: string) => {
    const v = sp[k];
    const s = Array.isArray(v) ? v[0] : v;
    return s && s.trim() ? s.trim() : undefined;
  };
  const page = Math.max(1, Number(one("page") ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(one("size") ?? 25) || 25));
  const date = (k: string) => {
    const v = one(k);
    return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
  };
  return { q: one("q"), status: one("status"), from: date("from"), to: date("to"), page, pageSize };
}
