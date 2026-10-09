"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerActionClient } from "@/lib/supabase/server";
import { isAdministrativeRole } from "@/lib/auth/roles";

type Result = { ok: true } | { ok: false; error: string };

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "No fue posible sincronizar el seguimiento.";
}

async function loadAdministrativeContext() {
  const client = await createSupabaseServerActionClient();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) throw authError ?? new Error("Sesión requerida.");
  const { data: profile, error: profileError } = await client.from("profiles").select("role").eq("id", auth.user.id).single();
  if (profileError) throw profileError;
  if (!isAdministrativeRole(profile?.role)) throw new Error("Solo Founder o Administración puede marcar cuentas para cobrar.");
  return { client, userId: auth.user.id };
}

export async function loadReceivableFollowUpsAction(): Promise<{ ok: true; projectIds: string[] } | { ok: false; error: string }> {
  try {
    const { client } = await loadAdministrativeContext();
    const { data, error } = await client.from("accounts_receivable_follow_ups").select("project_id").order("project_id");
    if (error) throw error;
    return { ok: true, projectIds: (data ?? []).map((row) => String(row.project_id)) };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function reconcileReceivableFollowUpsAction(projectIds: string[]): Promise<Result> {
  try {
    const { client, userId } = await loadAdministrativeContext();
    const uniqueProjectIds = [...new Set(projectIds.map((id) => id.trim()).filter(Boolean))];
    if (!uniqueProjectIds.length) return { ok: true };
    const now = new Date().toISOString();
    const { error } = await client.from("accounts_receivable_follow_ups").upsert(uniqueProjectIds.map((projectId) => ({ project_id: projectId, marked_by: userId, marked_at: now, updated_at: now })), { onConflict: "project_id" });
    if (error) throw error;
    revalidatePath("/finance/receivables");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function setReceivableFollowUpAction(projectId: string, marked: boolean): Promise<Result> {
  try {
    const normalizedProjectId = projectId.trim();
    if (!normalizedProjectId) throw new Error("Evento inválido.");
    const { client, userId } = await loadAdministrativeContext();
    const now = new Date().toISOString();
    const result = marked
      ? await client.from("accounts_receivable_follow_ups").upsert({ project_id: normalizedProjectId, marked_by: userId, marked_at: now, updated_at: now }, { onConflict: "project_id" })
      : await client.from("accounts_receivable_follow_ups").delete().eq("project_id", normalizedProjectId);
    if (result.error) throw result.error;
    revalidatePath("/finance/receivables");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

