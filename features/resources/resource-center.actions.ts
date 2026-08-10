"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ResourceCategory = "EQUIPMENT" | "VEHICLES" | "CONSUMABLES" | "OPERATORS" | "ASSISTANTS" | "ACCESSORIES";
export type ResourceSource = "ASSET" | "SUPPLY" | "STAFF";
export interface OperationalResource { id:string; source:ResourceSource; category:ResourceCategory; name:string; code:string; status:string; enabled:boolean; version:number; }
type Result={ok:true;item:OperationalResource}|{ok:false;error:string};
const categories:readonly ResourceCategory[]=["EQUIPMENT","VEHICLES","CONSUMABLES","OPERATORS","ASSISTANTS","ACCESSORIES"];
const value=(data:FormData,key:string)=>String(data.get(key)??"").trim();

async function context(){
  const client=await createSupabaseServerClient();
  const{data,error}=await client.auth.getUser();
  if(error||!data.user)throw new Error("Tu sesión no está disponible.");
  const{data:profile,error:profileError}=await client.from("profiles").select("role").eq("id",data.user.id).single();
  if(profileError)throw profileError;
  if(!["CEO","ADMINISTRATOR"].includes(profile.role))throw new Error("Solo Administración puede gestionar recursos.");
  return{client,userId:data.user.id};
}

function sourceFor(category:ResourceCategory):ResourceSource{return category==="CONSUMABLES"?"SUPPLY":category==="OPERATORS"||category==="ASSISTANTS"?"STAFF":"ASSET";}
function asset(row:{id:string;asset_code:string;status:string;version:number;metadata:unknown},category:ResourceCategory):OperationalResource{const metadata=(row.metadata??{})as Record<string,unknown>;return{id:row.id,source:"ASSET",category,name:typeof metadata.name==="string"?metadata.name:row.asset_code,code:row.asset_code,status:row.status,enabled:row.status!=="OUT_OF_SERVICE",version:row.version};}
function supply(row:{id:string;catalog_code:string;name:string;status:string;version:number}):OperationalResource{return{id:row.id,source:"SUPPLY",category:"CONSUMABLES",name:row.name,code:row.catalog_code,status:row.status,enabled:row.status!=="INACTIVE",version:row.version};}
function staff(row:{id:string;first_name:string;last_name:string;rut:string|null;role:string;status:string;version:number}):OperationalResource{return{id:row.id,source:"STAFF",category:row.role==="OPERATOR"?"OPERATORS":"ASSISTANTS",name:`${row.first_name} ${row.last_name}`.trim(),code:row.rut??row.id,status:row.status,enabled:row.status==="ACTIVE",version:row.version};}
function names(name:string){const parts=name.trim().split(/\s+/);return{firstName:parts.shift()??name,lastName:parts.join(" ")||"BOOMBOX"};}
function friendly(error:unknown,fallback:string){const message=error instanceof Error?error.message:"";if(message.includes("duplicate")||message.includes("unique"))return"Ya existe un recurso con ese código.";return message&&!["JSON","violates","column","schema"].some((word)=>message.includes(word))?message:fallback;}

export async function createResourceAction(formData:FormData):Promise<Result>{
  try{
    const{client,userId}=await context();const category=value(formData,"category")as ResourceCategory;const name=value(formData,"name");const code=value(formData,"code").toUpperCase();
    if(!categories.includes(category)||!name||!code)throw new Error("Completa nombre, código y categoría.");
    const source=sourceFor(category);
    if(source==="ASSET"){
      const assetType=category==="VEHICLES"?"VEHICLE":"ACCESSORY";
      const{data,error}=await client.from("operational_assets").insert({asset_code:code,asset_type:assetType,status:"AVAILABLE",qr_key:`orbit:asset:${code}`,metadata:{name,resourceCategory:category},created_by:userId,updated_by:userId}).select("id,asset_code,status,version,metadata").single();if(error)throw error;return{ok:true,item:asset(data,category)};
    }
    if(source==="SUPPLY"){
      const{data,error}=await client.from("supplies").insert({catalog_code:code,name,purchase_price:0,vat_included:true,unit:"unidad",calculation_method:"UNIT",status:"ACTIVE",metadata:{resourceCategory:category},created_by:userId,updated_by:userId}).select("id,catalog_code,name,status,version").single();if(error)throw error;return{ok:true,item:supply(data)};
    }
    const parsed=names(name);const role=category==="OPERATORS"?"OPERATOR":"INSTALLATION";const operationalGroup=category==="OPERATORS"?"GREEN":"CALYPSO";const capabilities=category==="OPERATORS"?["OPERATOR"]:["ASSEMBLY","DISASSEMBLY"];
    const{data,error}=await client.from("staff").insert({first_name:parsed.firstName,last_name:parsed.lastName,rut:code,role,status:"ACTIVE",rates:{},availability:{},operational_group:operationalGroup,capabilities,specializations:[],created_by:userId,updated_by:userId}).select("id,first_name,last_name,rut,role,status,version").single();if(error)throw error;return{ok:true,item:staff(data)};
  }catch(error){return{ok:false,error:friendly(error,"No fue posible agregar el recurso.")};}
}

