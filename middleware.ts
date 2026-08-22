import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { USER_COOKIE, verifyUserToken } from "@/lib/user-auth";

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);

  if (pathname.startsWith("/admin") && !session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  if (pathname === "/user" || pathname.startsWith("/user/")) {
    const user = await verifyUserToken(req.cookies.get(USER_COOKIE)?.value);
    if (pathname === "/user/login" && user) {
      const url = req.nextUrl.clone();
      url.pathname = "/user";
      url.search = "";
      return NextResponse.redirect(url);
    }
    if (pathname !== "/user/login" && !user) {
      const url = req.nextUrl.clone();
      url.pathname = "/user/login";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (pathname === "/login" && session) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/login", "/user", "/user/:path*"],
};
