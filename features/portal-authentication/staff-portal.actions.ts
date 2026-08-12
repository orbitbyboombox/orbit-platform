"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadPortalSession } from "./portal-auth.service";

export type ClaimState={ok:boolean;message:string};

export async function claimResponsibilityAction(projectId:string,responsibility:string):Promise<ClaimState>{
  const session=await loadPortalSession("STAFF");
  if(!session?.staff_id)return{ok:false,message:"Tu sesión expiró. Ingresa nuevamente."};
  const admin=createAdminClient();
  const{error}=await admin.rpc("claim_staff_responsibility",{p_staff_id:session.staff_id,p_project_id:projectId,p_responsibility:responsibility});
  if(error)return{ok:false,message:error.message.includes("tomada")?"Otra persona tomó esta responsabilidad antes que tú.":error.message};
  revalidatePath("/staff-portal");
  return{ok:true,message:"Responsabilidad asignada correctamente."};
}
