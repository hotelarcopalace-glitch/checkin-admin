import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { query } from "./db";

/**
 * Office Sync: a one-way mirror of a hotel's CHECKIN data folder for a view-only copy of the
 * program in the owner's office (CKSYNC.exe in the desktop suite).
 *
 *   hotel PC  --push-->  this server  --pull-->  office PC
 *
 * What is stored here is opaque: every file is cut into chunks, each chunk is compressed and
 * encrypted with AES-256-GCM on the hotel PC, and its name is an HMAC of its content. The key
 * never reaches this server (the hotel shows an "office key" that is typed into the office PC),
 * so guest data cannot be read here, in backups, or by anyone with access to the disk.
 *
 * The server knows two tokens per hotel, as SHA-256 hashes: the hotel's push token (may write)
 * and the office's pull token (read only). A hotel is created in the admin panel, which shows a
 * one-time setup code; the hotel PC uses it once to register its two token hashes.
 *
 * Layout on disk (SYNC_DIR, outside the release folders so a deploy never touches it):
 *   <SYNC_DIR>/<hotel id>/manifest.json            current file table (envelope, see putManifest)
 *   <SYNC_DIR>/<hotel id>/chunks/<aa>/<64 hex>     encrypted chunks
 */

export const HID_RE = /^[a-z0-9]{8}$/;
export const CHUNK_ID_RE = /^[0-9a-f]{64}$/;
/** A chunk is 256 KB of file data before compression; this leaves room for incompressible data. */
export const MAX_CHUNK_BYTES = 400 * 1024;
export const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
const MAX_IDS = 50_000;
/** Chunks no longer named by the manifest are kept this long, so an office PC that is in the
 *  middle of pulling the previous version can still finish. */
const GC_AFTER_MS = 24 * 60 * 60 * 1000;

export type SyncHotel = {
  id: string;
  name: string;
  setup_hash: string | null;
  write_hash: string | null;
  read_hash: string | null;
  quota_mb: number;
  used_bytes: string;
  files: number;
  pushed_at: string | null;
  pulled_at: string | null;
  /** Owner phone app: hash of its read token, and when the hotel last sent the report summary. */
  mobile_hash: string | null;
  summary_at: string | null;
  active: boolean;
  created_at: string;
};

export function syncDir() {
  return process.env.SYNC_DIR || path.join(os.homedir(), "syncdata");
}

const hotelDir = (hid: string) => path.join(syncDir(), hid);
const chunkPath = (hid: string, id: string) => path.join(hotelDir(hid), "chunks", id.slice(0, 2), id);
const manifestPath = (hid: string) => path.join(hotelDir(hid), "manifest.json");
const summaryPath = (hid: string) => path.join(hotelDir(hid), "summary.json");

export const sha256Hex = (s: string) => createHash("sha256").update(s).digest("hex");

