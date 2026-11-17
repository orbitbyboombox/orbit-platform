import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GoogleWorkspaceConnection } from "@/features/connectors/google-workspace";
import { mapOperationalEventToCalendar, fingerprintCalendarOperationalInput } from "./google-calendar-live";
import type { CalendarOperationalEventInput } from "../types/google-calendar-live.types";
import type { GoogleCalendarApiProvider, GoogleCalendarRemoteEvent } from "../provider/google-calendar-live.provider";
import { fingerprintReviewedCalendarEvent, verifyApprovedRemoteEvent } from "./calendar-remote-review-policy";

export const RECONCILABLE_ORBIT_EVENT_IDS = new Set([
  "ORB-2026-162036", "ORB-2026-438017", "ORB-2027-919683",
]);

type SyncSnapshot = {
  id: string; orbit_event_id: string; project_id: string; status: string; updated_at: string;
  external_event_id: string | null; external_url: string | null;
  nova_external_event_id: string | null; nova_external_url: string | null; nova_calendar_id: string | null;
  current_payload_hash: string | null; current_event_revision: number | null;
  approved_remote_etag: string | null;
};

export async function acceptReviewedRemoteCalendarEvent(args: {
  client: SupabaseClient; provider: GoogleCalendarApiProvider; input: CalendarOperationalEventInput;
  actorId: string; expectedCalendarId: string;
}) {
  const { client, provider, input, actorId, expectedCalendarId } = args;
  const orbitEventId = input.orbitEventId;
  if (!orbitEventId || !RECONCILABLE_ORBIT_EVENT_IDS.has(orbitEventId)) throw new Error("Este ORBIT Event ID no está habilitado para reconciliación revisada.");
  if (!provider.calendarId || provider.calendarId !== expectedCalendarId) throw new Error("El calendario autenticado no coincide con el destino persistido; no se moverá ni recreará el evento.");
  const { data: rows, error } = await client.from("calendar_sync").select("id,orbit_event_id,project_id,status,updated_at,external_event_id,external_url,nova_external_event_id,nova_external_url,nova_calendar_id,current_payload_hash,current_event_revision,approved_remote_etag").eq("orbit_event_id", orbitEventId).limit(2);
  if (error) throw error;
  if (!rows || rows.length !== 1) throw new Error(`Se esperaba una vinculación única para ${orbitEventId}; filas encontradas: ${rows?.length ?? 0}.`);
  const row = rows[0] as SyncSnapshot;
  const eventId = row.nova_external_event_id ?? row.external_event_id;
  const remoteUrl = row.nova_external_url ?? row.external_url;
  if (!eventId || row.nova_calendar_id !== expectedCalendarId) throw new Error("La vinculación activa no persiste el calendario de destino esperado; se detuvo sin crear ni mover eventos.");
  if (row.status !== "UPDATE_REQUIRED" && !(row.status === "SYNCHRONIZED" && row.approved_remote_etag)) throw new Error(`La reconciliación requiere UPDATE_REQUIRED o la aceptación previa de esta misma operación; estado actual: ${row.status}.`);

  const duplicates = await provider.findEventsByOrbitEventId(orbitEventId);
  if (duplicates.length !== 1 || duplicates[0]?.id !== eventId) throw new Error(`La revisión detectó ${duplicates.length} eventos activos con ${orbitEventId} en el calendario de destino; no se aceptó ni recreó ninguno.`);

  const remote = await provider.getEvent(eventId);
  const expectedPayload = mapOperationalEventToCalendar(input);
  const remoteReview = verifyApprovedRemoteEvent(input, expectedPayload, remote);
  const verified = { ...remoteReview, sourceHash: fingerprintCalendarOperationalInput(input) };
  const snapshot = {
    id: remote.id, calendarId: expectedCalendarId, etag: remote.etag, updated: remote.updated,
    status: remote.status, summary: remote.summary ?? "", description: remote.description ?? "",
    location: remote.location ?? "", start: remote.start, end: remote.end,
    sourceHash: verified.sourceHash, remoteHash: verified.remoteHash,
  };
  const { data: result, error: rpcError } = await client.rpc("accept_approved_calendar_remote_state", {
    p_sync_id: row.id, p_orbit_event_id: orbitEventId, p_expected_updated_at: row.updated_at,
    p_expected_current_hash: row.current_payload_hash, p_source_hash: verified.sourceHash,
    p_remote_hash: verified.remoteHash, p_remote_etag: remote.etag, p_remote_updated_at: remote.updated,
    p_remote_snapshot: snapshot, p_event_revision: row.current_event_revision ?? 0, p_actor_id: actorId,
  });
  if (rpcError) throw rpcError;
  const readback = await provider.getEvent(eventId);
  if (readback.etag !== remote.etag || fingerprintReviewedCalendarEvent(input, readback) !== verified.remoteHash) {
    const { error: conflictError } = await client.rpc("flag_calendar_remote_reconciliation_conflict", {
      p_sync_id: row.id, p_orbit_event_id: orbitEventId, p_accepted_etag: remote.etag,
      p_observed_etag: readback.etag ?? "MISSING", p_observed_snapshot: {
        id: readback.id, calendarId: expectedCalendarId, etag: readback.etag ?? null,
        updated: readback.updated ?? null, summary: readback.summary ?? "",
        description: readback.description ?? "", start: readback.start, end: readback.end,
      }, p_actor_id: actorId,
    });
    if (conflictError) throw conflictError;
    throw new Error("Google Calendar cambió durante la aceptación. Se conservó la versión remota y ORBIT volvió a UPDATE_REQUIRED.");
  }
  return { result: result as string, orbitEventId, googleEventId: eventId, googleEventUrl: remoteUrl, etag: remote.etag, sourceHash: verified.sourceHash, remoteHash: verified.remoteHash, start: verified.start, end: verified.end };
}

