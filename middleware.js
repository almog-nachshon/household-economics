import { NextResponse } from "next/server";
import { COOKIE, verifySession } from "@/lib/session";

export async function middleware(req) {
  if (await verifySession(req.cookies.get(COOKIE)?.value)) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = { matcher: ["/((?!login|api/cron|_next|favicon.ico).*)"] };
