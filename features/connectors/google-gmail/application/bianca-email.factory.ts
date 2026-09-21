import "server-only";

import { createAdminClient } from "../../../../lib/supabase/admin";
import { loadGoogleWorkspaceAccessToken } from "../../google-workspace/application/google-workspace.repository";
import { GoogleGmailApiProvider, InMemoryGoogleGmailLiveProvider } from "../provider/google-gmail-live.provider";
import { BiancaEmailAdapter } from "./bianca-email.adapter";

export async function createBiancaEmailAdapter() {
  const testMode = process.env.ORBIT_ENVIRONMENT === "test" || process.env.VERCEL_ENV === "preview";
  const liveEnabled = process.env.BIANCA_EMAIL_SEND_ENABLED?.trim().toLowerCase() === "true";
  const runtimeTest = process.env.BIANCA_EMAIL_RUNTIME_TEST?.trim().toLowerCase() === "true";
  if (testMode && runtimeTest) return new BiancaEmailAdapter(createAdminClient(), new InMemoryGoogleGmailLiveProvider(), "SANDBOX");
  if (testMode || !liveEnabled) return new BiancaEmailAdapter(createAdminClient(), new InMemoryGoogleGmailLiveProvider(), "MOCK");
  return new BiancaEmailAdapter(createAdminClient(), new GoogleGmailApiProvider(await loadGoogleWorkspaceAccessToken()), "LIVE");
}
