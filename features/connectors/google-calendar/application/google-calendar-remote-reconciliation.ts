import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CalendarOperationalEventInput } from "../types/google-calendar-live.types";
import type { GoogleCalendarApiProvider } from "../provider/google-calendar-live.provider";
import { fingerprintReviewedCalendarEvent, verifyApprovedRemoteEvent } from "./calendar-remote-review-policy";
import { mapOperationalEventToCalendar, fingerprintCalendarOperationalInput } from "./google-calendar-live";

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

/**
 * Founder/Admin-only canonical write.  ORBIT is the source of truth here:
 * read the current remote ETag, PATCH the existing event, read it back, then
 * persist the verified snapshot transactionally.  No create/delete fallback is
 * allowed.
 */
export async function updateCanonicalCalendarEvent(args: {
  client: SupabaseClient;
  provider: GoogleCalendarApiProvider;
  input: CalendarOperationalEventInput;
  actorId: string;
  expectedCalendarId: string;
}) {
  const { client, provider, input, actorId, expectedCalendarId } = args;
  const orbitEventId = input.orbitEventId;
  if (!orbitEventId) throw new Error("El evento no tiene ORBIT Event ID.");
  if (!provider.calendarId || provider.calendarId !== expectedCalendarId) throw new Error("El calendario autenticado no coincide con el destino persistido.");
  const { data: rows, error } = await client.from("calendar_sync")
    .select("id,orbit_event_id,project_id,status,updated_at,nova_external_event_id,external_event_id,nova_external_url,external_url,nova_calendar_id,current_payload_hash,current_event_revision")
    .eq("orbit_event_id", orbitEventId).limit(2);
  if (error) throw error;
  if (!rows || rows.length !== 1) throw new Error(`Se esperaba una vinculación única para ${orbitEventId}.`);
  const row = rows[0] as SyncSnapshot;
  const eventId = row.nova_external_event_id ?? row.external_event_id;
  const remoteUrl = row.nova_external_url ?? row.external_url;
  if (!eventId || row.nova_calendar_id !== expectedCalendarId) throw new Error(`El destino persistido de ${orbitEventId} no está verificado.`);
  const matches = await provider.findEventsByOrbitEventId(orbitEventId);
  if (matches.length !== 1 || matches[0]?.id !== eventId) throw new Error(`La identidad de ${orbitEventId} encontró ${matches.length} eventos activos; no se actualizó Calendar.`);

  const before = await provider.getEvent(eventId);
  if (before.status !== "confirmed" || !before.etag || !before.updated) throw new Error(`El evento remoto de ${orbitEventId} no tiene estado/ETag verificable.`);
  const expectedPayload = mapOperationalEventToCalendar(input);
  const sourceHash = fingerprintCalendarOperationalInput(input);
  // A canonical write is idempotent: if the remote event already matches ORBIT,
  // persist its verified ETag/snapshot without forcing a no-op PATCH. Google can
  // legitimately return the same ETag for that no-op, which is not a failure.
  let after = before;
  let reference = { googleEventId: before.id, googleEventUrl: before.htmlLink, updatedAt: before.updated! };
  let verified;
  try {
    verified = verifyApprovedRemoteEvent(input, expectedPayload, before);
  } catch {
    const patchedReference = await provider.updateEvent(eventId, expectedPayload, before.etag);
    reference = { ...patchedReference, updatedAt: patchedReference.updatedAt ?? before.updated! };
    after = await provider.getEvent(eventId);
    verified = verifyApprovedRemoteEvent(input, expectedPayload, after);
    if (after.id !== eventId || after.etag === before.etag || after.updated === before.updated) throw new Error(`Calendar no confirmó una nueva versión para ${orbitEventId}.`);
  }
  const snapshot = {
    id: after.id, calendarId: expectedCalendarId, etag: after.etag, updated: after.updated,
    status: after.status, summary: after.summary ?? "", description: after.description ?? "",
    location: after.location ?? "", start: after.start, end: after.end,
    sourceHash, remoteHash: verified.remoteHash,
  };
  const { data: result, error: rpcError } = await client.rpc("apply_canonical_calendar_event_update", {
    p_sync_id: row.id, p_orbit_event_id: orbitEventId, p_expected_updated_at: row.updated_at,
    p_expected_current_hash: row.current_payload_hash, p_source_hash: sourceHash,
    p_remote_hash: verified.remoteHash, p_remote_etag: after.etag, p_remote_updated_at: after.updated,
    p_remote_snapshot: snapshot, p_event_revision: row.current_event_revision ?? 0, p_actor_id: actorId,
  });
  if (rpcError) throw rpcError;
  return { result: result as string, orbitEventId, googleEventId: eventId, googleEventUrl: remoteUrl ?? reference.googleEventUrl, beforeEtag: before.etag, etag: after.etag, sourceHash, remoteHash: verified.remoteHash, start: verified.start, end: verified.end };
}

