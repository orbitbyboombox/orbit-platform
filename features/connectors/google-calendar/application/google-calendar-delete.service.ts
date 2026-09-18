import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadGoogleWorkspaceAccessToken, loadGoogleWorkspaceCalendarId } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import { GoogleCalendarApiProvider } from "../provider/google-calendar-live.provider";

export type CalendarDeletionStatus = "DELETED" | "ALREADY_DELETED" | "NO_MAPPING";

export type CalendarDeletionResult = {
  status: CalendarDeletionStatus;
  removed: boolean;
  googleEventIds: string[];
};

type CalendarMapping = {
  project_id: string;
  orbit_event_id: string | null;
  status: string | null;
  external_event_id: string | null;
  nova_external_event_id: string | null;
};

type CalendarDeletionInput = {
  client: SupabaseClient;
  projectId: string;
  actorId?: string | null;
  /** IDs captured by the deletion saga. They are hints; the mapping remains canonical. */
  eventIds?: string[];
};

const uniqueIds = (ids: Array<string | null | undefined>) => [...new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0))];

/**
 * Canonical, idempotent Calendar deletion used by cancellation and Founder
 * Force Delete. Google 404/410 are treated as convergence, never retried.
 * Both legacy and NOVA mapping columns are tombstoned so a second delete
 * cannot recreate or rediscover the event.
 */
export async function deleteCalendarEventForProject(input: CalendarDeletionInput): Promise<CalendarDeletionResult> {
  const { data: mapping, error: mappingError } = await input.client
    .from("calendar_sync")
    .select("project_id,orbit_event_id,status,external_event_id,nova_external_event_id")
    .eq("project_id", input.projectId)
    .maybeSingle<CalendarMapping>();
  if (mappingError) throw mappingError;

  const mappingIds = mapping ? [mapping.external_event_id, mapping.nova_external_event_id] : [];
  const googleEventIds = uniqueIds([...(input.eventIds ?? []), ...mappingIds]);
  if (!googleEventIds.length) {
    return { status: "NO_MAPPING", removed: false, googleEventIds: [] };
  }

  // A completed tombstone is terminal for an interactive cancellation. The
  // deletion saga may still pass captured IDs, in which case the provider call
  // below safely converges 404/410 without creating anything.
  if (!input.eventIds?.length && mapping?.status === "DELETED") {
    return { status: "ALREADY_DELETED", removed: false, googleEventIds };
  }

  const provider = new GoogleCalendarApiProvider(await loadGoogleWorkspaceAccessToken(), await loadGoogleWorkspaceCalendarId());
  for (const googleEventId of googleEventIds) await provider.deleteEvent(googleEventId);

  const synchronizedAt = new Date().toISOString();
  const { error: updateError } = await input.client.from("calendar_sync").update({
    status: "DELETED",
    external_url: null,
    nova_external_url: null,
    last_synced_at: synchronizedAt,
    last_error: null,
    last_error_code: null,
  }).eq("project_id", input.projectId);
  if (updateError) throw updateError;

  if (input.actorId && mapping?.orbit_event_id) {
    const message = "Evento eliminado de Google Calendar.";
    const { data: project } = await input.client.from("projects").select("id,customer_id").eq("id", input.projectId).maybeSingle();
    const correlationId = `calendar:${mapping.orbit_event_id}:deleted`;
    const { error: timelineError } = await input.client.from("timeline_events").upsert({
      customer_id: project?.customer_id ?? null,
      project_id: input.projectId,
      event_type: "CALENDAR_EVENT_REMOVED",
      title: message,
      description: message,
      orbit_event_id: mapping.orbit_event_id,
      actor_id: input.actorId,
      actor_label: "Administrador",
      source: "Calendar",
      action: "CALENDAR_EVENT_REMOVED",
      entity_type: "CalendarSync",
      entity_id: googleEventIds[0],
      human_message: message,
      correlation_id: correlationId,
      created_by: input.actorId,
    }, { onConflict: "correlation_id", ignoreDuplicates: true });
    if (timelineError) throw timelineError;
  }

  return { status: "DELETED", removed: true, googleEventIds };
}
