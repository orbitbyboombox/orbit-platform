"use server";
import { cookies,headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerActionClient } from "@/lib/supabase/server";
import { CUSTOMER_SESSION_COOKIE,STAFF_SESSION_COOKIE,requestEvidence,revokePortalSession } from "./portal-auth.service";
import { portalTokenHash } from "@/features/customer-portal/customer-portal.service";

const FAILURE="No fue posible validar la información ingresada.";
type Result={ok:false;error:string};
const cookieOptions=(expires:string)=>({httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax" as const,path:"/",expires:new Date(expires)});

export async function customerPortalLoginAction(_:Result|undefined,form:FormData):Promise<Result>{
  const rut=String(form.get("rut")??"");const eventDate=String(form.get("eventDate")??"");const evidence=requestEvidence(await headers());
  const {data,error}=await createAdminClient().rpc("authenticate_customer_portal",{p_rut:rut,p_event_date:eventDate,p_ip_hash:evidence.ipHash,p_user_agent:evidence.userAgent,p_device:evidence.device});
  const session=data?.[0];if(error||!session)return{ok:false,error:FAILURE};const admin=createAdminClient();const{data:project}=await admin.from("projects").select("customer_id").eq("id",session.project_id).single();if(!project)return{ok:false,error:FAILURE};await admin.from("customer_portal_tokens").update({revoked_at:new Date().toISOString()}).eq("project_id",session.project_id).is("revoked_at",null);const{error:tokenError}=await admin.from("customer_portal_tokens").insert({project_id:session.project_id,customer_id:project.customer_id,token_hash:portalTokenHash(session.session_token),expires_at:session.expires_at});if(tokenError)return{ok:false,error:FAILURE};(await cookies()).set(CUSTOMER_SESSION_COOKIE,session.session_token,cookieOptions(session.expires_at));redirect(`/p/${session.session_token}`);
}
export async function staffPortalLoginAction(_:Result|undefined,form:FormData):Promise<Result>{
  const rut=String(form.get("rut")??"");const pin=String(form.get("pin")??"");const evidence=requestEvidence(await headers());
  const {data,error}=await createAdminClient().rpc("authenticate_staff_portal",{p_rut:rut,p_pin:pin,p_ip_hash:evidence.ipHash,p_user_agent:evidence.userAgent,p_device:evidence.device});
  const session=data?.[0];if(error||!session)return{ok:false,error:FAILURE};(await cookies()).set(STAFF_SESSION_COOKIE,session.session_token,cookieOptions(session.expires_at));redirect("/staff-portal");
}
export async function portalLogoutAction(type:"CUSTOMER"|"STAFF"){await revokePortalSession(type);redirect(type==="CUSTOMER"?"/login?access=customer":"/login?access=staff");}
export async function resetStaffPinAction(form:FormData){const client=await createSupabaseServerActionClient();const staffId=String(form.get("staffId")??"");const pin=String(form.get("pin")??"");const reason=String(form.get("reason")??"");const{error}=await client.rpc("set_staff_portal_pin",{p_staff_id:staffId,p_pin:pin,p_reason:reason});return error?{ok:false,error:error.message}:{ok:true,message:"Contraseña actualizada y auditada."};}
