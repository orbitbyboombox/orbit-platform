"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CostMasterCategory } from "./types";

async function administratorContext() {
  const client = await createSupabaseServerClient();
  const { data: auth, error } = await client.auth.getUser();
  if (error || !auth.user) throw error ?? new Error("Sesión requerida.");
  const profile = await client.from("profiles").select("role").eq("id",auth.user.id).maybeSingle();
  if (profile.error) throw profile.error;
  if (!["CEO","ADMINISTRATOR"].includes(profile.data?.role ?? "")) throw new Error("Esta acción requiere permisos de Administrador.");
  return { client, userId:auth.user.id };
}

const validNumber=(value:number|null,name:string)=>{if(value!==null&&(!Number.isFinite(value)||value<0))throw new Error(`${name} debe ser un valor positivo.`);};

export async function updateCostMasterAction(input:{id:string;expectedVersion:number;amount:number|null;quantity:number|null;enabled:boolean;description:string;reason:string}) {
  try {
    if(!input.reason.trim())throw new Error("La razón del cambio es obligatoria.");
    validNumber(input.amount,"El costo");validNumber(input.quantity,"La cantidad");
    const {client,userId}=await administratorContext();
    const current=await client.from("cost_master_entries").select("code,metadata").eq("id",input.id).eq("version",input.expectedVersion).is("deleted_at",null).maybeSingle();
    if(current.error)throw current.error;if(!current.data)throw new Error("El costo cambió en otra sesión. Recarga la página.");
    if(current.data.code==="PAPER_BOX_COST"&&(!input.amount||!input.quantity))throw new Error("El costo de caja y las fotos por caja deben ser mayores que cero.");
    const paperAmount=input.amount;const paperQuantity=input.quantity;
    const update=await client.from("cost_master_entries").update({amount:input.amount,quantity:input.quantity,enabled:input.enabled,metadata:{...(current.data.metadata??{}),description:input.description.trim()},approval_reason:input.reason.trim(),updated_by:userId}).eq("id",input.id).eq("version",input.expectedVersion).is("deleted_at",null).select("code").maybeSingle();
    if(update.error)throw update.error;if(!update.data)throw new Error("El costo cambió en otra sesión. Recarga la página.");
    if(update.data.code==="PAPER_BOX_COST"){
      if(paperAmount===null||paperQuantity===null)throw new Error("No fue posible recalcular el costo por foto.");
      const derived=await client.from("cost_master_entries").update({amount:paperAmount/paperQuantity,approval_reason:"Recalculado automáticamente desde caja de papel",updated_by:userId}).eq("code","COST_PER_PHOTO").is("deleted_at",null);
      if(derived.error)throw derived.error;
    }
    revalidatePath("/settings");return{ok:true as const};
  }catch(error){return{ok:false as const,error:error instanceof Error?error.message:"No fue posible actualizar el costo."};}
}

export async function createOtherCostAction(input:{label:string;amount:number;unit:string;reason:string}) {
  try {
    if(!input.label.trim()||!input.unit.trim()||!input.reason.trim())throw new Error("Completa nombre, unidad y razón del cambio.");
    validNumber(input.amount,"El costo");const{client,userId}=await administratorContext();
    const code=`OTHER_${crypto.randomUUID().replaceAll("-","").slice(0,12).toUpperCase()}`;
    const result=await client.from("cost_master_entries").insert({category:"OTHER" satisfies CostMasterCategory,code,label:input.label.trim(),amount:input.amount,quantity:1,unit:input.unit.trim().toUpperCase(),enabled:true,display_order:1000,approval_reason:input.reason.trim(),created_by:userId,updated_by:userId});
    if(result.error)throw result.error;revalidatePath("/settings");return{ok:true as const};
  }catch(error){return{ok:false as const,error:error instanceof Error?error.message:"No fue posible crear el costo."};}
}

export async function deleteOtherCostAction(input:{id:string;expectedVersion:number;reason:string}) {
  try {
    if(!input.reason.trim())throw new Error("La razón del cambio es obligatoria.");const{client,userId}=await administratorContext();
    const deletedAt=new Date().toISOString();const result=await client.from("cost_master_entries").update({enabled:false,deleted_at:deletedAt,deleted_by:userId,approval_reason:input.reason.trim(),updated_by:userId}).eq("id",input.id).eq("version",input.expectedVersion).eq("category","OTHER").is("deleted_at",null).select("id").maybeSingle();
    if(result.error)throw result.error;if(!result.data)throw new Error("El costo cambió en otra sesión. Recarga la página.");revalidatePath("/settings");return{ok:true as const};
  }catch(error){return{ok:false as const,error:error instanceof Error?error.message:"No fue posible eliminar el costo."};}
}
