"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { removeCancelledReservationCalendar, synchronizeConfirmedReservationCalendar } from "@/features/connectors/google-calendar/application/google-calendar-sync.service";
import { deleteCalendarEventForProject } from "@/features/connectors/google-calendar/application/google-calendar-delete.service";
import { archiveCancelledReservationDrive, synchronizeConfirmedReservationDrive } from "@/features/connectors/google-drive/application/google-drive-sync.service";
import { deliverAssignmentCancellationBoundary } from "@/features/operations/staff-assignment-cancellation.service";
import { assertFounderForceDeleteConfirmation, assertTestFullPurgeConfirmation, serializeForceDeleteError } from "@/features/founder-force-delete/policy";

export type ReservationLifecycleAction="ARCHIVE"|"RESTORE"|"CANCEL"|"PERMANENT_DELETE";
const paths=["/projects","/events","/customers","/operations","/finance","/finance/receivables","/notifications"];

export async function founderForceDeleteEventAction(projectId: string, reason: string, confirmation: string): Promise<{ok:boolean;message:string;status?:string}> {
  try {
    assertFounderForceDeleteConfirmation(confirmation);
    if (!projectId || reason.trim().length < 3) throw new Error("Registra un motivo para continuar.");
    const client = await createSupabaseServerClient();
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
    const { data: profile, error: profileError } = await client.from("profiles").select("role").eq("id", auth.user.id).single();
    if (profileError) throw profileError;
    if (profile?.role !== "CEO") throw new Error("Solo Founder/CEO puede eliminar definitivamente.");
    const { data, error } = await client.rpc("purge_event_controlled", { p_project_id: projectId, p_confirmation: confirmation, p_reason: reason.trim(), p_delete_orphan_customer: false });
    if (error) throw error;
    // Founder Force Delete removes the internal record transactionally, but
    // must not wait for the five-minute cron before converging Google Calendar.
    // The same canonical delete helper remains the retry path for transient
    // provider failures and for jobs interrupted after this request returns.
    const { data: jobSnapshot } = data?.jobId
      ? await client.from("event_deletion_jobs").select("external_cleanup").eq("id", String(data.jobId)).maybeSingle()
      : { data: null };
    const capturedCalendarIds = Array.isArray((jobSnapshot?.external_cleanup as { calendarEventIds?: unknown } | null)?.calendarEventIds)
      ? ((jobSnapshot?.external_cleanup as { calendarEventIds: unknown[] }).calendarEventIds.filter((id): id is string => typeof id === "string" && id.length > 0))
      : [];
    if (String(data?.status ?? "") === "REMOVED_FROM_OPERATION") {
      try {
        const calendarResult = await deleteCalendarEventForProject({ client, projectId, actorId: auth.user.id, eventIds: capturedCalendarIds });
        console.log(JSON.stringify({ level: "info", event: "founder_force_delete.calendar_cleanup", projectId, status: calendarResult.status, googleEventIds: calendarResult.googleEventIds.length }));
      } catch (calendarError) {
        const details = serializeForceDeleteError(calendarError);
        console.error(JSON.stringify({ level: "error", event: "founder_force_delete.calendar_cleanup_failed", projectId, code: details.code, message: details.message, retryable: true }));
        await client.from("event_deletion_jobs").update({ status: "FAILED_RETRYABLE", next_retry_at: new Date(Date.now() + 60_000).toISOString(), last_error: { ...details, projectId, cleanupStage: "CALENDAR", integration: "GOOGLE_CALENDAR" } }).eq("project_id", projectId);
      }
    }
    paths.forEach((path) => revalidatePath(path));
    const status = String(data?.status ?? "REMOVED_FROM_OPERATION");
    const terminal = ["ALREADY_DELETED", "COMPLETED", "COMPLETED_WITH_EXTERNAL_RESIDUALS", "FAILED_MANUAL_ACTION_REQUIRED"].includes(status);
    const { data: job } = data?.jobId ? await client.from("event_deletion_jobs").select("cleanup_residuals").eq("id", String(data.jobId)).maybeSingle() : { data: null };
    const residualCount = Array.isArray(job?.cleanup_residuals) ? job.cleanup_residuals.filter((item: unknown) => Boolean((item as { requiresManualAction?: unknown })?.requiresManualAction)).length : 0;
    const message = status === "ALREADY_DELETED" || status === "COMPLETED" ? "Ya fue eliminado." : status === "COMPLETED_WITH_EXTERNAL_RESIDUALS" ? `Evento eliminado de ORBIT. Quedaron ${residualCount} archivos históricos en Google Drive que requieren eliminación manual por su propietario.` : terminal ? "Evento eliminado de ORBIT. La limpieza externa requiere una acción manual del propietario." : "El registro fue eliminado de ORBIT. La limpieza externa continúa en segundo plano.";
    return { ok: true, status, message };
  } catch (error) {
    const details = serializeForceDeleteError(error);
    console.error("[ORBIT][FOUNDER_FORCE_DELETE]", { ...details, projectId, timestamp: new Date().toISOString() });
    return { ok: false, message: details.message };
  }
}

