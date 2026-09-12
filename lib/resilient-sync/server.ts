import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const SYNC_ORGANIZATION_ID = "b00b0000-0000-4000-8000-000000000001";
export const SYNC_CLIENT_SLUG = "boombox";
const allowedRoles = new Set(["CEO", "ADMINISTRATOR", "SALES", "OPERATIONS"]);

function secret() {
  const value = process.env.ORBIT_SYNC_ADAPTER_SECRET?.trim();
  if (!value || value.length < 32) throw new Error("SYNC_ADAPTER_SECRET_REQUIRED");
  return value;
}

function clientToken() {
  const value = process.env.ORBIT_CONNECT_CLIENT_TOKEN?.trim();
  if (!value) throw new Error("SYNC_CLIENT_TOKEN_REQUIRED");
  return value;
}

function digest(timestamp: string, value: string) {
  return createHmac("sha256", secret()).update(`${timestamp}.${value}`).digest("hex");
}

export async function requireLocalSyncActor() {
  const db = await createSupabaseServerClient();
  const auth = await db.auth.getUser();
  if (!auth.data.user) throw new Error("SYNC_SESSION_REQUIRED");
  const profile = await db.from("profiles").select("role").eq("id", auth.data.user.id).maybeSingle();
  if (!profile.data || !allowedRoles.has(profile.data.role)) throw new Error("SYNC_FORBIDDEN");
  const session = await db.auth.getSession();
  const accessToken = session.data.session?.access_token;
  if (!accessToken) throw new Error("SYNC_SESSION_REQUIRED");
  const mappedRole = profile.data.role === "CEO" ? "founder" : profile.data.role === "ADMINISTRATOR" ? "admin" : profile.data.role === "SALES" ? "commercial" : "logistics";
  return { id: auth.data.user.id, role: mappedRole, accessToken };
}

function signedActorHeaders(actor: { id: string; role: string; accessToken: string }) {
  const timestamp = String(Date.now());
  const value = [SYNC_ORGANIZATION_ID, SYNC_CLIENT_SLUG, actor.id, actor.role].join(":");
  return { authorization: `Bearer ${clientToken()}`, "x-orbit-client-token": clientToken(), "x-orbit-actor-id": actor.id, "x-orbit-actor-role": actor.role, "x-orbit-actor-timestamp": timestamp, "x-orbit-actor-signature": digest(timestamp, value), "x-orbit-actor-token": actor.accessToken };
}

export async function forwardToCore(path: string, init: RequestInit, actor: { id: string; role: string; accessToken: string }) {
  return fetch(new URL(path, process.env.ORBIT_CONNECT_BASE_URL ?? "https://connect.orbitnova.cl"), { ...init, cache: "no-store", headers: { ...signedActorHeaders(actor), ...(init.headers ?? {}) } });
}

export function verifyAdapterRequest(timestamp: string, body: string, signature: string) {
  if (!/^\d{13}$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp)) > 5 * 60_000 || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = digest(timestamp, body);
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
}

export function syncEnabled() { return process.env.RESILIENT_SYNC_ENABLED === "true"; }
