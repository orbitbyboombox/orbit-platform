import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CalendarOperationalEventInput } from "../types/google-calendar-live.types";
import type { GoogleCalendarApiProvider } from "../provider/google-calendar-live.provider";
import { fingerprintReviewedCalendarEvent, verifyApprovedRemoteEvent } from "./calendar-remote-review-policy";
import { mapOperationalEventToCalendar, fingerprintCalendarOperationalInput } from "./google-calendar-live";

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
  if (!orbitEventId) throw new Error("El evento no tiene ORBIT Event ID.");
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

  // If Google already reflects ORBIT, only confirm the verified snapshot. This
  // avoids an unnecessary PATCH and makes retries safe after a prior partial
  // completion where Google succeeded but Supabase confirmation did not.
  let remoteMatchesCanonical = false;
  try {
    verifyApprovedRemoteEvent(input, expectedPayload, before);
    remoteMatchesCanonical = true;
  } catch (error) {
    if (!(error instanceof Error) || !/El evento remoto|La citación|El título|La dirección|El horario|El campo|Los extras|La descripción/.test(error.message)) throw error;
  }
  if (remoteMatchesCanonical) {
    const accepted = await acceptReviewedRemoteCalendarEvent({ client, provider, input, actorId, expectedCalendarId });
    return { result: accepted.result, orbitEventId, googleEventId: eventId, googleEventUrl: remoteUrl ?? undefined, beforeEtag: before.etag, etag: accepted.etag, sourceHash: accepted.sourceHash, remoteHash: accepted.remoteHash, start: accepted.start, end: accepted.end };
  }

  const reference = await provider.updateEvent(eventId, expectedPayload, before.etag);
  const after = await provider.getEvent(eventId);
  const verified = verifyApprovedRemoteEvent(input, expectedPayload, after);
  if (after.id !== eventId || after.etag === before.etag || after.updated === before.updated) throw new Error(`Calendar no confirmó una nueva versión para ${orbitEventId}.`);
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
  if (rpcError) {
    // Google may have committed the PATCH while the database transaction was
    // rejected by a concurrent writer. Re-read and confirm only if the remote
    // snapshot still matches ORBIT; otherwise preserve the original failure.
    try {
      const recovered = await acceptReviewedRemoteCalendarEvent({ client, provider, input, actorId, expectedCalendarId });
      return { result: recovered.result, orbitEventId, googleEventId: eventId, googleEventUrl: remoteUrl ?? reference.googleEventUrl, beforeEtag: before.etag, etag: recovered.etag, sourceHash: recovered.sourceHash, remoteHash: recovered.remoteHash, start: recovered.start, end: recovered.end, recoveredAfterRemoteWrite: true };
    } catch {
      throw rpcError;
    }
  }
  return { result: result as string, orbitEventId, googleEventId: eventId, googleEventUrl: remoteUrl ?? reference.googleEventUrl, beforeEtag: before.etag, etag: after.etag, sourceHash, remoteHash: verified.remoteHash, start: verified.start, end: verified.end };
}

