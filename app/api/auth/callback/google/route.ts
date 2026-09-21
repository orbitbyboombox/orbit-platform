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

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "unknown_error";
  return message
    .replace(/https?:\/\/[^\s]+/gi, "[redacted-url]")
    .replace(/(code|state|token|secret|authorization|client[_-]?id|client[_-]?secret)\s*[:=][^\s,;]+/gi, "$1=[redacted]")
    .slice(0, 240);
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
    console.warn(JSON.stringify({ event: "google_oauth_callback_rejected", stage: "oauth-callback", code: oauthError ?? (!code ? "missing-code" : !codeVerifier ? "missing-verifier" : "invalid-state") }));
    destination.searchParams.set("google", oauthError === "access_denied" ? "cancelled" : "invalid-callback");
    destination.searchParams.set("google_stage", "oauth-callback");
    return NextResponse.redirect(destination);
  }

  const user = await getGoogleWorkspaceAdministrator();
  if (!user || user.id !== expectedActor) {
    console.warn(JSON.stringify({ event: "google_oauth_callback_rejected", stage: "actor-check", code: "actor-mismatch" }));
    return NextResponse.redirect(new URL("/login", config.redirectUri));
  }

  const provider = new GoogleWorkspaceOAuthProvider(config);
  const result = await provider.connect({ authorizationCode: code, codeVerifier, redirectUri: config.redirectUri });
  if (!result.ok) {
    console.error(JSON.stringify({ event: "google_oauth_token_exchange_failed", stage: "token-exchange", code: result.error.code, message: safeError(result.error.message) }));
    destination.searchParams.set("google", "authentication-error");
    destination.searchParams.set("google_stage", "token-exchange");
    return NextResponse.redirect(destination);
  }

  try {
    await saveGoogleWorkspaceSession(result.session, user.id);
  } catch (error) {
    console.error(JSON.stringify({ event: "google_oauth_persist_failed", stage: "token-persist", code: "PERSISTENCE_ERROR", message: safeError(error) }));
    destination.searchParams.set("google", "persistence-error");
    destination.searchParams.set("google_stage", "token-persist");
    return NextResponse.redirect(destination);
  }
  destination.searchParams.set("google", "connected");
  const response = NextResponse.redirect(destination);
  response.cookies.delete("orbit_google_oauth_state");
  response.cookies.delete("orbit_google_oauth_verifier");
  response.cookies.delete("orbit_google_oauth_actor");
  return response;
}
