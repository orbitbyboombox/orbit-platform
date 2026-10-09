"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerActionClient } from "@/lib/supabase/server";

export async function transferPaperFromWarehouse(formData: FormData): Promise<{ok:true;duplicate:boolean}|{ok:false;error:string}> {
 try {
  const client=await createSupabaseServerActionClient();
  const {data:auth}=await client.auth.getUser();
  if(!auth.user) throw new Error("Sesión requerida.");
  const supplyId=String(formData.get("supplyId")??"");
  const boxId=String(formData.get("boxId")??"");
  const quantity=Number(formData.get("quantity"));
  const reason=String(formData.get("reason")??"").trim();
  const idempotencyKey=String(formData.get("idempotencyKey")??"");
  if(!supplyId||!boxId||!Number.isSafeInteger(quantity)||quantity<=0||quantity%700!==0||reason.length<4||!idempotencyKey) throw new Error("Completa caja, cantidad y motivo.");
  const {data,error}=await client.rpc("transfer_warehouse_paper_to_box",{p_supply_id:supplyId,p_box_asset_id:boxId,p_quantity:quantity,p_reason:reason,p_idempotency_key:idempotencyKey});
  if(error) throw error;
  revalidatePath("/resources/boxes");
  revalidatePath("/resources/boxes/warehouse");
  return {ok:true,duplicate:Boolean(data?.duplicate)};
 } catch(error) {return {ok:false,error:error instanceof Error?error.message:"No fue posible transferir papel."};}
}

export async function receivePaperInWarehouse(formData: FormData): Promise<{ok:true}|{ok:false;error:string}> {
 try {
  const client=await createSupabaseServerActionClient();
  const {data:auth}=await client.auth.getUser();
  if(!auth.user) throw new Error("Sesión requerida.");
  const supplyId=String(formData.get("supplyId")??"");
  const quantity=Number(formData.get("quantity"));
  const reference=String(formData.get("reference")??"").trim();
  const rawCost=String(formData.get("unitCost")??"").trim();
  const unitCost=rawCost===""?null:Number(rawCost);
  const key=String(formData.get("idempotencyKey")??"");
  if(!supplyId||!Number.isSafeInteger(quantity)||quantity<=0||quantity%700!==0||reference.length<4||!key||(unitCost!==null&&(!Number.isFinite(unitCost)||unitCost<0)))throw new Error("Ingresa cantidad, referencia y costo válidos.");
  const {error}=await client.rpc("receive_warehouse_paper",{p_supply_id:supplyId,p_quantity:quantity,p_reference:reference,p_unit_cost:unitCost,p_idempotency_key:key});
  if(error)throw error;
  revalidatePath("/resources/boxes/warehouse");
  return {ok:true};
 }catch(error){return {ok:false,error:error instanceof Error?error.message:"No fue posible registrar el ingreso."};}
}
