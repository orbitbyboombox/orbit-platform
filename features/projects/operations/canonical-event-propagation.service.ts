import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  invalidateCalendarSyncForProject,
} from "@/features/connectors/google-calendar/application/google-calendar-resync.service";
import {
  synchronizeConfirmedReservationCalendar,
} from "@/features/connectors/google-calendar/application/google-calendar-sync.service";

export type CanonicalCalendarPropagation = {
  status: "SYNCHRONIZED" | "STALE" | "FAILED";
  googleEventId?: string;
  error?: string;
};

/**
 * Runs after a committed canonical event mutation. The database mutation is
 * already durable; Calendar is a secondary consumer and therefore failure is
 * reported as retryable rather than rolling the event change back.
 */
export async function propagateCanonicalEventChange(input: {
  client: SupabaseClient;
  projectId: string;
  actorId: string;
}): Promise<CanonicalCalendarPropagation> {
  try {
    await invalidateCalendarSyncForProject(input.client, input.projectId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[canonical-event-propagation] invalidation failed", {
      projectId: input.projectId,
      stage: "CALENDAR_INVALIDATION",
      error: message,
    });
    return { status: "FAILED", error: message };
  }

  try {
    const result = await synchronizeConfirmedReservationCalendar({
      client: input.client,
      projectId: input.projectId,
      actorId: input.actorId,
      operation: "UPSERT",
      policy: "EXISTING_LEGACY_UPDATE",
    });
    if (!result) {
      return {
        status: "STALE",
        error: "CALENDAR_MAPPING_MISSING",
      };
    }
    return {
      status: "SYNCHRONIZED",
      googleEventId: result.googleEventId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[canonical-event-propagation] Calendar sync failed", {
      projectId: input.projectId,
      stage: "CALENDAR_SYNC",
      error: message,
    });
    return { status: "STALE", error: message };
  }
}
