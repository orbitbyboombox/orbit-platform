"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ORBIT_MODULE_CATALOG, type OrbitModuleKey } from "./catalog";

export async function setOrbitModuleStateAction(input:{key:OrbitModuleKey;enabled:boolean;reason:string}){
  try{
    const client=await createSupabaseServerClient();const{data:auth,error:authError}=await client.auth.getUser();if(authError||!auth.user)throw authError??new Error("Sesión requerida.");
    const{data:profile,error:profileError}=await client.from("profiles").select("role").eq("id",auth.user.id).single();if(profileError)throw profileError;if(!["CEO","ADMINISTRATOR"].includes(profile.role))throw new Error("Solo Founder o Administrador puede administrar módulos.");
    const definition=ORBIT_MODULE_CATALOG.find(item=>item.key===input.key);if(!definition)throw new Error("Módulo no reconocido.");if(!input.reason.trim())throw new Error("La razón del cambio es obligatoria.");
    const{data,error}=await client.from("orbit_modules").update({enabled:input.enabled,approval_reason:input.reason.trim(),updated_by:auth.user.id}).eq("module_key",input.key).select("module_key").maybeSingle();if(error)throw error;if(!data)throw new Error("El módulo no está registrado.");
    revalidatePath("/","layout");return{ok:true as const};
  }catch(error){return{ok:false as const,error:error instanceof Error?error.message:"No fue posible actualizar el módulo."};}
}
