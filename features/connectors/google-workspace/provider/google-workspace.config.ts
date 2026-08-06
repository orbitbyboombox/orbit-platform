import "server-only";

export const GOOGLE_WORKSPACE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.compose",
] as const;

export interface GoogleWorkspaceEnvironment {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function getGoogleWorkspaceEnvironment(): GoogleWorkspaceEnvironment {
  const clientId = process.env.GOOGLE_WORKSPACE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_WORKSPACE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_WORKSPACE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Missing Google Workspace OAuth environment variables.");
  }

  return { clientId, clientSecret, redirectUri };
}
