"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { removeCancelledReservationCalendar, synchronizeConfirmedReservationCalendar } from "@/features/connectors/google-calendar/application/google-calendar-sync.service";
import { archiveCancelledReservationDrive, synchronizeConfirmedReservationDrive } from "@/features/connectors/google-drive/application/google-drive-sync.service";
import { deliverAssignmentCancellationBoundary } from "@/features/operations/staff-assignment-cancellation.service";
import { assertFounderForceDeleteConfirmation, serializeForceDeleteError } from "@/features/founder-force-delete/policy";

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
    paths.forEach((path) => revalidatePath(path));
    const status = String(data?.status ?? "REMOVED_FROM_OPERATION");
    return { ok: true, status, message: status === "ALREADY_DELETED" ? "Ya fue eliminado." : "El registro fue eliminado de ORBIT. La limpieza externa continúa en segundo plano." };
  } catch (error) {
    const details = serializeForceDeleteError(error);
    console.error("[ORBIT][FOUNDER_FORCE_DELETE]", { ...details, projectId, timestamp: new Date().toISOString() });
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
