"use server";
import {revalidatePath} from "next/cache";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import {synchronizeConfirmedReservationCalendar} from "./google-calendar-sync.service";
import {usesNOVAGoogleCore} from "@/features/connectors/google-workspace/application/google-nova-core";
import type {GoogleCalendarSyncOperation} from "../types/google-calendar-live.types";
import {syncStaleGoogleCalendarEvents} from "./google-calendar-resync.service";
import { prepareConfirmedReservationCalendar } from "./google-calendar-sync.service";
import { acceptReviewedRemoteCalendarEvent, updateCanonicalCalendarEvent } from "./google-calendar-remote-reconciliation";
import { GoogleCalendarApiProvider } from "../provider/google-calendar-live.provider";
import { loadGoogleWorkspaceAccessToken, loadGoogleWorkspaceCalendarId, loadGoogleWorkspaceConnection } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import { mapOperationalEventToCalendar } from "./google-calendar-live";
import { chileDateTime } from "@/features/operations/event-operational-window";

type Result={ok:true;operation:string}|{ok:false;error:string};
export type CalendarReconciliationSummary={audited:number;matched:number;updated:number;failed:number;duplicates:number;missingRemote:number;created:number;mappingsBackfilled:number;remoteAccepted:number};

export async function updateCanonicalGoogleCalendarAction(projectId: string): Promise<Result> {
  try {
    const client = await createSupabaseServerClient();
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) throw authError ?? new Error("Inicia sesión para actualizar Calendar.");
    const { data: profile, error: profileError } = await client.from("profiles").select("role").eq("id", auth.user.id).single();
    if (profileError) throw profileError;
    if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) throw new Error("Solo Founder/Admin puede actualizar Calendar desde ORBIT.");
    const prepared = await prepareConfirmedReservationCalendar(client, projectId);
    const connection = await loadGoogleWorkspaceConnection();
    if (connection.connectionStatus !== "CONNECTED" || connection.health !== "HEALTHY" || !connection.grantedServices.some(({ id, granted }) => id === "CALENDAR" && granted)) throw new Error("La conexión autenticada de Google Calendar no está disponible.");
    const calendarId = await loadGoogleWorkspaceCalendarId();
    const provider = new GoogleCalendarApiProvider(await loadGoogleWorkspaceAccessToken(), calendarId);
    const updated = await updateCanonicalCalendarEvent({ client, provider, input: prepared.calendarInput, actorId: auth.user.id, expectedCalendarId: calendarId });
    await client.from("timeline_events").insert({
      project_id: prepared.project.id, event_type: "CALENDAR_CANONICAL_UPDATED", title: "Google Calendar actualizado desde ORBIT",
      description: "Se aplicó el estado operativo canónico de ORBIT al evento remoto existente mediante ETag.", orbit_event_id: prepared.project.orbit_event_id,
      actor_id: auth.user.id, actor_label: "Founder / Administración", source: "Google Calendar", action: "CALENDAR_CANONICAL_UPDATED",
      entity_type: "CalendarSync", entity_id: updated.googleEventId, human_message: "Calendar coincide con ORBIT tras lectura posterior.",
      correlation_id: `calendar-canonical:${prepared.project.orbit_event_id}:${updated.etag}`, created_by: auth.user.id,
    });
    revalidatePath(`/projects/${projectId}`); revalidatePath("/calendar"); revalidatePath("/operations");
    return { ok: true, operation: updated.result };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No fue posible actualizar Calendar desde ORBIT." };
  }
}
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
export async function synchronizeProjectCalendarAction(projectId:string,operation:GoogleCalendarSyncOperation="UPSERT"):Promise<Result>{try{const client=await createSupabaseServerClient();const{data:auth,error:authError}=await client.auth.getUser();if(authError||!auth.user)throw authError??new Error("Inicia sesión para sincronizar el calendario.");if(operation==="UPSERT"){const{data:sync,error:syncError}=await client.from("calendar_sync").select("status").eq("project_id",projectId).maybeSingle();if(syncError)throw syncError;if(sync?.status==="UPDATE_REQUIRED"){const prepared=await prepareConfirmedReservationCalendar(client,projectId);const connection=await loadGoogleWorkspaceConnection();if(connection.connectionStatus!=="CONNECTED"||connection.health!=="HEALTHY"||!connection.grantedServices.some(({id,granted})=>id==="CALENDAR"&&granted))throw new Error("La conexión autenticada de Google Calendar no está disponible.");const calendarId=await loadGoogleWorkspaceCalendarId();const updated=await updateCanonicalCalendarEvent({client,provider:new GoogleCalendarApiProvider(await loadGoogleWorkspaceAccessToken(),calendarId),input:prepared.calendarInput,actorId:auth.user.id,expectedCalendarId:calendarId});revalidatePath(`/projects/${projectId}`);revalidatePath("/calendar");return{ok:true,operation:updated.result};}}const result=await synchronizeConfirmedReservationCalendar({client,projectId,actorId:auth.user.id,operation,policy:"NEW"});if(!result)throw new Error("No existe un evento de Calendar para esta reserva.");revalidatePath(`/projects/${projectId}`);return{ok:true,operation:result.operation};}catch(error){return{ok:false,error:error instanceof Error?error.message:"No fue posible sincronizar Google Calendar."}}}

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
  const summary: CalendarReconciliationSummary = { audited: 0, matched: 0, updated: 0, failed: 0, duplicates: 0, missingRemote: 0, created: 0, mappingsBackfilled: 0, remoteAccepted: 0 };
  try {
    const client = await createSupabaseServerClient();
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) throw authError ?? new Error("Inicia sesión para reconciliar Calendar.");
    const { data: profile, error: profileError } = await client.from("profiles").select("role").eq("id", auth.user.id).single();
    if (profileError) throw profileError;
    if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) throw new Error("Solo Founder/Admin puede reconciliar Calendar.");
    const connection = await loadGoogleWorkspaceConnection();
    if (connection.connectionStatus !== "CONNECTED" || connection.health !== "HEALTHY" || !connection.grantedServices.some(({ id, granted }) => id === "CALENDAR" && granted)) throw new Error("La conexión autenticada de Google Calendar no está disponible.");
    const calendarId = await loadGoogleWorkspaceCalendarId();
    const provider = new GoogleCalendarApiProvider(await loadGoogleWorkspaceAccessToken(), calendarId);
    const todayChile = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
    const { data: rows, error } = await client.from("projects").select("id,event_date,status,calendar_sync!inner(id,project_id,orbit_event_id,status,updated_at,external_event_id,nova_external_event_id,nova_calendar_id)").is("deleted_at", null).gte("event_date", todayChile);
    if (error) throw error;
    const candidates = (rows ?? []).filter((row) => {
      const sync = Array.isArray(row.calendar_sync) ? row.calendar_sync[0] : row.calendar_sync;
      return !["CANCELLED", "CANCELED", "CANCELADO", "CANCELADA", "ARCHIVED", "DELETED"].includes(String(row.status ?? "").toUpperCase())
        && Boolean(usesNOVAGoogleCore() ? sync?.nova_external_event_id : sync?.external_event_id);
    });
    summary.audited = candidates.length;
    for (const row of candidates) {
      try {
        const sync = Array.isArray(row.calendar_sync) ? row.calendar_sync[0] : row.calendar_sync;
        const orbitEventId = String(sync?.orbit_event_id ?? "");
        const linkedEventId = String(usesNOVAGoogleCore() ? sync?.nova_external_event_id ?? "" : sync?.external_event_id ?? "");
        const duplicateMatches = await provider.findEventsByOrbitEventId(orbitEventId);
        if (duplicateMatches.length !== 1 || duplicateMatches[0]?.id !== linkedEventId) {
          if (duplicateMatches.length > 1) summary.duplicates++;
          else summary.missingRemote++;
          throw new Error(`El vínculo ${orbitEventId} apunta a ${linkedEventId || "ningún ID"}, pero Calendar encontró ${duplicateMatches.length} coincidencias activas; no se modificó ni creó un evento.`);
        }
        if (usesNOVAGoogleCore() && sync?.nova_external_event_id && !sync.nova_calendar_id) {
          const eventId = String(sync.nova_external_event_id);
          const prepared = await prepareConfirmedReservationCalendar(client, row.id);
          const matches = await provider.findEventsByOrbitEventId(orbitEventId);
          if (matches.length !== 1) {
            if (matches.length > 1) summary.duplicates++;
            else summary.missingRemote++;
            throw new Error(`El vínculo sin calendario tiene ${matches.length} eventos remotos para ${orbitEventId}; no se asignó destino.`);
          }
          const remote = await provider.getEvent(eventId);
          const payload = mapOperationalEventToCalendar(prepared.calendarInput);
          const remoteStart = remote.start?.dateTime ? chileDateTime(remote.start.dateTime) : null;
          const remoteEnd = remote.end?.dateTime ? chileDateTime(remote.end.dateTime) : null;
          const allowedStarts = new Set([
            `${prepared.calendarInput.calendarStartDate}T${prepared.calendarInput.calendarStartTime}`,
            `${prepared.calendarInput.serviceStartDate}T${prepared.calendarInput.serviceStart}`,
          ]);
          const exactIdLine = remote.description?.split("\n").some((line) => line.trim() === `ORBIT Event ID: ${orbitEventId}`);
          if (matches[0]?.id !== eventId || !remote.etag || !remote.updated || remote.status !== "confirmed"
            || remote.summary !== payload.title || !exactIdLine || !remoteStart || !allowedStarts.has(`${remoteStart.date}T${remoteStart.time}`)
            || !remoteEnd || `${remoteEnd.date}T${remoteEnd.time}` !== `${prepared.calendarInput.serviceEndDate ?? prepared.calendarInput.eventDate}T${prepared.calendarInput.serviceEnd}`
            || Boolean(remote.location && payload.location && remote.location !== payload.location)) {
            throw new Error(`El evento ${orbitEventId} no coincide con la identidad y ventana de servicio canónicas; no se persistió calendario.`);
          }
          const { data: backfilled, error: mappingError } = await client.from("calendar_sync")
            .update({ nova_calendar_id: calendarId, updated_at: new Date().toISOString() })
            .eq("id", sync.id).eq("nova_external_event_id", eventId).is("nova_calendar_id", null).eq("updated_at", sync.updated_at)
            .select("id,updated_at").maybeSingle();
          if (mappingError) throw mappingError;
          if (!backfilled) throw new Error(`La vinculación de ${orbitEventId} cambió durante la validación; se detuvo por concurrencia.`);
          const readback = await provider.getEvent(eventId);
          if (readback.etag !== remote.etag || readback.updated !== remote.updated) {
            await client.from("calendar_sync").update({ nova_calendar_id: null }).eq("id", sync.id).eq("nova_calendar_id", calendarId).eq("updated_at", backfilled.updated_at);
            throw new Error(`Calendar cambió durante la validación del destino de ${orbitEventId}; se revirtió el vínculo.`);
          }
          const { error: auditError } = await client.from("timeline_events").insert({
            project_id: row.id, orbit_event_id: orbitEventId, event_type: "CALENDAR_DESTINATION_VERIFIED",
            title: "Destino de Google Calendar verificado", description: "Se confirmó el calendario de destino mediante el ID activo, el ORBIT Event ID, título, horarios, ETag y lectura posterior; no se modificó Google Calendar.",
            actor_id: auth.user.id, actor_label: "Founder / Administración", source: "Google Calendar",
            action: "CALENDAR_DESTINATION_VERIFIED", entity_type: "CalendarSync", entity_id: eventId,
            human_message: "Destino activo vinculado tras verificar el evento remoto existente.",
            correlation_id: `calendar-destination:${orbitEventId}:${remote.etag}`, created_by: auth.user.id,
          });
          if (auditError) {
            await client.from("calendar_sync").update({ nova_calendar_id: null }).eq("id", sync.id).eq("nova_calendar_id", calendarId).eq("updated_at", backfilled.updated_at);
            throw auditError;
          }
          summary.mappingsBackfilled++;
        }
        // UPDATE_REQUIRED is always resolved from ORBIT's canonical state. The
        // legacy remote-acceptance path is intentionally not used here because
        // it would acknowledge Calendar's stale values instead of correcting
        // them with the ETag-protected canonical update.
        const expectedEventId = String(usesNOVAGoogleCore() ? sync?.nova_external_event_id ?? "" : sync?.external_event_id ?? "");
        const { data: verifiedMapping, error: mappingReadError } = await client.from("calendar_sync")
          .select("orbit_event_id,external_event_id,nova_external_event_id,nova_calendar_id")
          .eq("id", sync.id).maybeSingle();
        if (mappingReadError) throw mappingReadError;
        const actualEventId = String(usesNOVAGoogleCore() ? verifiedMapping?.nova_external_event_id ?? "" : verifiedMapping?.external_event_id ?? "");
        if (!expectedEventId || actualEventId !== expectedEventId || verifiedMapping?.orbit_event_id !== orbitEventId
          || (usesNOVAGoogleCore() && verifiedMapping?.nova_calendar_id !== calendarId)) {
          throw new Error(`El ID o calendario persistido de ${orbitEventId} cambió o no coincide; no se actualizará Google Calendar.`);
        }
        const canonicalResult = sync?.status === "UPDATE_REQUIRED"
          ? await updateCanonicalCalendarEvent({ client, provider, input: (await prepareConfirmedReservationCalendar(client, row.id)).calendarInput, actorId: auth.user.id, expectedCalendarId: calendarId })
          : await synchronizeConfirmedReservationCalendar({ client, projectId: row.id, actorId: auth.user.id, policy: "EXISTING_LEGACY_UPDATE" });
        if (!canonicalResult) { summary.missingRemote++; continue; }
        const result = "operation" in canonicalResult ? canonicalResult : { operation: "UPDATED" as const, googleEventId: canonicalResult.googleEventId };
        if (result.operation === "CREATED") {
          summary.created++;
          throw new Error(`La sincronización creó un evento nuevo para ${orbitEventId}; el ID original se debe conservar.`);
        }
        if (result.googleEventId !== expectedEventId) {
          throw new Error(`La sincronización no reutilizó el ID existente de ${orbitEventId}; se detuvo la reconciliación.`);
        }
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
