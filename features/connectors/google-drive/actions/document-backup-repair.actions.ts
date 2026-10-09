"use server";

import { createSupabaseServerActionClient } from "@/lib/supabase/server";
import { isAdministrativeRole } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { repairPendingDocumentBackups } from "../application/document-backup-repair.service";

export async function repairPendingDocumentBackupsAction(documentIds?: string[]) {
  const sessionClient = await createSupabaseServerActionClient();
  const { data: auth, error: authError } = await sessionClient.auth.getUser();
  if (authError || !auth.user) throw authError ?? new Error("Sesión requerida.");
  const { data: profile, error: profileError } = await sessionClient.from("profiles").select("role").eq("id", auth.user.id).single();
  if (profileError) throw profileError;
  if (!isAdministrativeRole(profile?.role)) throw new Error("Solo Founder o Administración puede reparar respaldos documentales.");
  return repairPendingDocumentBackups({ client: createAdminClient(), documentIds });
}