function sameHash(a: string | null, b: string) {
  if (!a || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function getHotel(hid: string): Promise<SyncHotel | null> {
  if (!HID_RE.test(hid)) return null;
  const rows = await query<SyncHotel>(`SELECT * FROM sync_hotels WHERE id = $1`, [hid]);
  return rows[0] ?? null;
}

/** Bearer token -> which role it proves for this hotel ("write" may also read). */
export async function authHotel(hid: string, req: Request): Promise<{ hotel: SyncHotel; role: "write" | "read" } | null> {
  const m = /^Bearer ([0-9a-f]{64})$/.exec(req.headers.get("authorization") ?? "");
  if (!m) return null;
  const hotel = await getHotel(hid);
  if (!hotel || !hotel.active) return null;
  const h = sha256Hex(m[1]);
  if (sameHash(hotel.write_hash, h)) return { hotel, role: "write" };
  if (sameHash(hotel.read_hash, h)) return { hotel, role: "read" };
  return null;
}

/** Admin: a new hotel and its one-time setup code (shown once, only the hash is kept). */
export async function createHotel(name: string, quotaMb: number): Promise<{ id: string; setup: string }> {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = Array.from(randomBytes(8), (b) => alphabet[b % alphabet.length]).join("");
    const setup = randomBytes(12).toString("hex");
    const rows = await query<{ id: string }>(
      `INSERT INTO sync_hotels (id, name, setup_hash, quota_mb) VALUES ($1,$2,$3,$4)
       ON CONFLICT (id) DO NOTHING RETURNING id`,
      [id, name, sha256Hex(setup), quotaMb]
    );
    if (rows.length) return { id, setup };
  }
  throw new Error("Could not allocate a hotel id");
}

/** Admin: a fresh setup code. The old tokens stop working, so the hotel and the office are set up again. */
export async function resetHotel(hid: string): Promise<string | null> {
  const setup = randomBytes(12).toString("hex");
  const rows = await query<{ id: string }>(
    `UPDATE sync_hotels SET setup_hash = $2, write_hash = NULL, read_hash = NULL, mobile_hash = NULL, summary_at = NULL
      WHERE id = $1 RETURNING id`,
    [hid, sha256Hex(setup)]
  );
  // the phones' key changes with the hotel's new secret, so what the old key could read goes too
  if (rows.length) await fs.rm(summaryPath(hid), { force: true });
  return rows.length ? setup : null;
}

export async function deleteHotel(hid: string) {
  if (!HID_RE.test(hid)) return;
  await query(`DELETE FROM sync_hotels WHERE id = $1`, [hid]);
  await fs.rm(hotelDir(hid), { recursive: true, force: true });
}

/** Hotel PC, once: trade the setup code for its two token hashes. */
export async function registerHotel(hid: string, setup: string, writeHash: string, readHash: string): Promise<boolean> {
  if (!HID_RE.test(hid) || !CHUNK_ID_RE.test(writeHash) || !CHUNK_ID_RE.test(readHash) || writeHash === readHash) return false;
  const rows = await query<{ id: string }>(
    `UPDATE sync_hotels SET write_hash = $3, read_hash = $4, setup_hash = NULL
      WHERE id = $1 AND active AND setup_hash IS NOT NULL AND setup_hash = $2 RETURNING id`,
    [hid, sha256Hex(setup), writeHash, readHash]
  );
  return rows.length > 0;
}

export function cleanIds(v: unknown): string[] | null {
  if (!Array.isArray(v) || v.length > MAX_IDS) return null;
  for (const x of v) if (typeof x !== "string" || !CHUNK_ID_RE.test(x)) return null;
  return v as string[];
}

async function exists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function missingChunks(hid: string, ids: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const id of new Set(ids)) if (!(await exists(chunkPath(hid, id)))) out.push(id);
  return out;
}

export async function putChunk(hid: string, id: string, data: Buffer) {
  const p = chunkPath(hid, id);
  if (await exists(p)) return;
  await fs.mkdir(path.dirname(p), { recursive: true });
  const tmp = `${p}.${randomBytes(4).toString("hex")}.tmp`;
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, p);
}

export async function getChunk(hid: string, id: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(chunkPath(hid, id));
  } catch {
    return null;
  }
}

/** Bytes on disk for this hotel (all chunk files, including ones waiting for clean-up). */
async function diskUsage(hid: string, keep?: Set<string>): Promise<number> {
  let total = 0;
  const root = path.join(hotelDir(hid), "chunks");
  let subs: string[] = [];
  try {
    subs = await fs.readdir(root);
  } catch {
    return 0;
  }
  const now = Date.now();
  for (const sub of subs) {
    let names: string[] = [];
    try {
      names = await fs.readdir(path.join(root, sub));
    } catch {
      continue;
    }
    for (const name of names) {
      const p = path.join(root, sub, name);
      try {
        const st = await fs.stat(p);
        // clean-up: chunks the new manifest no longer names (and stale temp files), once they are a day old
        if (keep && !keep.has(name) && now - st.mtimeMs > GC_AFTER_MS) {
          await fs.rm(p, { force: true });
          continue;
        }
        total += st.size;
      } catch {
        /* removed meanwhile */
      }
    }
  }
  return total;
}

export type ManifestEnvelope = {
  v: 1;
  /** When the hotel PC took this snapshot (its clock), "YYYYMMDDHHMMSS". */
  ts: string;
  files: number;
  /** Every chunk the snapshot needs. Opaque ids; lets the server check completeness and clean up. */
  chunks: string[];
  /** The file table (names, sizes, chunk order), encrypted like a chunk, base64. */
  blob: string;
};

