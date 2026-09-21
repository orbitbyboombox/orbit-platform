import { NextRequest, NextResponse } from "next/server";
import { createGoogleWorkspaceAuthorization } from "@/features/connectors/google-workspace/application/google-workspace.authorization";
import { getGoogleWorkspaceAdministrator } from "@/features/connectors/google-workspace/application/google-workspace.authorization.guard";
import { createNOVAGoogleHandoff, usesNOVAGoogleCore } from "@/features/connectors/google-workspace/application/google-nova-core";

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "unknown_error";
  return message
    .replace(/https?:\/\/[^\s]+/gi, "[redacted-url]")
    .replace(/(token|secret|authorization|client[_-]?id|client[_-]?secret)\s*[:=][^\s,;]+/gi, "$1=[redacted]")
    .slice(0, 240);
}

export async function GET(request: NextRequest) {
  const user = await getGoogleWorkspaceAdministrator();
  if (!user) return NextResponse.redirect(new URL("/login", request.nextUrl.origin));

  try {
    if (usesNOVAGoogleCore()) {
      const returnUrl = new URL("/settings?section=connections", request.nextUrl.origin).toString();
      return NextResponse.redirect(await createNOVAGoogleHandoff(returnUrl));
    }
    const authorization = createGoogleWorkspaceAuthorization();
    const response = NextResponse.redirect(authorization.authorizationUrl);
    const secure = process.env.NODE_ENV === "production";
    response.cookies.set("orbit_google_oauth_state", authorization.state, { httpOnly: true, maxAge: 600, path: "/api/auth/callback/google", sameSite: "lax", secure });
    response.cookies.set("orbit_google_oauth_verifier", authorization.codeVerifier, { httpOnly: true, maxAge: 600, path: "/api/auth/callback/google", sameSite: "lax", secure });
    response.cookies.set("orbit_google_oauth_actor", user.id, { httpOnly: true, maxAge: 600, path: "/api/auth/callback/google", sameSite: "lax", secure });
    return response;
  } catch (error) {
    console.error(JSON.stringify({ event: "google_oauth_start_failed", stage: "oauth-start", code: "HANDOFF_OR_CONFIG_ERROR", message: safeError(error) }));
    const destination = new URL("/settings", request.nextUrl.origin);
    destination.searchParams.set("section", "connections");
    destination.searchParams.set("google", "configuration-error");
    destination.searchParams.set("google_stage", "oauth-start");
    return NextResponse.redirect(destination);
  }
}
