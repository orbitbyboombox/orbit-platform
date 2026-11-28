"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export async function reviewStaffExpenseAction(form: FormData) {
  const client = await createSupabaseServerClient(), submissionId = String(form.get("submissionId") ?? ""), projectId = String(form.get("projectId") ?? ""), action = String(form.get("action") ?? ""), reason = String(form.get("reason") ?? "").trim();
  console.info(JSON.stringify({event:"staff_expense_review_started",submissionId,projectId,action}));
  const { error } = await client.rpc("review_staff_expense_submission", { p_submission_id: submissionId, p_action: action, p_reason: reason || null });
  if (error) {
    console.error(JSON.stringify({event:"staff_expense_review_failed",submissionId,projectId,action,code:error.code,message:error.message}));
    return { ok: false, message: error.message };
  }
  for (const path of [`/projects/${projectId}`, `/projects/${projectId}/staff-expenses`, "/resources/staff", "/operations", "/notifications", "/finance", "/reports", "/staff-portal"]) revalidatePath(path);
  revalidatePath("/", "layout");
  console.info(JSON.stringify({event:"staff_expense_review_completed",submissionId,projectId,action}));
  return { ok: true, message: action === "APPROVE" ? "Gasto aprobado y costo del Evento recalculado." : "Gasto rechazado sin impacto financiero." };
}
export async function staffExpenseReceiptUrlAction(path:string){const client=await createSupabaseServerClient();const{data:user}=await client.auth.getUser();if(!user.user)return{ok:false,message:"Sesión expirada."};const{data,error}=await client.storage.from("orbit-expenses").createSignedUrl(path,300);return error?{ok:false,message:error.message}:{ok:true,url:data.signedUrl};}
export async function cancelStaffExpenseAction(form:FormData){
  const submissionId=String(form.get("submissionId")??""), reason=String(form.get("reason")??"").trim();
  if(reason.length<3)return{ok:false,message:"El motivo de anulación es obligatorio."};
  const client=await createSupabaseServerClient();
  const{data,error}=await client.rpc("cancel_staff_expense_submission",{p_submission_id:submissionId,p_reason:reason});
  if(error){console.error(JSON.stringify({event:"staff_reimbursement_cancel_failed",submissionId,code:error.code,message:error.message}));return{ok:false,message:error.message};}
  revalidatePath("/resources/staff");revalidatePath("/staff-portal");revalidatePath("/finance");revalidatePath("/notifications");
  console.info(JSON.stringify({event:"staff_reimbursement_cancel_completed",submissionId,result:data}));
  return{ok:true,message:"Reembolso anulado y excluido del saldo pendiente."};
}
