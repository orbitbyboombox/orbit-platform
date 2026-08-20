"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export async function reviewStaffExpenseAction(form: FormData) {
  const client = await createSupabaseServerClient(), submissionId = String(form.get("submissionId") ?? ""), projectId = String(form.get("projectId") ?? ""), action = String(form.get("action") ?? ""), reason = String(form.get("reason") ?? "").trim();
  const { error } = await client.rpc("review_staff_expense_submission", { p_submission_id: submissionId, p_action: action, p_reason: reason || null });
  if (error) return { ok: false, message: error.message };
  for (const path of [`/projects/${projectId}`, `/projects/${projectId}/staff-expenses`, "/operations", "/finance", "/reports"]) revalidatePath(path);
  return { ok: true, message: action === "APPROVE" ? "Gasto aprobado y costo del Evento recalculado." : "Gasto rechazado sin impacto financiero." };
}
export async function staffExpenseReceiptUrlAction(path:string){const client=await createSupabaseServerClient();const{data:user}=await client.auth.getUser();if(!user.user)return{ok:false,message:"Sesión expirada."};const{data,error}=await client.storage.from("orbit-expenses").createSignedUrl(path,300);return error?{ok:false,message:error.message}:{ok:true,url:data.signedUrl};}
