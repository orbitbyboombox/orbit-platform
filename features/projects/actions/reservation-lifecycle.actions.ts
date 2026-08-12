"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { removeCancelledReservationCalendar, synchronizeConfirmedReservationCalendar } from "@/features/connectors/google-calendar/application/google-calendar-sync.service";
import { archiveCancelledReservationDrive, synchronizeConfirmedReservationDrive } from "@/features/connectors/google-drive/application/google-drive-sync.service";

export type ReservationLifecycleAction="ARCHIVE"|"RESTORE"|"CANCEL"|"PERMANENT_DELETE";
const paths=["/projects","/events","/customers","/operations","/finance","/finance/receivables","/notifications"];

export async function transitionReservationLifecycleAction(projectId:string,action:ReservationLifecycleAction,reason:string):Promise<{ok:boolean;message:string}>{
  try{
    if(!projectId||reason.trim().length<3)throw new Error("Registra un motivo para continuar.");
    const client=await createSupabaseServerClient();const{data:auth,error:authError}=await client.auth.getUser();if(authError||!auth.user)throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
    if(action==="ARCHIVE"||action==="CANCEL"||action==="PERMANENT_DELETE"){
      await Promise.all([removeCancelledReservationCalendar({client,projectId,actorId:auth.user.id}),archiveCancelledReservationDrive({client,projectId,actorId:auth.user.id})]);
    }
    const{error}=await client.rpc("transition_reservation_lifecycle",{p_project_id:projectId,p_action:action,p_reason:reason.trim()});if(error)throw error;
    if(action==="RESTORE")await Promise.all([synchronizeConfirmedReservationCalendar({client,projectId,actorId:auth.user.id,operation:"RESTORE",requireCommercialReadiness:false}),synchronizeConfirmedReservationDrive({client,projectId,actorId:auth.user.id})]);
    paths.forEach(path=>revalidatePath(path));
    return{ok:true,message:{ARCHIVE:"Reserva archivada. Calendar cancelado, Drive archivado y Portal desactivado.",RESTORE:"Reserva restaurada y sus integraciones fueron reactivadas.",CANCEL:"Reserva cancelada y excluida de la operación activa.",PERMANENT_DELETE:"Reserva eliminada permanentemente sin registros operacionales huérfanos."}[action]};
  }catch(error){console.error(JSON.stringify({event:"reservation.lifecycle.failed",projectId,action,error:error instanceof Error?error.message:String(error),timestamp:new Date().toISOString()}));return{ok:false,message:"No fue posible completar la acción. ORBIT no aplicó una transición parcial; revisa las integraciones e inténtalo nuevamente."};}
}
