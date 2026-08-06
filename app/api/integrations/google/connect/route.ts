import { NextRequest, NextResponse } from "next/server";
import { createGoogleWorkspaceAuthorization } from "@/features/connectors/google-workspace/application/google-workspace.authorization";
import { getGoogleWorkspaceAdministrator } from "@/features/connectors/google-workspace/application/google-workspace.authorization.guard";

export async function GET(request: NextRequest) {
  const user = await getGoogleWorkspaceAdministrator();
  if (!user) return NextResponse.redirect(new URL("/login", request.nextUrl.origin));

  try {
    const authorization = createGoogleWorkspaceAuthorization();
    const response = NextResponse.redirect(authorization.authorizationUrl);
    const secure = process.env.NODE_ENV === "production";
    response.cookies.set("orbit_google_oauth_state", authorization.state, { httpOnly: true, maxAge: 600, path: "/api/auth/callback/google", sameSite: "lax", secure });
    response.cookies.set("orbit_google_oauth_verifier", authorization.codeVerifier, { httpOnly: true, maxAge: 600, path: "/api/auth/callback/google", sameSite: "lax", secure });
    response.cookies.set("orbit_google_oauth_actor", user.id, { httpOnly: true, maxAge: 600, path: "/api/auth/callback/google", sameSite: "lax", secure });
    return response;
  } catch {
    return NextResponse.redirect(new URL("/settings?google=configuration-error", request.nextUrl.origin));
  }
}
