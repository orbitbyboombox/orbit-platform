"use server";
import {revalidatePath} from "next/cache";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import {synchronizeConfirmedReservationCalendar} from "./google-calendar-sync.service";
import {usesNOVAGoogleCore} from "@/features/connectors/google-workspace/application/google-nova-core";
import type {GoogleCalendarSyncOperation} from "../types/google-calendar-live.types";
import {syncStaleGoogleCalendarEvents} from "./google-calendar-resync.service";

type Result={ok:true;operation:string}|{ok:false;error:string};
export type CalendarReconciliationSummary={audited:number;matched:number;updated:number;failed:number;duplicates:number;missingRemote:number;created:number};
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
