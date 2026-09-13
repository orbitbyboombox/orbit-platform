import "server-only";

export { usesNOVAGoogleCore } from "./google-nova-config";

const DEFAULT_CORE_URL = "https://connect.orbitnova.cl";

type NOVAServiceState = "HEALTHY" | "RECONNECT_REQUIRED" | "DISCONNECTED" | "APP_CONFIG_ERROR" | "PROVIDER_ERROR" | "NOT_READY";

export type NOVAGoogleHealth = {
  health: NOVAServiceState;
  account_email: string | null;
  services: { email: NOVAServiceState; drive: NOVAServiceState; calendar: NOVAServiceState };
  provider_config: { drive_root_folder_id: string | null; calendar_id: string | null };
  last_verified_at: string | null;
};

export type NOVACertificationRun = {
  id: string;
  tenant_slug: string;
  status: "PASS" | "PENDING" | "RUNNING" | "FAIL" | "BLOCKED_REAUTH" | string;
  checks: Record<string, { pass?: boolean; detail?: unknown }>;
  started_at: string | null;
  finished_at: string | null;
  error_code: string | null;
  created_at: string;
};

function config() {
  const baseUrl = process.env.ORBIT_CONNECT_BASE_URL?.trim() || DEFAULT_CORE_URL;
  const organizationId = process.env.ORBIT_ORGANIZATION_ID?.trim();
  const clientSlug = process.env.ORBIT_TENANT_SLUG?.trim();
  const clientToken = process.env.ORBIT_CONNECT_CLIENT_TOKEN?.trim();
  return { baseUrl: baseUrl.replace(/\/$/, ""), organizationId, clientSlug, clientToken };
}

async function request(path: string, init: RequestInit = {}) {
  const value = config();
  if (!value.organizationId || !value.clientSlug || !value.clientToken) throw new Error("NOVA Google Core no está configurado.");
  return fetch(`${value.baseUrl}${path}`, {
    ...init,
    headers: { "x-orbit-client-token": value.clientToken, ...init.headers },
    cache: "no-store",
  });
}

export async function loadNOVAGoogleHealth(): Promise<NOVAGoogleHealth> {
  const value = config();
  const response = await request(`/api/integrations/google/health?organization_id=${encodeURIComponent(value.organizationId!)}&client_slug=${encodeURIComponent(value.clientSlug!)}`);
  const body = await response.json().catch(() => null) as NOVAGoogleHealth | null;
  if (!response.ok || !body) throw new Error("NOVA Google Core no está saludable.");
  return body;
}

export async function loadNOVALatestCertification(): Promise<NOVACertificationRun | null> {
  const value = config();
  const response = await request(`/api/certification/latest?organization_id=${encodeURIComponent(value.organizationId!)}&client_slug=${encodeURIComponent(value.clientSlug!)}`);
  const body = await response.json().catch(() => null) as { run?: NOVACertificationRun | null } | null;
  if (!response.ok || !body) throw new Error("NOVA Certification Center no está disponible.");
  return body.run ?? null;
}

export async function loadNOVAGoogleAccessToken() {
  const value = config();
  const response = await request(`/api/integrations/google/access-token?organization_id=${encodeURIComponent(value.organizationId!)}&client_slug=${encodeURIComponent(value.clientSlug!)}`);
  const body = await response.json().catch(() => null) as { access_token?: string } | null;
  if (!response.ok || !body?.access_token) throw new Error("NOVA Google Core requiere reconexión.");
  return body.access_token;
}

export async function createNOVAGoogleHandoff(returnUrl: string) {
  const value = config();
  const response = await request("/api/oauth/handoff", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ organization_id: value.organizationId, client_slug: value.clientSlug, return_url: returnUrl }),
  });
  const body = await response.json().catch(() => null) as { authorization_url?: string } | null;
  if (!response.ok || !body?.authorization_url) throw new Error("No fue posible iniciar la conexión Google mediante NOVA.");
  return body.authorization_url;
}

export async function disconnectNOVAGoogle() {
  const value = config();
  const response = await request("/api/integrations/google/disconnect", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ organization_id: value.organizationId, client_slug: value.clientSlug }),
  });
  if (!response.ok) throw new Error("No fue posible desconectar Google mediante NOVA.");
}
