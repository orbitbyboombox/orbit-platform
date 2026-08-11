"use server";
import{revalidatePath}from"next/cache";
import{createSupabaseServerActionClient}from"@/lib/supabase/server";
export async function repairFinancialIntegrityAction(data:FormData){try{const reason=String(data.get("reason")??"").trim();const client=await createSupabaseServerActionClient();const{error}=await client.rpc("repair_financial_integrity",{p_reason:reason});if(error)throw error;revalidatePath("/settings");revalidatePath("/operations");revalidatePath("/finance");revalidatePath("/reports");return{ok:true,message:"Sincronización reparada y validada."};}catch(error){return{ok:false,message:error instanceof Error?error.message:"No fue posible reparar la sincronización."};}}
