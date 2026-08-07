import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/login" || request.nextUrl.pathname === "/api/auth/session-expired" || request.nextUrl.pathname.startsWith("/sign/") || request.nextUrl.pathname.startsWith("/api/signing/") || request.nextUrl.pathname.startsWith("/p/") || request.nextUrl.pathname.startsWith("/api/portal/")) return NextResponse.next();
  return updateSession(request);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
