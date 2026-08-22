import { NextResponse } from "next/server";
import { USER_COOKIE } from "@/lib/user-auth";

export async function POST(req: Request) {
  const res = NextResponse.redirect(new URL("/user/login", req.url), { status: 303 });
  res.cookies.set(USER_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
