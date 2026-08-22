import { timingSafeEqual } from "node:crypto";

/** Reads the API key from an Authorization: Bearer or X-API-Key header. */
export function readApiKey(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return req.headers.get("x-api-key");
}

export function apiKeyValid(provided: string | null): boolean {
  const expected = process.env.SMS_API_KEY;
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
