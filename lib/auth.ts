import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "checkin_session";
const SESSION_HOURS = 12;

function secretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET is missing or too short (need 32+ chars)");
  }
  return new TextEncoder().encode(secret);
}

// tag set => a limited "hotel" login (sees only its own tagged SMS).
// tag empty/undefined => full super-admin.
export type Session = { username: string; role: "admin"; tag?: string };

export async function createSessionToken(username: string, tag?: string): Promise<string> {
  const claims: Record<string, unknown> = { username, role: "admin" };
  if (tag && tag.trim()) claims.tag = tag.trim();
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secretKey());
}

export async function verifySessionToken(token?: string): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (payload.role !== "admin" || typeof payload.username !== "string") return null;
    const tag = typeof payload.tag === "string" && payload.tag.trim() ? payload.tag.trim() : undefined;
    return { username: payload.username, role: "admin", tag };
  } catch {
    return null;
  }
}

export const sessionMaxAge = SESSION_HOURS * 60 * 60;
