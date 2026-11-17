"use server";
import {revalidatePath} from "next/cache";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import {synchronizeConfirmedReservationCalendar} from "./google-calendar-sync.service";
import {usesNOVAGoogleCore} from "@/features/connectors/google-workspace/application/google-nova-core";
import type {GoogleCalendarSyncOperation} from "../types/google-calendar-live.types";
import {syncStaleGoogleCalendarEvents} from "./google-calendar-resync.service";
import { prepareConfirmedReservationCalendar } from "./google-calendar-sync.service";
import { acceptReviewedRemoteCalendarEvent, RECONCILABLE_ORBIT_EVENT_IDS } from "./google-calendar-remote-reconciliation";
import { GoogleCalendarApiProvider } from "../provider/google-calendar-live.provider";
import { loadGoogleWorkspaceAccessToken, loadGoogleWorkspaceCalendarId, loadGoogleWorkspaceConnection } from "@/features/connectors/google-workspace/application/google-workspace.repository";

type Result={ok:true;operation:string}|{ok:false;error:string};
export type CalendarReconciliationSummary={audited:number;matched:number;updated:number;failed:number;duplicates:number;missingRemote:number;created:number};
export async function acceptReviewedRemoteCalendarStateAction(projectId: string): Promise<Result> {
  try {
    const client = await createSupabaseServerClient();
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) throw authError ?? new Error("Inicia sesión para reconciliar Calendar.");
    const { data: profile, error: profileError } = await client.from("profiles").select("role").eq("id", auth.user.id).single();
    if (profileError) throw profileError;
    if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) throw new Error("Solo Founder/Admin puede aceptar una revisión remota.");
    const prepared = await prepareConfirmedReservationCalendar(client, projectId);
    const orbitEventId = prepared.project.orbit_event_id;
    if (!RECONCILABLE_ORBIT_EVENT_IDS.has(orbitEventId)) throw new Error("Este evento no está habilitado para la reconciliación solicitada.");
    // This action only acknowledges an already-linked, explicitly approved remote event.
    // It does not create or modify Calendar, so commercial reservation/contract eligibility
    // must not block the narrowly allowlisted reconciliation.
    if (!prepared.existing) throw new Error("No existe una vinculación Calendar activa para aceptar el estado remoto.");
    const connection = await loadGoogleWorkspaceConnection();
    if (connection.connectionStatus !== "CONNECTED" || connection.health !== "HEALTHY" || !connection.grantedServices.some(({ id, granted }) => id === "CALENDAR" && granted)) throw new Error("La conexión autenticada de Google Calendar no está disponible.");
    const calendarId = await loadGoogleWorkspaceCalendarId();
    const provider = new GoogleCalendarApiProvider(await loadGoogleWorkspaceAccessToken(), calendarId);
    const accepted = await acceptReviewedRemoteCalendarEvent({ client, provider, input: prepared.calendarInput, actorId: auth.user.id, expectedCalendarId: calendarId });
    if (accepted.result === "ACCEPTED") {
      const { error: timelineError } = await client.from("timeline_events").insert({
        project_id: prepared.project.id, event_type: "CALENDAR_REMOTE_RECONCILED",
        title: "Google Calendar reconciliado", description: "Se aceptó la versión remota verificada sin modificar el evento de Google Calendar.",
        orbit_event_id: orbitEventId, actor_id: auth.user.id, actor_label: "Founder / Administración", source: "Google Calendar",
        action: "CALENDAR_REMOTE_RECONCILED", entity_type: "CalendarSync", entity_id: accepted.googleEventId,
        human_message: "Google Calendar reconciliado con ETag y hash calculado por ORBIT.",
        correlation_id: `calendar-reconciliation:${orbitEventId}:${accepted.etag}`, created_by: auth.user.id,
      });
      if (timelineError) console.error("[calendar-reconciliation] audit timeline insert failed", { orbitEventId, message: timelineError.message });
    }
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/calendar");
    return { ok: true, operation: accepted.result };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No fue posible reconciliar el evento remoto." };
  }
}
export async function synchronizeProjectCalendarAction(projectId:string,operation:GoogleCalendarSyncOperation="UPSERT"):Promise<Result>{try{const client=await createSupabaseServerClient();const{data:auth,error:authError}=await client.auth.getUser();if(authError||!auth.user)throw authError??new Error("Inicia sesión para sincronizar el calendario.");const result=await synchronizeConfirmedReservationCalendar({client,projectId,actorId:auth.user.id,operation,policy:"NEW"});if(!result)throw new Error("No existe un evento de Calendar para esta reserva.");revalidatePath(`/projects/${projectId}`);return{ok:true,operation:result.operation};}catch(error){return{ok:false,error:error instanceof Error?error.message:"No fue posible sincronizar Google Calendar."}}}

