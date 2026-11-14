/**
 * Aadhaar QR relay: a phone scans the QR on /s/<code> and posts the raw QR text here;
 * checkin.exe on the hotel PC (which owns <code>) polls and takes it.
 *
 * The text lives ONLY in this process's memory, for at most TTL_MS, and is deleted the
 * moment the PC fetches it. It is never written to Postgres, to disk or to a log, so it
 * cannot end up in a database backup. That is deliberate: the payload is a guest's
 * Aadhaar data. It works because production is a single `next start` process (Linode);
 * on a multi-instance host this would need a shared store.
 */

const TTL_MS = 90_000;
const MAX_ENTRIES = 2000;
export const MAX_PAYLOAD = 12_000;

type Entry = { payload: string; at: number };

const g = globalThis as unknown as { __aadhaarRelay?: Map<string, Entry> };
const store: Map<string, Entry> = g.__aadhaarRelay ?? (g.__aadhaarRelay = new Map());

/** Pairing code: 12 chars from an alphabet without look-alikes (no 0/O/1/I). */
export const CODE_RE = /^[A-HJ-NP-Z2-9]{12}$/;

/** True for the two Aadhaar QR formats: the old XML one and the all-digits "secure QR". */
export function looksLikeAadhaarQr(text: string): boolean {
  if (text.length < 50 || text.length > MAX_PAYLOAD) return false;
  if (/PrintLetterBarcodeData/i.test(text)) return true;
  return /^\d{300,}$/.test(text.trim());
}

function sweep(now: number) {
  for (const [k, v] of store) if (now - v.at > TTL_MS) store.delete(k);
}

export function relayPut(code: string, payload: string): void {
  const now = Date.now();
  sweep(now);
  if (store.size >= MAX_ENTRIES && !store.has(code)) {
    // Full of unexpired entries: drop the oldest rather than refuse a real scan.
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  store.set(code, { payload, at: now });
}

/* ------------------------------------------------------------------ ID card photos
 * Same idea for the photos of the guest's ID card (front / back) that the phone page sends
 * for checkin.exe's "ID Photo" box: memory only, short-lived, deleted when the PC takes
 * them. One picture per code and side; a newer one replaces the older.
 * Sizes are kept small on purpose: nginx in front of the app refuses bodies over 1 MB, and
 * the whole store is bounded (MAX_IMAGES x MAX_IMAGE = about 36 MB at the very worst).
 */

const IMG_TTL_MS = 180_000;
const MAX_IMAGES = 40;
export const MAX_IMAGE = 900_000;

export type Side = "f" | "b";
type Img = { data: ArrayBuffer; at: number };

const gi = globalThis as unknown as { __aadhaarImages?: Map<string, Img> };
const images: Map<string, Img> = gi.__aadhaarImages ?? (gi.__aadhaarImages = new Map());

function sweepImages(now: number) {
  for (const [k, v] of images) if (now - v.at > IMG_TTL_MS) images.delete(k);
}

export function imagePut(code: string, side: Side, data: ArrayBuffer): void {
  const now = Date.now();
  sweepImages(now);
  const key = `${code}:${side}`;
  images.delete(key); // re-insert at the end: the Map's order is its age order
  if (images.size >= MAX_IMAGES) {
    const oldest = images.keys().next().value;
    if (oldest !== undefined) images.delete(oldest);
  }
  images.set(key, { data, at: now });
}

/** Returns one pending photo for this code (front before back) and deletes it. */
export function imageTake(code: string): { side: Side; data: ArrayBuffer } | null {
  const now = Date.now();
  for (const side of ["f", "b"] as const) {
    const key = `${code}:${side}`;
    const e = images.get(key);
    if (!e) continue;
    images.delete(key);
    if (now - e.at <= IMG_TTL_MS) return { side, data: e.data };
  }
  return null;
}

/** Returns the pending scan for this code and deletes it (one-time read). */
export function relayTake(code: string): string | null {
  const now = Date.now();
  const e = store.get(code);
  if (!e) return null;
  store.delete(code);
  return now - e.at > TTL_MS ? null : e.payload;
}
