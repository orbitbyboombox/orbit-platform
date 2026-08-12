"use server";
import {revalidatePath} from "next/cache";
import {createAdminClient} from "@/lib/supabase/admin";
import {loadPortalSession} from "./portal-auth.service";

export async function recordStaffCheckInAction(projectId:string,status:string){
  const session=await loadPortalSession("STAFF");if(!session?.staff_id)return{ok:false,message:"Tu sesión expiró."};
  const{error}=await createAdminClient().rpc("record_staff_portal_checkin",{p_staff_id:session.staff_id,p_project_id:projectId,p_status:status});
  if(error)return{ok:false,message:error.message};revalidatePath("/staff-portal");return{ok:true,message:"Estado operacional actualizado."};
}
