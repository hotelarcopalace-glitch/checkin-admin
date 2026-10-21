import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { USER_COOKIE, verifyUserToken } from "@/lib/user-auth";
import { BUILD_COOKIE, verifyBuildToken } from "@/lib/build-auth";

// Admin panel lives under a secret base path (not /admin). /admin and /login
// no longer exist as routes, so they 404 for anyone who guesses them.
const ADMIN_BASE = "/mng-x7k9";
const ADMIN_LOGIN = "/mng-x7k9/login";

// Redirects must go to the public address. Behind nginx the app only sees 127.0.0.1:3000 as its own
// origin, so a redirect cloned from req.nextUrl would send visitors to localhost.
function redirectTo(req: NextRequest, pathname: string, search = "") {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const base = process.env.SITE_URL || (host ? `${proto}://${host}` : req.nextUrl.origin);
  return NextResponse.redirect(new URL(pathname + search, base));
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // BuildKhata app: protect /build except its own login page and static
  // assets (manifest, icon — any path with a file extension under /build).
  if (pathname === "/build" || pathname.startsWith("/build/")) {
    const lastSeg = pathname.startsWith("/build/") ? pathname.slice("/build/".length) : "";
    const isAsset = lastSeg.includes(".");
    if (pathname !== "/build/login" && !isAsset) {
      const build = await verifyBuildToken(req.cookies.get(BUILD_COOKIE)?.value);
      if (!build) {
        return redirectTo(req, "/build/login");
      }
    }
    return NextResponse.next();
  }

  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);

  // Protect the whole admin area except its own login page.
  const inAdmin = pathname === ADMIN_BASE || pathname.startsWith(ADMIN_BASE + "/");
  if (inAdmin && pathname !== ADMIN_LOGIN && !session) {
    return redirectTo(req, ADMIN_LOGIN, `?next=${encodeURIComponent(pathname + search)}`);
  }

  // Already signed in and hitting the login page -> go to dashboard.
  if (pathname === ADMIN_LOGIN && session) {
    return redirectTo(req, ADMIN_BASE);
  }

  // Guest area. /user renders its own bottom-sheet login when logged out, so we
  // no longer force a redirect there — only bounce an already-logged-in guest
  // off the standalone /user/login page.
  if (pathname === "/user/login") {
    const user = await verifyUserToken(req.cookies.get(USER_COOKIE)?.value);
    if (user) {
      return redirectTo(req, "/user");
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/mng-x7k9", "/mng-x7k9/:path*", "/user", "/user/:path*", "/build", "/build/:path*"],
};
