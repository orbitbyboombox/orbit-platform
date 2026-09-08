"use server";
import { revalidatePath } from "next/cache";
import { isAdministrativeRole } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { derivePipelineStage, founderStageValidation, hasLegacyReservationEvidence, normalizeRelatedRows, validateStageTransition } from "./domain";
import { PIPELINE_STAGES, NEXT_ACTION_TYPES, type PipelineStage } from "./types";
export type SalesLeadActionResult = { ok: true } | { ok: false; code: "PRECONDITION_FAILED"; message: string };
export async function updateSalesLeadAction(input: { projectId: string; stage?: string; nextActionAt?: string | null; nextActionType?: string | null; lostReason?: string | null; lostNotes?: string | null }): Promise<SalesLeadActionResult> {
  const client = await createSupabaseServerClient(); const { data: auth } = await client.auth.getUser(); if (!auth.user) throw new Error("Sesión requerida.");
  const { data: profile } = await client.from("profiles").select("role").eq("id", auth.user.id).maybeSingle(); if (!isAdministrativeRole(profile?.role)) throw new Error("Acceso administrativo requerido.");
  if (input.stage && !PIPELINE_STAGES.includes(input.stage as PipelineStage)) throw new Error("Etapa no válida.");
  if (input.nextActionType && !NEXT_ACTION_TYPES.includes(input.nextActionType as never)) throw new Error("Tipo de acción no válido.");
  type Current = { pipeline_stage: string | null; operations: Record<string, unknown> | null; crm_reservations: { status: string }[] | { status: string } | null; crm_events: { status: string }[] | { status: string } | null; financial_event_records: { status: string }[] | { status: string } | null };
  let { data: current, error: readError } = await client.from("projects").select("pipeline_stage,operations,crm_reservations(status),crm_events(status),financial_event_records(status)").eq("id", input.projectId).is("deleted_at", null).single() as { data: Current | null; error: { code?: string; message?: string } | null };
  if (readError?.code === "42703" || readError?.code === "PGRST204") { const fallback = await client.from("projects").select("operations").eq("id", input.projectId).is("deleted_at", null).single(); current = { pipeline_stage: null, operations: (fallback.data?.operations ?? {}) as Record<string, unknown>, crm_reservations: null, crm_events: null, financial_event_records: null }; readError = fallback.error; }
  if (readError) throw readError;
  if (!current) throw new Error("Lead no encontrado.");
  const reservation = Array.isArray(current.crm_reservations) ? current.crm_reservations[0] : current.crm_reservations;
  const legacyReservationConfirmed = hasLegacyReservationEvidence({ commercialStage: typeof current.operations?.commercialStage === "string" ? current.operations.commercialStage : null, operationalStage: typeof current.operations?.stage === "string" ? current.operations.stage : null, eventStatuses: normalizeRelatedRows(current.crm_events), financialStatuses: normalizeRelatedRows(current.financial_event_records) });
  const reservationConfirmed = ["CONFIRMED", "BOOKED"].includes(String(reservation?.status).toUpperCase()) || legacyReservationConfirmed;
  const from = derivePipelineStage({ explicit: current.pipeline_stage, commercialStage: typeof current.operations?.commercialStage === "string" ? current.operations.commercialStage : null, reservationStatus: reservation?.status, legacyReservationConfirmed }); const to = (input.stage as PipelineStage | undefined) ?? from;
  const failure = validateStageTransition(from, to, { reservationConfirmed, lostReason: input.lostReason });
  const validation = founderStageValidation(failure, to, reservationConfirmed);
  if (!validation.ok && validation.code === "PRECONDITION_FAILED") return validation;
  if (failure) throw new Error(failure);
  const patch: Record<string, unknown> = { pipeline_stage: to, next_action_at: ["GANADO","PERDIDO","CANCELADO","PRUEBA","ARCHIVADO"].includes(to) ? null : input.nextActionAt || null, next_action_type: input.nextActionType || null, lost_reason: to === "PERDIDO" ? input.lostReason?.trim() : null, lost_notes: to === "PERDIDO" ? input.lostNotes?.trim() || null : null, follow_up_status: ["GANADO", "PERDIDO","CANCELADO","PRUEBA","ARCHIVADO"].includes(to) ? "CANCELLED" : input.nextActionAt ? "SCHEDULED" : "PAUSED", last_commercial_activity_at: new Date().toISOString(), updated_by: auth.user.id };
  let { error } = await client.from("projects").update(patch).eq("id", input.projectId).is("deleted_at", null);
  if (error?.code === "42703" || error?.code === "PGRST204") { const operations = { ...(current.operations ?? {}), pipelineStage: to, nextActionAt: input.nextActionAt || null, nextActionType: input.nextActionType || null, lostReason: to === "PERDIDO" ? input.lostReason?.trim() || null : null, followUpStatus: patch.follow_up_status }; error = (await client.from("projects").update({ operations }).eq("id", input.projectId).is("deleted_at", null)).error; }
  if (error) throw error; revalidatePath("/leads"); return { ok: true as const };
}
