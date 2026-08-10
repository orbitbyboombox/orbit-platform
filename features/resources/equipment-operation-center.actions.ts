"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type EquipmentCategory = "TOTEM" | "CASE" | "VEHICLE" | "CLASSIC_TOTEM" | "BLACK_STUDIO" | "BBOX360" | "LIGHTBOX" | "BOOMBALL" | "PRINTER" | "CAMERA" | "LIGHT" | "ACCESSORY";
export type EquipmentStatus = "AVAILABLE" | "ASSIGNED" | "IN_EVENT" | "MAINTENANCE" | "OUT_OF_SERVICE";
export interface EquipmentItem { id:string; code:string; name:string; category:EquipmentCategory; status:EquipmentStatus; usageCount:number; version:number; }
type Result = { ok:true; item:EquipmentItem } | { ok:false; error:string };

const text=(value:FormDataEntryValue|null)=>String(value??"").trim();
const categories:readonly EquipmentCategory[]=["TOTEM","CASE","VEHICLE","CLASSIC_TOTEM","BLACK_STUDIO","BBOX360","LIGHTBOX","BOOMBALL","PRINTER","CAMERA","LIGHT","ACCESSORY"];
const statuses:readonly EquipmentStatus[]=["AVAILABLE","ASSIGNED","IN_EVENT","MAINTENANCE","OUT_OF_SERVICE"];

async function context(){
  const client=await createSupabaseServerClient();
  const{data:auth,error:authError}=await client.auth.getUser();
  if(authError||!auth.user)throw new Error("Sesión requerida.");
  const{data:profile,error:profileError}=await client.from("profiles").select("role").eq("id",auth.user.id).single();
  if(profileError)throw profileError;
  if(!["CEO","ADMINISTRATOR"].includes(profile.role))throw new Error("Solo Administración puede gestionar equipamiento.");
  return{client,userId:auth.user.id};
}

function item(row:{id:string;asset_code:string;asset_type:string;status:string;usage_counter:number;version:number;metadata:unknown}):EquipmentItem{
  const metadata=(row.metadata??{}) as Record<string,unknown>;
  return{id:row.id,code:row.asset_code,name:typeof metadata.name==="string"&&metadata.name.trim()?metadata.name:row.asset_code,category:row.asset_type as EquipmentCategory,status:row.status as EquipmentStatus,usageCount:row.usage_counter,version:row.version};
}

async function history(client:Awaited<ReturnType<typeof createSupabaseServerClient>>,input:{assetId:string;actorId:string;message:string;previous?:unknown;next?:unknown}){
  const{error}=await client.from("asset_history").insert({asset_id:input.assetId,history_type:"STATUS_CHANGE",message:input.message,previous_state:input.previous??null,new_state:input.next??null,actor_id:input.actorId,correlation_id:crypto.randomUUID()});
  if(error)throw error;
}

export async function createEquipmentAction(formData:FormData):Promise<Result>{
  try{
    const{client,userId}=await context();const code=text(formData.get("code")).toUpperCase();const name=text(formData.get("name"));const category=text(formData.get("category")) as EquipmentCategory;
    if(!code||!name||!categories.includes(category))throw new Error("Completa nombre, código y categoría.");
    const{data,error}=await client.from("operational_assets").insert({asset_code:code,asset_type:category,status:"AVAILABLE",qr_key:`orbit:asset:${code}`,metadata:{name},created_by:userId,updated_by:userId}).select("id,asset_code,asset_type,status,usage_counter,version,metadata").single();if(error)throw error;
    await history(client,{assetId:data.id,actorId:userId,message:`${name} agregado al inventario.`,next:{code,name,category,status:"AVAILABLE"}});return{ok:true,item:item(data)};
  }catch(error){return{ok:false,error:error instanceof Error?error.message:"No fue posible agregar el equipo."};}
}

export async function updateEquipmentAction(formData:FormData):Promise<Result>{
  try{
    const{client,userId}=await context();const id=text(formData.get("id"));const expectedVersion=Number(formData.get("version"));const code=text(formData.get("code")).toUpperCase();const name=text(formData.get("name"));const category=text(formData.get("category")) as EquipmentCategory;const status=text(formData.get("status")) as EquipmentStatus;
    if(!id||!code||!name||!categories.includes(category)||!statuses.includes(status))throw new Error("Revisa los datos del equipo.");
    const{data:previous,error:previousError}=await client.from("operational_assets").select("asset_code,asset_type,status,metadata").eq("id",id).single();if(previousError)throw previousError;
    const{data,error}=await client.from("operational_assets").update({asset_code:code,asset_type:category,status,qr_key:`orbit:asset:${code}`,metadata:{...((previous.metadata??{}) as Record<string,unknown>),name},updated_by:userId}).eq("id",id).eq("version",expectedVersion).is("deleted_at",null).select("id,asset_code,asset_type,status,usage_counter,version,metadata").maybeSingle();if(error)throw error;if(!data)throw new Error("El equipo cambió en otra sesión. Vuelve a abrirlo.");
    await history(client,{assetId:id,actorId:userId,message:`${name} actualizado.`,previous,next:{code,name,category,status}});return{ok:true,item:item(data)};
  }catch(error){return{ok:false,error:error instanceof Error?error.message:"No fue posible editar el equipo."};}
}

export async function disableEquipmentAction(id:string,expectedVersion:number):Promise<Result>{
  try{const{client,userId}=await context();const{data,error}=await client.from("operational_assets").update({status:"OUT_OF_SERVICE",updated_by:userId}).eq("id",id).eq("version",expectedVersion).is("deleted_at",null).select("id,asset_code,asset_type,status,usage_counter,version,metadata").maybeSingle();if(error)throw error;if(!data)throw new Error("El equipo cambió en otra sesión.");await history(client,{assetId:id,actorId:userId,message:`${data.asset_code} deshabilitado.`,previous:{status:"ACTIVE"},next:{status:"OUT_OF_SERVICE"}});return{ok:true,item:item(data)};}catch(error){return{ok:false,error:error instanceof Error?error.message:"No fue posible deshabilitar el equipo."};}
}

export async function deleteEquipmentAction(id:string,expectedVersion:number):Promise<Result>{
  try{const{client,userId}=await context();const now=new Date().toISOString();const{data,error}=await client.from("operational_assets").update({status:"OUT_OF_SERVICE",deleted_at:now,deleted_by:userId,updated_by:userId}).eq("id",id).eq("version",expectedVersion).is("deleted_at",null).select("id,asset_code,asset_type,status,usage_counter,version,metadata").maybeSingle();if(error)throw error;if(!data)throw new Error("El equipo cambió en otra sesión.");await history(client,{assetId:id,actorId:userId,message:`${data.asset_code} eliminado del inventario activo.`,previous:{deleted:false},next:{deleted:true}});return{ok:true,item:item(data)};}catch(error){return{ok:false,error:error instanceof Error?error.message:"No fue posible eliminar el equipo."};}
}
