"use server";

import {revalidatePath} from "next/cache";
import {createSupabaseServerActionClient} from "@/lib/supabase/server";

const categories=["OPERATOR","ASSEMBLY","DISASSEMBLY","FUEL","TRANSPORT","PARKING","TOLLS","MEALS","HOTEL","SCRAPBOOK","MAGNETS","OTHER_OPERATIONAL"] as const;

export async function saveRealCostsAction(data:FormData):Promise<{ok:boolean;message:string}>{
  try{
    const projectId=String(data.get("projectId")??"");const reason=String(data.get("reason")??"").trim();if(!projectId||reason.length<3)throw new Error("El motivo del ajuste es obligatorio.");
    const values=Object.fromEntries(categories.map(category=>{const value=Number(data.get(category));if(!Number.isFinite(value)||value<0)throw new Error("Todos los costos deben ser valores positivos o cero.");return[category,value]}));
    const client=await createSupabaseServerActionClient();const{data:auth}=await client.auth.getUser();if(!auth.user)throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");const{data:profile}=await client.from("profiles").select("role").eq("id",auth.user.id).single();if(!profile||!["CEO","ADMINISTRATOR"].includes(profile.role))throw new Error("Solo Founder o Administración puede editar costos reales.");
    const{data:count,error}=await client.rpc("apply_real_cost_overrides",{p_project_id:projectId,p_values:values,p_reason:reason});if(error)throw error;revalidatePath(`/projects/${projectId}`);return{ok:true,message:`${Number(count)} costos reales actualizados y auditados.`};
  }catch(error){return{ok:false,message:error instanceof Error?error.message:"No fue posible guardar los costos reales."};}
}
