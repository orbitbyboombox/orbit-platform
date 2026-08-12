"use server";
import {revalidatePath} from "next/cache";
import {createAdminClient} from "@/lib/supabase/admin";
import {loadPortalSession} from "./portal-auth.service";

export async function recordStaffCheckInAction(projectId:string,status:string){
  const session=await loadPortalSession("STAFF");if(!session?.staff_id)return{ok:false,message:"Tu sesión expiró."};
  const{error}=await createAdminClient().rpc("record_staff_portal_checkin",{p_staff_id:session.staff_id,p_project_id:projectId,p_status:status});
  if(error)return{ok:false,message:error.message};revalidatePath("/staff-portal");return{ok:true,message:"Estado operacional actualizado."};
}

export async function requestStaffResponsibilityAction(projectId:string,responsibility:string){
  const session=await loadPortalSession("STAFF");if(!session?.staff_id)return{ok:false,message:"Tu sesión expiró."};
  const{error}=await createAdminClient().rpc("request_staff_responsibility",{p_staff_id:session.staff_id,p_project_id:projectId,p_responsibility:responsibility});
  if(error)return{ok:false,message:error.message};revalidatePath("/staff-portal");return{ok:true,message:"Solicitud enviada al Founder."};
}

export async function changeStaffPasswordAction(form:FormData){
  const session=await loadPortalSession("STAFF");if(!session?.staff_id)return{ok:false,message:"Tu sesión expiró."};
  const password=String(form.get("password")??""),confirmation=String(form.get("confirmation")??"");
  if(password!==confirmation)return{ok:false,message:"Las contraseñas no coinciden."};
  const{error}=await createAdminClient().rpc("change_staff_portal_password",{p_staff_id:session.staff_id,p_password:password});
  if(error)return{ok:false,message:error.message};revalidatePath("/staff-portal");return{ok:true,message:"Contraseña creada correctamente."};
}
