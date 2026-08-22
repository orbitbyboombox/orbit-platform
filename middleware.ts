import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/pdf.worker.min.mjs" || request.nextUrl.pathname.startsWith("/branding/") || request.nextUrl.pathname.startsWith("/catalogo/") || request.nextUrl.pathname === "/" || request.nextUrl.pathname === "/login" || request.nextUrl.pathname === "/portal" || request.nextUrl.pathname === "/portal/login" || request.nextUrl.pathname === "/staff/login" || request.nextUrl.pathname.startsWith("/staff-portal") || request.nextUrl.pathname.startsWith("/api/staff-portal/") || request.nextUrl.pathname === "/api/cron/staff-assignment-reminders" || request.nextUrl.pathname.startsWith("/staff/onboarding/") || request.nextUrl.pathname === "/api/staff-onboarding/submit" || request.nextUrl.pathname === "/api/staff-onboarding/upload" || request.nextUrl.pathname === "/api/auth/session-expired" || request.nextUrl.pathname.startsWith("/sign/") || request.nextUrl.pathname.startsWith("/api/signing/") || request.nextUrl.pathname.startsWith("/p/") || request.nextUrl.pathname.startsWith("/api/portal/") || request.nextUrl.pathname.startsWith("/booking/") || request.nextUrl.pathname.startsWith("/api/booking/") || request.nextUrl.pathname.startsWith("/api/admin/")) return NextResponse.next();
  return updateSession(request);
}

export const config = { matcher: ["/((?!_next/static|_next/image|branding/|favicon.ico).*)"] };
