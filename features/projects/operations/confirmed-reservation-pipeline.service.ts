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
    status: "STARTED" | "PASS" | "FAIL",
  ) => void | Promise<void>;
  continueOnError?: boolean;
}) {
  let data: unknown = null;
  let calendar: unknown = null;
  let drive: unknown = null;
  const failures: Array<{stage:OperationalPipelineStage;error:string}>=[];
  const run=async<T>(stage:OperationalPipelineStage,operation:()=>Promise<T>)=>{await input.onStage?.(stage,"STARTED");try{const value=await operation();await input.onStage?.(stage,"PASS");return value;}catch(error){await input.onStage?.(stage,"FAIL");if(!input.continueOnError)throw error;failures.push({stage,error:error instanceof Error?error.message:String(error)});console.error(JSON.stringify({level:"error",event:"reservation.boundary_b.failed",projectId:input.projectId,stage,error:error instanceof Error?{name:error.name,message:error.message,stack:error.stack}:String(error),timestamp:new Date().toISOString()}));return null;}};
  if (!input.completedStages?.has("BUSINESS_ENGINE")) {
    const result = await run("BUSINESS_ENGINE",async()=>{const result=await input.client.rpc(
      "confirm_reservation_operational_pipeline",
      { p_project_id: input.projectId, p_actor_id: input.actorId },
    );if(result.error)throw result.error;return result.data;});
    data = result;
  }
  if (!input.completedStages?.has("GOOGLE_CALENDAR")) {
    calendar = await run("GOOGLE_CALENDAR",()=>synchronizeConfirmedReservationCalendar({
      client: input.client,
      projectId: input.projectId,
      actorId: input.actorId,
      requireCommercialReadiness: false,
    }));
  }
  if (!input.completedStages?.has("GOOGLE_DRIVE")) {
    drive = await run("GOOGLE_DRIVE",()=>synchronizeConfirmedReservationDrive({
      client: input.client,
      projectId: input.projectId,
      actorId: input.actorId,
    }));
  }
  return { business: data, calendar, drive, failures };
}
