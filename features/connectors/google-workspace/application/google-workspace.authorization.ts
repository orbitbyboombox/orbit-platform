import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { GOOGLE_WORKSPACE_SCOPES, getGoogleWorkspaceEnvironment } from "../provider/google-workspace.config";

function base64Url(value: Buffer) {
  return value.toString("base64url");
}

export function createGoogleWorkspaceAuthorization() {
  const { clientId, redirectUri } = getGoogleWorkspaceEnvironment();
  const state = base64Url(randomBytes(32));
  const codeVerifier = base64Url(randomBytes(64));
  const codeChallenge = base64Url(createHash("sha256").update(codeVerifier).digest());
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");

  url.search = new URLSearchParams({
    access_type: "offline",
    client_id: clientId,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    include_granted_scopes: "true",
    prompt: "consent",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_WORKSPACE_SCOPES.join(" "),
    state,
  }).toString();

  return { authorizationUrl: url.toString(), codeVerifier, state };
}
