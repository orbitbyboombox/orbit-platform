import"server-only";
import type{SupabaseClient}from"@supabase/supabase-js";
import{synchronizeConfirmedReservationCalendar}from"@/features/connectors/google-calendar/application/google-calendar-sync.service";
import{synchronizeConfirmedReservationDrive}from"@/features/connectors/google-drive/application/google-drive-sync.service";

export type OperationalPipelineStage="BUSINESS_ENGINE"|"GOOGLE_CALENDAR"|"GOOGLE_DRIVE";

export async function runConfirmedReservationOperationalPipeline(input:{client:SupabaseClient;projectId:string;actorId:string;onStage?:(stage:OperationalPipelineStage,status:"STARTED"|"PASS")=>void}){
  input.onStage?.("BUSINESS_ENGINE","STARTED");
  const{data,error}=await input.client.rpc("confirm_reservation_operational_pipeline",{p_project_id:input.projectId,p_actor_id:input.actorId});
  if(error)throw error;
  input.onStage?.("BUSINESS_ENGINE","PASS");
  input.onStage?.("GOOGLE_CALENDAR","STARTED");
  const calendar=await synchronizeConfirmedReservationCalendar({client:input.client,projectId:input.projectId,actorId:input.actorId,requireCommercialReadiness:false});
  input.onStage?.("GOOGLE_CALENDAR","PASS");
  input.onStage?.("GOOGLE_DRIVE","STARTED");
  const drive=await synchronizeConfirmedReservationDrive({client:input.client,projectId:input.projectId,actorId:input.actorId});
  input.onStage?.("GOOGLE_DRIVE","PASS");
  return{business:data,calendar,drive};
}
