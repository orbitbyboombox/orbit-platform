import { NextRequest, NextResponse } from "next/server";

export function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login?error=session-expired", request.url));
  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith("sb-") && cookie.name.includes("-auth-token")) {
      response.cookies.set(cookie.name, "", {
        expires: new Date(0),
        httpOnly: true,
        maxAge: 0,
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
    }
  }
  return response;
}
