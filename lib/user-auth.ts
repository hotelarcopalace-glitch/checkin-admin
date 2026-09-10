import { SignJWT, jwtVerify } from "jose";

export const USER_COOKIE = "checkin_user";
// Effectively permanent — the guest stays logged in until they explicitly tap
// Logout (leaving/closing the page never logs out). Browsers cap cookie age at
// ~400 days, so 365 keeps it valid for a year and quietly renews on each visit.
const DAYS = 365;

function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) throw new Error("SESSION_SECRET is missing");
  return new TextEncoder().encode(secret);
}

export type UserSession = { mobile: string; role: "user" };

export async function createUserToken(mobile: string) {
  return new SignJWT({ mobile, role: "user" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${DAYS}d`)
    .sign(key());
}

export async function verifyUserToken(token?: string): Promise<UserSession | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    if (payload.role !== "user" || typeof payload.mobile !== "string") return null;
    return { mobile: payload.mobile, role: "user" };
  } catch {
    return null;
  }
}

export const userCookieMaxAge = DAYS * 24 * 60 * 60;
