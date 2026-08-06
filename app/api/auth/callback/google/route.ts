import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { GoogleWorkspaceOAuthProvider } from "@/features/connectors/google-workspace/provider/google-workspace-oauth.provider";
import { getGoogleWorkspaceEnvironment } from "@/features/connectors/google-workspace/provider/google-workspace.config";
import { saveGoogleWorkspaceSession } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import { getGoogleWorkspaceAdministrator } from "@/features/connectors/google-workspace/application/google-workspace.authorization.guard";

function sameValue(left?: string, right?: string) {
  if (!left || !right) return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  const config = getGoogleWorkspaceEnvironment();
  const destination = new URL("/settings", config.redirectUri);
  const state = request.nextUrl.searchParams.get("state") ?? undefined;
  const code = request.nextUrl.searchParams.get("code");
  const expectedState = request.cookies.get("orbit_google_oauth_state")?.value;
  const codeVerifier = request.cookies.get("orbit_google_oauth_verifier")?.value;
  const expectedActor = request.cookies.get("orbit_google_oauth_actor")?.value;
  const oauthError = request.nextUrl.searchParams.get("error");

  if (oauthError || !code || !codeVerifier || !sameValue(state, expectedState)) {
    destination.searchParams.set("google", oauthError === "access_denied" ? "cancelled" : "invalid-callback");
    return NextResponse.redirect(destination);
  }

  const user = await getGoogleWorkspaceAdministrator();
  if (!user || user.id !== expectedActor) return NextResponse.redirect(new URL("/login", config.redirectUri));

  const provider = new GoogleWorkspaceOAuthProvider(config);
  const result = await provider.connect({ authorizationCode: code, codeVerifier, redirectUri: config.redirectUri });
  if (!result.ok) {
    destination.searchParams.set("google", "authentication-error");
    return NextResponse.redirect(destination);
  }

  await saveGoogleWorkspaceSession(result.session, user.id);
  destination.searchParams.set("google", "connected");
  const response = NextResponse.redirect(destination);
  response.cookies.delete("orbit_google_oauth_state");
  response.cookies.delete("orbit_google_oauth_verifier");
  response.cookies.delete("orbit_google_oauth_actor");
  return response;
}
