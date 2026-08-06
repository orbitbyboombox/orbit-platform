import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createDisconnectedGoogleWorkspaceConnection, GOOGLE_WORKSPACE_SERVICES, resolveConnectionHealth } from "./google-workspace.connector";
import type { GoogleWorkspaceProviderSession } from "../provider/google-workspace.provider";
import type { GoogleWorkspaceConnection, GoogleWorkspaceService } from "../types/google-workspace.types";
import { GoogleWorkspaceOAuthProvider } from "../provider/google-workspace-oauth.provider";
import { getGoogleWorkspaceEnvironment } from "../provider/google-workspace.config";

interface StoredConnection {
  id: string;
  workspace_account: string;
  workspace_domain: string;
  connection_status: "CONNECTED" | "DISCONNECTED" | "ERROR";
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  scopes: string[];
  connected_at: string | null;
  last_verified_at: string | null;
}

function grantedServices(scopes: readonly string[]): GoogleWorkspaceService[] {
  const result: GoogleWorkspaceService[] = [];
  if (scopes.some((scope) => scope.includes("calendar"))) result.push("CALENDAR");
  if (scopes.some((scope) => scope.includes("drive"))) result.push("DRIVE");
  if (scopes.some((scope) => scope.includes("gmail"))) result.push("GMAIL");
  return result;
}

export async function saveGoogleWorkspaceSession(session: GoogleWorkspaceProviderSession, actorId: string) {
  if (!session.tokens.refreshToken) throw new Error("Google did not return a refresh token.");
  const admin = createAdminClient();
  const { error } = await admin.from("google_workspace_connections").upsert({
    singleton_key: "PRIMARY",
    workspace_account: session.account,
    workspace_domain: session.domain,
    connection_status: "CONNECTED",
    access_token: session.tokens.accessToken,
    refresh_token: session.tokens.refreshToken,
    token_expires_at: session.tokens.expiresAt,
    scopes: session.tokens.scopes,
    connected_at: session.connectedSince,
    disconnected_at: null,
    last_verified_at: new Date().toISOString(),
    updated_by: actorId,
  }, { onConflict: "singleton_key" });
  if (error) throw error;
  await appendGoogleTimeline("GOOGLE_CONNECTED", "Google Workspace conectado correctamente.", actorId);
  for (const service of session.grantedServices) {
    const labels = { CALENDAR: "Google Calendar autorizado.", DRIVE: "Google Drive autorizado.", GMAIL: "Gmail autorizado." } as const;
    await appendGoogleTimeline(`${service}_AUTHORIZED`, labels[service], actorId);
  }
}

export async function loadGoogleWorkspaceConnection(): Promise<GoogleWorkspaceConnection> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("google_workspace_connections").select("id,workspace_account,workspace_domain,connection_status,access_token,refresh_token,token_expires_at,scopes,connected_at,last_verified_at").eq("singleton_key", "PRIMARY").maybeSingle<StoredConnection>();
  if (error) throw error;
  if (!data || data.connection_status !== "CONNECTED") return createDisconnectedGoogleWorkspaceConnection();
  let scopes = data.scopes ?? [];
  let expiresAt = data.token_expires_at;
  const expired = !expiresAt || new Date(expiresAt).getTime() <= Date.now() + 60_000;
  if (expired && data.refresh_token) {
    const refreshed = await new GoogleWorkspaceOAuthProvider(getGoogleWorkspaceEnvironment()).refresh(data.refresh_token);
    if (refreshed.ok) {
      scopes = [...refreshed.session.tokens.scopes];
      expiresAt = refreshed.session.tokens.expiresAt;
      const { error: refreshError } = await admin.from("google_workspace_connections").update({ access_token: refreshed.session.tokens.accessToken, refresh_token: refreshed.session.tokens.refreshToken, token_expires_at: expiresAt, scopes, last_verified_at: new Date().toISOString() }).eq("singleton_key", "PRIMARY");
      if (refreshError) throw refreshError;
    }
  }
  const services = grantedServices(scopes);
  const stillExpired = !expiresAt || new Date(expiresAt).getTime() <= Date.now();
  const tokenStatus = stillExpired ? "REFRESH_REQUIRED" : "HEALTHY";
  return {
    workspaceAccount: data.workspace_account,
    workspaceDomain: data.workspace_domain,
    connectionStatus: "CONNECTED",
    connectedSince: data.connected_at ?? undefined,
    lastVerifiedAt: data.last_verified_at ?? undefined,
    tokenStatus,
    health: resolveConnectionHealth("CONNECTED", tokenStatus),
    grantedServices: GOOGLE_WORKSPACE_SERVICES.map((service) => ({ ...service, granted: services.includes(service.id) })),
  };
}

export async function disconnectGoogleWorkspace(actorId: string) {
  const admin = createAdminClient();
  const { data, error: readError } = await admin.from("google_workspace_connections").select("refresh_token,access_token").eq("singleton_key", "PRIMARY").maybeSingle<{ refresh_token: string | null; access_token: string | null }>();
  if (readError) throw readError;
  const token = data?.refresh_token ?? data?.access_token;
  if (token) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  const { error } = await admin.from("google_workspace_connections").update({ connection_status: "DISCONNECTED", access_token: null, refresh_token: null, token_expires_at: null, disconnected_at: new Date().toISOString(), updated_by: actorId }).eq("singleton_key", "PRIMARY");
  if (error) throw error;
  await appendGoogleTimeline("GOOGLE_DISCONNECTED", "Google Workspace desconectado.", actorId);
}

async function appendGoogleTimeline(action: string, humanMessage: string, actorId: string) {
  const admin = createAdminClient();
  const id = randomUUID();
  const { error } = await admin.from("timeline_events").insert({
    event_type: action,
    title: humanMessage,
    description: humanMessage,
    orbit_event_id: `ORB-GOOGLE-${id}`,
    actor_id: actorId,
    actor_label: "Administrador",
    source: "Google Workspace",
    action,
    entity_type: "GoogleWorkspaceConnection",
    entity_id: "PRIMARY",
    human_message: humanMessage,
    correlation_id: id,
    created_by: actorId,
  });
  if (error) throw error;
}