export function parseEnvelope(raw: string): ManifestEnvelope | null {
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    const chunks = cleanIds(j.chunks);
    if (j.v !== 1 || !chunks) return null;
    if (typeof j.ts !== "string" || !/^\d{14}$/.test(j.ts)) return null;
    if (typeof j.files !== "number" || !Number.isInteger(j.files) || j.files < 0 || j.files > 100_000) return null;
    if (typeof j.blob !== "string" || !/^[A-Za-z0-9+/=]+$/.test(j.blob)) return null;
    return { v: 1, ts: j.ts, files: j.files, chunks, blob: j.blob };
  } catch {
    return null;
  }
}

/**
 * Makes `env` the hotel's current snapshot. Refused (with the list) while any chunk it names is
 * missing, so the office never sees a snapshot it cannot download completely.
 */
export async function putManifest(hid: string, env: ManifestEnvelope): Promise<{ ok: true; usedBytes: number } | { ok: false; missing: string[] }> {
  const missing = await missingChunks(hid, env.chunks);
  if (missing.length) return { ok: false, missing: missing.slice(0, 2000) };

  await fs.mkdir(hotelDir(hid), { recursive: true });
  const p = manifestPath(hid);
  const tmp = `${p}.${randomBytes(4).toString("hex")}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(env));
  await fs.rename(tmp, p);

  const usedBytes = await diskUsage(hid, new Set(env.chunks));
  await query(`UPDATE sync_hotels SET used_bytes = $2, files = $3, pushed_at = NOW() WHERE id = $1`, [hid, usedBytes, env.files]);
  return { ok: true, usedBytes };
}

export async function getManifest(hid: string): Promise<string | null> {
  try {
    return await fs.readFile(manifestPath(hid), "utf8");
  } catch {
    return null;
  }
}

export async function notePull(hid: string) {
  await query(`UPDATE sync_hotels SET pulled_at = NOW() WHERE id = $1`, [hid]);
}

/** True while this hotel may still upload (disk use is refreshed at every manifest). */
export function underQuota(hotel: SyncHotel) {
  return Number(hotel.used_bytes) < hotel.quota_mb * 1024 * 1024;
}

/* ------------------------------------------------------------------------------------------
 * Owner phone app (checkin.co.in/owner)
 *
 * Beside the full data mirror, the hotel PC sends a small report summary for the owner's phone:
 * the Night Audit Summary (sale, collection, occupancy) of the last weeks, as CHECKIN itself
 * prints it. It is one blob, encrypted on the hotel PC with a "mobile key" that is separate from
 * the office key (a lost phone must not open the whole database). The server keeps the blob and
 * the SHA-256 of the phones' read token, which the hotel PC sends along with every summary; the
 * mobile key itself is shown only on the hotel PC and typed (or scanned) into the phone.
 *   <SYNC_DIR>/<hotel id>/summary.json     {"v":1,"at":"<ISO time>","blob":"<base64>"}
 * ------------------------------------------------------------------------------------------ */

export const MAX_SUMMARY_BYTES = 600 * 1024;

export async function putSummary(hid: string, mobileHash: string, blob: string) {
  await fs.mkdir(hotelDir(hid), { recursive: true });
  const p = summaryPath(hid);
  const tmp = `${p}.${randomBytes(4).toString("hex")}.tmp`;
  await fs.writeFile(tmp, JSON.stringify({ v: 1, at: new Date().toISOString(), blob }));
  await fs.rename(tmp, p);
  await query(`UPDATE sync_hotels SET mobile_hash = $2, summary_at = NOW() WHERE id = $1`, [hid, mobileHash]);
}

export async function getSummary(hid: string): Promise<{ at: string; blob: string } | null> {
  try {
    const j = JSON.parse(await fs.readFile(summaryPath(hid), "utf8")) as { at?: unknown; blob?: unknown };
    return typeof j.at === "string" && typeof j.blob === "string" ? { at: j.at, blob: j.blob } : null;
  } catch {
    return null;
  }
}

/** Bearer token of the owner phone app -> the hotel it may read the summary of. */
export async function authMobile(hid: string, req: Request): Promise<SyncHotel | null> {
  const m = /^Bearer ([0-9a-f]{64})$/.exec(req.headers.get("authorization") ?? "");
  if (!m) return null;
  const hotel = await getHotel(hid);
  if (!hotel || !hotel.active) return null;
  return sameHash(hotel.mobile_hash, sha256Hex(m[1])) ? hotel : null;
}
