import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultModuleStates, ORBIT_MODULE_CATALOG, type OrbitModuleKey } from "./catalog";

export type ModuleStateMap=Record<OrbitModuleKey,boolean>;

export async function loadModuleStates(client:SupabaseClient):Promise<ModuleStateMap>{
  const {data,error}=await client.from("orbit_modules").select("module_key,enabled");
  if(error){if(error.code==="42P01")return {...defaultModuleStates};throw error;}
  const states={...defaultModuleStates};
  for(const item of data??[])if(item.module_key in states)states[item.module_key as OrbitModuleKey]=Boolean(item.enabled);
  return states;
}

export async function synchronizeModuleCatalog(client:SupabaseClient,userId:string){
  const rows=ORBIT_MODULE_CATALOG.map((item,index)=>({module_key:item.key,name:item.name,description:item.description,category:item.category,display_order:index+1,enabled:item.key in defaultModuleStates?defaultModuleStates[item.key]:false,created_by:userId,updated_by:userId}));
  const {error}=await client.from("orbit_modules").upsert(rows,{onConflict:"module_key",ignoreDuplicates:true});
  if(error)throw error;
}
