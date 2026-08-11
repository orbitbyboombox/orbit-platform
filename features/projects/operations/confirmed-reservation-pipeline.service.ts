import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { synchronizeConfirmedReservationCalendar } from "@/features/connectors/google-calendar/application/google-calendar-sync.service";
import { synchronizeConfirmedReservationDrive } from "@/features/connectors/google-drive/application/google-drive-sync.service";

export type OperationalPipelineStage =
  | "BUSINESS_ENGINE"
  | "GOOGLE_CALENDAR"
  | "GOOGLE_DRIVE";

export async function runConfirmedReservationOperationalPipeline(input: {
  client: SupabaseClient;
  projectId: string;
  actorId: string;
  completedStages?: ReadonlySet<OperationalPipelineStage>;
  onStage?: (
    stage: OperationalPipelineStage,
    status: "STARTED" | "PASS",
  ) => void | Promise<void>;
}) {
  let data: unknown = null;
  let calendar: unknown = null;
  let drive: unknown = null;
  if (!input.completedStages?.has("BUSINESS_ENGINE")) {
    await input.onStage?.("BUSINESS_ENGINE", "STARTED");
    const result = await input.client.rpc(
      "confirm_reservation_operational_pipeline",
      { p_project_id: input.projectId, p_actor_id: input.actorId },
    );
    if (result.error) throw result.error;
    data = result.data;
    await input.onStage?.("BUSINESS_ENGINE", "PASS");
  }
  if (!input.completedStages?.has("GOOGLE_CALENDAR")) {
    await input.onStage?.("GOOGLE_CALENDAR", "STARTED");
    calendar = await synchronizeConfirmedReservationCalendar({
      client: input.client,
      projectId: input.projectId,
      actorId: input.actorId,
      requireCommercialReadiness: false,
    });
    await input.onStage?.("GOOGLE_CALENDAR", "PASS");
  }
  if (!input.completedStages?.has("GOOGLE_DRIVE")) {
    await input.onStage?.("GOOGLE_DRIVE", "STARTED");
    drive = await synchronizeConfirmedReservationDrive({
      client: input.client,
      projectId: input.projectId,
      actorId: input.actorId,
    });
    await input.onStage?.("GOOGLE_DRIVE", "PASS");
  }
  return { business: data, calendar, drive };
}
