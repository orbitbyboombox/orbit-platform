"use server";

import { createSupabaseServerActionClient } from "@/lib/supabase/server";
import { isAdministrativeRole } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { repairPendingDocumentBackups } from "../application/document-backup-repair.service";

export async function repairPendingDocumentBackupsAction(documentIds?: string[]) {
  const selectedIds = [...new Set((documentIds ?? []).map((id) => id.trim()).filter(Boolean))];
  if (!selectedIds.length) throw new Error("Selecciona explícitamente un ID de documento para reparar.");
  const sessionClient = await createSupabaseServerActionClient();
  const { data: auth, error: authError } = await sessionClient.auth.getUser();
  if (authError || !auth.user) throw authError ?? new Error("Sesión requerida.");
  const { data: profile, error: profileError } = await sessionClient.from("profiles").select("role").eq("id", auth.user.id).single();
  if (profileError) throw profileError;
  if (!isAdministrativeRole(profile?.role)) throw new Error("Solo Founder o Administración puede reparar respaldos documentales.");
  return repairPendingDocumentBackups({ client: createAdminClient(), documentIds: selectedIds });
}
