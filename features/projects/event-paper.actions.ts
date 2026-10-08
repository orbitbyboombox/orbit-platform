"use server";

import { revalidatePath } from "next/cache";
import { isAdministrativeRole } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type PaperVariant = "NORMAL_4X6" | "PRECUT_4X6";

export async function updateEventPaperVariantAction(input: { projectId: string; variant: PaperVariant }) {
  const client = await createSupabaseServerClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) throw new Error("Sesión requerida.");
  const { data: profile } = await client.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (!isAdministrativeRole(profile?.role)) throw new Error("Acceso administrativo requerido.");

  const admin = createAdminClient();
  const { data: snapshot, error: snapshotError } = await admin
    .from("event_paper_snapshots")
    .select("id,status")
    .eq("project_id", input.projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (snapshotError) throw snapshotError;
  if (!snapshot) throw new Error("Este evento todavía no tiene snapshot de papel.");
  if (["CONFIRMED", "OVERRIDDEN"].includes(String(snapshot.status))) throw new Error("El tipo de papel queda protegido después del cierre.");
  const { error } = await admin.from("event_paper_snapshots").update({ paper_variant: input.variant }).eq("id", snapshot.id);
  if (error) throw error;
  revalidatePath(`/projects/${input.projectId}`);
  revalidatePath("/staff-portal");
  return { ok: true as const };
}

export async function adminForceStaffPaperCloseoutAction(input: {
  projectId: string;
  assetAssignmentId: string;
  finalRemaining: number;
  reason: string;
}) {
  const client = await createSupabaseServerClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) throw new Error("Sesión requerida.");
  const { data: profile } = await client.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (!isAdministrativeRole(profile?.role)) throw new Error("Acceso administrativo requerido.");
  if (!Number.isInteger(input.finalRemaining) || input.finalRemaining < 0) throw new Error("El saldo final debe ser un entero no negativo.");
  const reason = input.reason.trim();
  if (reason.length < 3) throw new Error("El motivo del cierre administrativo es obligatorio.");
  const { data, error } = await client.rpc("admin_force_staff_event_paper_closeout", {
    p_project_id: input.projectId,
    p_asset_assignment_id: input.assetAssignmentId,
    p_final_remaining: input.finalRemaining,
    p_reason: reason,
    p_idempotency_key: `admin-paper-close:${input.projectId}:${input.assetAssignmentId}:${input.finalRemaining}`,
  });
  if (error) throw error;
  revalidatePath(`/projects/${input.projectId}`);
  revalidatePath("/resources/boxes");
  revalidatePath("/staff-portal");
  return { ok: true as const, data };
}

export async function loadAdminPaperCloseoutAction(assetAssignmentId: string) {
  const client = await createSupabaseServerClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) throw new Error("Sesión requerida.");
  const { data: profile } = await client.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (!isAdministrativeRole(profile?.role)) throw new Error("Acceso administrativo requerido.");
  const admin = createAdminClient();
  const { data: snapshot, error } = await admin.from("event_paper_snapshots")
    .select("id,project_id,asset_assignment_id,opening_balance,final_remaining_balance,event_usage,status,format_key,black_box_paper_format")
    .eq("asset_assignment_id", assetAssignmentId).maybeSingle();
  if (error) throw error;
  if (!snapshot) throw new Error("Este evento todavía no tiene snapshot de papel.");
  const { data: reloads, error: reloadError } = await admin.from("event_paper_reloads").select("quantity").eq("snapshot_id", snapshot.id);
  if (reloadError) throw reloadError;
  return {
    ok: true as const,
    snapshot: {
      ...snapshot,
      reloads: (reloads ?? []).reduce((total, row) => total + Number(row.quantity ?? 0), 0),
    },
  };
}


export type EventPhotoStyle = "COLOR" | "BLACK_WHITE" | "SEPIA";

export async function updateEventPrintInstructionsAction(input: {
  projectId: string;
  photoStyle: EventPhotoStyle | null;
  operatorNote: string;
}) {
  const client = await createSupabaseServerClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) throw new Error("Sesión requerida.");
  const { data: profile } = await client.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (!isAdministrativeRole(profile?.role)) throw new Error("Acceso administrativo requerido.");
  const styles = new Set(["COLOR", "BLACK_WHITE", "SEPIA"]);
  if (input.photoStyle && !styles.has(input.photoStyle)) throw new Error("Estilo de fotografía inválido.");
  const operatorNote = input.operatorNote.trim().slice(0, 500);
  const admin = createAdminClient();
  const { error } = await admin.from("project_operational_contracts").upsert({
    project_id: input.projectId,
    photo_style: input.photoStyle,
    operator_print_notes: operatorNote || null,
    updated_by: auth.user.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: "project_id" });
  if (error) throw error;
  revalidatePath(`/projects/${input.projectId}`);
  revalidatePath("/staff-portal");
  return { ok: true as const };
}