export async function retryCalendarSyncAction(projectId: string): Promise<Result> {
  try {
    const client = await createSupabaseServerClient();
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) throw new Error("Inicia sesión para reintentar Calendar.");
    const { data: profile } = await client.from("profiles").select("role").eq("id", auth.user.id).single();
    if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) throw new Error("Solo Founder/Admin puede reintentar Calendar.");
    const { data: sync } = await client.from("calendar_sync").select("status,external_event_id,nova_external_event_id").eq("project_id", projectId).maybeSingle();
    if (!sync || (!sync.external_event_id && !sync.nova_external_event_id)) throw new Error("No existe un evento remoto para actualizar.");
    if (!["STALE", "PENDING", "FAILED"].includes(sync.status)) throw new Error("El evento no tiene cambios pendientes.");
    const result = await syncStaleGoogleCalendarEvents({ client, actorId: auth.user.id, batchSize: 1 });
    revalidatePath(`/projects/${projectId}`); revalidatePath("/calendar");
    return result.synchronized ? { ok: true, operation: "UPDATED" } : { ok: false, error: "Calendar no pudo completar el reintento." };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "No fue posible reintentar Calendar." }; }
}

/** Founder/Admin-only reconciliation of future mappings. Existing remote IDs are mandatory: this action is UPDATE-only. */
export async function reconcileFutureGoogleCalendarAction(): Promise<CalendarReconciliationSummary | {ok:false;error:string}> {
  const summary: CalendarReconciliationSummary = { audited: 0, matched: 0, updated: 0, failed: 0, duplicates: 0, missingRemote: 0, created: 0 };
  try {
    const client = await createSupabaseServerClient();
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) throw authError ?? new Error("Inicia sesión para reconciliar Calendar.");
    const { data: profile, error: profileError } = await client.from("profiles").select("role").eq("id", auth.user.id).single();
    if (profileError) throw profileError;
    if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) throw new Error("Solo Founder/Admin puede reconciliar Calendar.");
    const { data: rows, error } = await client.from("projects").select("id,calendar_sync!inner(project_id,orbit_event_id,external_event_id,nova_external_event_id)").is("deleted_at", null).gte("event_date", new Date().toISOString().slice(0, 10));
    if (error) throw error;
    const candidates = (rows ?? []).filter((row) => { const sync = Array.isArray(row.calendar_sync) ? row.calendar_sync[0] : row.calendar_sync; return Boolean(usesNOVAGoogleCore() ? sync?.nova_external_event_id : sync?.external_event_id); });
    summary.audited = candidates.length;
    for (const row of candidates) {
      try {
        const result = await synchronizeConfirmedReservationCalendar({ client, projectId: row.id, actorId: auth.user.id, policy: "EXISTING_LEGACY_UPDATE" });
        if (!result) { summary.missingRemote++; continue; }
        if (result.operation === "UPDATED") summary.updated++; else summary.matched++;
      } catch (error) {
        summary.failed++;
        console.error("[calendar-reconciliation] failed", { projectId: row.id, error: error instanceof Error ? error.message : String(error) });
      }
    }
    revalidatePath("/calendar"); revalidatePath("/operations");
    return summary;
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "No fue posible reconciliar Google Calendar." }; }
}
