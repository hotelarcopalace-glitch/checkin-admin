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

export type Session = { username: string; role: "admin" };

export async function createSessionToken(username: string): Promise<string> {
  return new SignJWT({ username, role: "admin" })
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
    return { username: payload.username, role: "admin" };
  } catch {
    return null;
  }
}

export const sessionMaxAge = SESSION_HOURS * 60 * 60;
