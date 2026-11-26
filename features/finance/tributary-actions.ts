"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type DteType = "33" | "39" | "52" | "56" | "61";

async function requireAdmin() {
  const session = await createSupabaseServerClient();
  const { data: auth } = await session.auth.getUser();
  if (!auth.user) throw new Error("Sesión requerida.");
  const { data: profile } = await session.from("profiles").select("role").eq("id", auth.user.id).single();
  if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) throw new Error("Permiso administrativo requerido.");
  return { admin: createAdminClient(), actorId: auth.user.id };
}

export async function createTributaryDraftAction(input: { projectId: string; dteType: DteType; quotationId?: string; amount?: number }) {
  try {
    const { admin, actorId } = await requireAdmin();
    const { data: project, error } = await admin.from("projects").select("id,customer_id,orbit_event_id,customer_type").eq("id", input.projectId).is("deleted_at", null).single();
    if (error || !project) throw new Error("Evento no encontrado.");
    let amount = Number.isFinite(input.amount) && Number(input.amount) >= 0 ? Number(input.amount) : 0;
    if (input.quotationId) {
      const { data: quote } = await admin.from("quotations").select("id,grand_total,customer_id").eq("id", input.quotationId).maybeSingle();
      if (quote?.grand_total != null) amount = Number(quote.grand_total);
    }
    const key = `PRE-SII|${input.dteType}|${input.projectId}|${input.quotationId ?? "none"}`;
    const { data: existing } = await admin.from("invoices").select("id,status,invoice_number").eq("tributary_draft_key", key).is("deleted_at", null).maybeSingle();
    if (existing) return { ok: true as const, id: existing.id, duplicate: true, status: existing.status };
    const { data: row, error: insertError } = await admin.from("invoices").insert({
      invoice_number: `PRE-SII-${input.dteType}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      customer_id: project.customer_id, project_id: project.id, orbit_event_id: project.orbit_event_id,
      customer_type: project.customer_type, status: "DRAFT", payment_term: "CASH", currency: "CLP",
      amount, paid_amount: 0, version: 1, financial_record_state: "ACTIVE", record_origin: "PRE_SII",
      tributary_document_type: input.dteType, tributary_draft_key: key,
      tributary_snapshot: { source: "ORBIT", dteType: input.dteType, projectId: input.projectId, quotationId: input.quotationId ?? null, amount, mode: "SIMULATION" },
      created_by: actorId, updated_by: actorId
    }).select("id,status,invoice_number").single();
    if (insertError) throw insertError;
    revalidatePath("/finance/tributary");
    return { ok: true as const, id: row.id, duplicate: false, status: row.status };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "No fue posible crear el borrador." };
  }
}

export async function updateTributaryDraftAction(input: { draftId: string; amount: number; notes?: string; paymentTerm?: string; customTermDays?: number | null }) {
  try {
    const { admin, actorId } = await requireAdmin();
    const { data: draft } = await admin.from("invoices").select("id,status").eq("id", input.draftId).eq("record_origin", "PRE_SII").is("deleted_at", null).single();
    if (!draft || draft.status !== "DRAFT") throw new Error("El borrador no está editable.");
    const { error } = await admin.from("invoices").update({ amount: Math.max(0, Number(input.amount) || 0), notes: input.notes ?? null, payment_term: input.paymentTerm ?? "CASH", custom_term_days: input.customTermDays ?? null, updated_by: actorId }).eq("id", input.draftId);
    if (error) throw error;
    revalidatePath("/finance/tributary");
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "No fue posible actualizar el borrador." };
  }
}

export async function approveTributaryDraftAction(input: { draftId: string; reason?: string }) {
  try {
    const { admin, actorId } = await requireAdmin();
    const { data: draft } = await admin.from("invoices").select("id,status").eq("id", input.draftId).eq("record_origin", "PRE_SII").is("deleted_at", null).single();
    if (!draft || draft.status !== "DRAFT") throw new Error("Sólo se pueden aprobar borradores en estado DRAFT.");
    const { error } = await admin.from("invoices").update({ status: "PENDING", approved_by: actorId, approved_at: new Date().toISOString(), approval_reason: input.reason ?? "Aprobación interna PRE-SII", updated_by: actorId }).eq("id", input.draftId);
    if (error) throw error;
    revalidatePath("/finance/tributary");
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "No fue posible aprobar el borrador." };
  }
}

export async function retryTributaryDriveSyncAction(input: { syncId: string }) {
  try {
    const { admin } = await requireAdmin();
    const { data: row } = await admin.from("tributary_drive_sync_items").select("id,attempt_count").eq("id", input.syncId).single();
    if (!row) throw new Error("Sincronización no encontrada.");
    const { error } = await admin.from("tributary_drive_sync_items").update({ status: "RETRY", attempt_count: Number(row.attempt_count ?? 0) + 1, last_error: null, updated_at: new Date().toISOString() }).eq("id", input.syncId);
    if (error) throw error;
    revalidatePath("/finance/tributary");
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "No fue posible programar el reintento." };
  }
}