export async function updateResourceAction(formData:FormData):Promise<Result>{
  try{
    const{client,userId}=await context();const id=value(formData,"id");const source=value(formData,"source")as ResourceSource;const category=value(formData,"category")as ResourceCategory;const name=value(formData,"name");const code=value(formData,"code").toUpperCase();const version=Number(formData.get("version"));
    if(!id||!name||!code||!categories.includes(category))throw new Error("Revisa los datos del recurso.");
    if(sourceFor(category)!==source)throw new Error("Para cambiar de tipo de recurso, crea un registro nuevo.");
    if(source==="ASSET"){
      const{data:current,error:readError}=await client.from("operational_assets").select("metadata").eq("id",id).single();if(readError)throw readError;
      const assetType=category==="VEHICLES"?"VEHICLE":"ACCESSORY";const{data,error}=await client.from("operational_assets").update({asset_code:code,asset_type:assetType,qr_key:`orbit:asset:${code}`,metadata:{...((current.metadata??{})as Record<string,unknown>),name,resourceCategory:category},updated_by:userId}).eq("id",id).eq("version",version).is("deleted_at",null).select("id,asset_code,status,version,metadata").maybeSingle();if(error)throw error;if(!data)throw new Error("El recurso cambió en otra sesión.");return{ok:true,item:asset(data,category)};
    }
    if(source==="SUPPLY"){
      const{data,error}=await client.from("supplies").update({catalog_code:code,name,updated_by:userId}).eq("id",id).eq("version",version).is("deleted_at",null).select("id,catalog_code,name,status,version").maybeSingle();if(error)throw error;if(!data)throw new Error("El recurso cambió en otra sesión.");return{ok:true,item:supply(data)};
    }
    const parsed=names(name);const role=category==="OPERATORS"?"OPERATOR":"INSTALLATION";const operational_group=category==="OPERATORS"?"GREEN":"CALYPSO";const capabilities=category==="OPERATORS"?["OPERATOR"]:["ASSEMBLY","DISASSEMBLY"];
    const{data,error}=await client.from("staff").update({first_name:parsed.firstName,last_name:parsed.lastName,rut:code,role,operational_group,capabilities,updated_by:userId,approval_reason:"Recurso actualizado desde Centro de Recursos"}).eq("id",id).eq("version",version).is("deleted_at",null).select("id,first_name,last_name,rut,role,status,version").maybeSingle();if(error)throw error;if(!data)throw new Error("El recurso cambió en otra sesión.");return{ok:true,item:staff(data)};
  }catch(error){return{ok:false,error:friendly(error,"No fue posible editar el recurso.")};}
}

export async function setResourceEnabledAction(item:OperationalResource,enabled:boolean):Promise<Result>{
  try{
    const{client,userId}=await context();
    if(item.source==="ASSET"){const status=enabled?"AVAILABLE":"OUT_OF_SERVICE";const{data,error}=await client.from("operational_assets").update({status,updated_by:userId}).eq("id",item.id).eq("version",item.version).is("deleted_at",null).select("id,asset_code,status,version,metadata").maybeSingle();if(error)throw error;if(!data)throw new Error("El recurso cambió en otra sesión.");return{ok:true,item:asset(data,item.category)};}
    if(item.source==="SUPPLY"){const status=enabled?"ACTIVE":"INACTIVE";const{data,error}=await client.from("supplies").update({status,updated_by:userId,approval_reason:enabled?"Recurso habilitado":"Recurso deshabilitado"}).eq("id",item.id).eq("version",item.version).is("deleted_at",null).select("id,catalog_code,name,status,version").maybeSingle();if(error)throw error;if(!data)throw new Error("El recurso cambió en otra sesión.");return{ok:true,item:supply(data)};}
    const status=enabled?"ACTIVE":"INACTIVE";const{data,error}=await client.from("staff").update({status,updated_by:userId,approval_reason:enabled?"Recurso habilitado":"Recurso deshabilitado"}).eq("id",item.id).eq("version",item.version).is("deleted_at",null).select("id,first_name,last_name,rut,role,status,version").maybeSingle();if(error)throw error;if(!data)throw new Error("El recurso cambió en otra sesión.");return{ok:true,item:staff(data)};
  }catch(error){return{ok:false,error:friendly(error,"No fue posible cambiar el estado del recurso.")};}
}

export async function deleteResourceAction(item:OperationalResource):Promise<{ok:true}|{ok:false;error:string}>{
  try{
    const{client,userId}=await context();const patch={deleted_at:new Date().toISOString(),deleted_by:userId,updated_by:userId};
    const table=item.source==="ASSET"?"operational_assets":item.source==="SUPPLY"?"supplies":"staff";
    const payload=item.source==="ASSET"?patch:{...patch,approval_reason:"Eliminado desde Centro de Recursos"};
    const{data,error}=await client.from(table).update(payload).eq("id",item.id).eq("version",item.version).is("deleted_at",null).select("id").maybeSingle();if(error)throw error;if(!data)throw new Error("El recurso cambió en otra sesión.");return{ok:true};
  }catch(error){return{ok:false,error:friendly(error,"No fue posible eliminar el recurso.")};}
}
