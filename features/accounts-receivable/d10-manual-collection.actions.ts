"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerActionClient } from "@/lib/supabase/server";
import { isAdministrativeRole } from "@/lib/auth/roles";

export async function setD10CollectionDateAction(formData: FormData) {
  const client = await createSupabaseServerActionClient();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) throw authError ?? new Error("Sesión requerida.");
  const { data: profile, error: profileError } = await client.from("profiles").select("role").eq("id", auth.user.id).single();
  if (profileError) throw profileError;
  if (!isAdministrativeRole(profile?.role)) throw new Error("Solo Founder o Administración puede reprogramar D-10.");
  const projectId = String(formData.get("projectId") ?? "").trim();
  const scheduledFor = String(formData.get("scheduledFor") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500) || "Reprogramación manual D-10";
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(scheduledFor)) throw new Error("La fecha D-10 no es válida.");
  if (!projectId) throw new Error("El evento D-10 no es válido.");
  const { error } = await client.from("d10_manual_collection_schedules").upsert({
    project_id: projectId, scheduled_for: scheduledFor, reason, updated_by: auth.user.id,
    created_by: auth.user.id, updated_at: new Date().toISOString(),
  }, { onConflict: "project_id" });
  if (error) throw error;
  revalidatePath("/finance/collections");
  revalidatePath("/notifications");
  return { ok: true, scheduledFor };
}
