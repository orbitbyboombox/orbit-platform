"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerActionClient } from "@/lib/supabase/server";

export async function acknowledgeHealthAlertAction(alertId:string){try{const client=await createSupabaseServerActionClient();const{data:auth,error:authError}=await client.auth.getUser();if(authError||!auth.user)throw authError??new Error("Sesión requerida.");const{error}=await client.from("system_health_alerts").update({status:"ACKNOWLEDGED",acknowledged_by:auth.user.id,acknowledged_at:new Date().toISOString()}).eq("id",alertId).eq("status","OPEN");if(error)throw error;revalidatePath("/settings/health");return{ok:true as const};}catch(error){return{ok:false as const,error:error instanceof Error?error.message:"No fue posible reconocer la alerta."}}}