export async function testFullPurgeEventAction(projectId: string, reason: string, confirmation: string): Promise<{ok:boolean;message:string;status?:string}> {
  try {
    assertTestFullPurgeConfirmation(confirmation);
    if (!projectId || reason.trim().length < 3) throw new Error("Registra un motivo para continuar.");
    const client = await createSupabaseServerClient();
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
    const { data: profile, error: profileError } = await client.from("profiles").select("role").eq("id", auth.user.id).single();
    if (profileError) throw profileError;
    if (profile?.role !== "CEO") throw new Error("Solo Founder/CEO puede purgar una prueba.");
    const { data, error } = await client.rpc("purge_event_test_full", { p_project_id: projectId, p_confirmation: confirmation, p_reason: reason.trim() });
    if (error) throw error;
    paths.forEach((path) => revalidatePath(path));
    return { ok: true, status: String(data?.status ?? "PURGED_QA"), message: "Prueba QA purgada completamente." };
  } catch (error) {
    const details = serializeForceDeleteError(error);
    console.error("[ORBIT][TEST_FULL_PURGE]", { ...details, projectId, timestamp: new Date().toISOString() });
    return { ok: false, message: details.message };
  }
}

export async function transitionReservationLifecycleAction(projectId:string,action:ReservationLifecycleAction,reason:string,confirmation?:string,_deleteOrphanCustomer=false):Promise<{ok:boolean;message:string}>{
  try{
    if(!projectId||reason.trim().length<3)throw new Error("Registra un motivo para continuar.");
    const client=await createSupabaseServerClient();const{data:auth,error:authError}=await client.auth.getUser();if(authError||!auth.user)throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
    const cancellationIds:string[]=[];
    if(action==="CANCEL"){
      const{data:assignments,error:assignmentError}=await client.from("assignments").select("id").eq("project_id",projectId).is("deleted_at",null).not("status","in","(CANCELLED,REJECTED,COMPLETED)");if(assignmentError)throw assignmentError;
      for(const assignment of assignments??[]){const{data:cancellationId,error:cancellationError}=await client.rpc("cancel_staff_assignment_by_founder",{p_assignment_id:assignment.id,p_reason_category:"OPERATIONAL",p_reason_detail:reason.trim(),p_device:null,p_ip_hash:null,p_user_agent:null});if(cancellationError||!cancellationId)throw cancellationError??new Error("No fue posible cancelar el Staff confirmado.");const{error:republishError}=await client.from("staff_assignment_cancellations").update({republish_allowed:false}).eq("id",cancellationId);if(republishError)throw republishError;cancellationIds.push(String(cancellationId));}
    }
    if(action==="PERMANENT_DELETE"){
      if(confirmation!=="ELIMINAR")return{ok:false,message:"Escribe ELIMINAR para confirmar la eliminación definitiva."};
      const result = await founderForceDeleteEventAction(projectId, reason, confirmation ?? "");
      if (!result.ok) return result;
      return result;
    }else{
      const{error}=await client.rpc("transition_reservation_lifecycle",{p_project_id:projectId,p_action:action,p_reason:reason.trim()});if(error)throw error;
    }
    if(action==="CANCEL"){
      const{error:closureError}=await client.rpc("close_cancelled_event_staff_flow",{p_project_id:projectId});if(closureError)throw closureError;
      for(const cancellationId of cancellationIds){try{await deliverAssignmentCancellationBoundary(client,cancellationId)}catch(boundaryError){console.error("[ORBIT][EVENT_LIFECYCLE_BOUNDARY]",{stage:"staff",cancellationId,error:boundaryError instanceof Error?boundaryError.message:String(boundaryError)})}}
    }
    if(action==="ARCHIVE"||action==="CANCEL"){
      const boundary=await Promise.allSettled([removeCancelledReservationCalendar({client,projectId,actorId:auth.user.id}),archiveCancelledReservationDrive({client,projectId,actorId:auth.user.id})]);boundary.forEach((result,index)=>{if(result.status==="rejected")console.error("[ORBIT][EVENT_LIFECYCLE_BOUNDARY]",{stage:["calendar","drive"][index],error:result.reason instanceof Error?result.reason.message:String(result.reason)})});
    }
    if(action==="RESTORE")await Promise.all([synchronizeConfirmedReservationCalendar({client,projectId,actorId:auth.user.id,operation:"RESTORE",policy:"EXISTING_LEGACY_UPDATE"}),synchronizeConfirmedReservationDrive({client,projectId,actorId:auth.user.id})]);
    paths.forEach(path=>revalidatePath(path));
    return{ok:true,message:{ARCHIVE:"Reserva archivada. Calendar cancelado, Drive archivado y Portal desactivado.",RESTORE:"Reserva restaurada y sus integraciones fueron reactivadas.",CANCEL:"Reserva cancelada y excluida de la operación activa.",PERMANENT_DELETE:"Reserva eliminada permanentemente sin registros operacionales huérfanos."}[action]};
  }catch(error){console.error(JSON.stringify({event:"reservation.lifecycle.failed",projectId,action,error:error instanceof Error?error.message:String(error),timestamp:new Date().toISOString()}));return{ok:false,message:"No fue posible completar la acción. ORBIT no aplicó una transición parcial; revisa las integraciones e inténtalo nuevamente."};}
}
