"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildCustomerFolderPlan, buildRootFolderPlan } from "@/features/connectors/google-drive";
import { GoogleDriveLive } from "@/features/connectors/google-drive/application/google-drive-live";
import { GoogleDriveApiProvider } from "@/features/connectors/google-drive/provider/google-drive-live.provider";
import { SupabaseGoogleDriveFolderRepository } from "@/features/connectors/google-drive/repository/google-drive-folder.repository";
import { GoogleGmailApiProvider } from "@/features/connectors/google-gmail/provider/google-gmail-live.provider";
import { loadGoogleWorkspaceAccessToken, loadGoogleWorkspaceConnection } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import { createQuotationPdf } from "./quotation-pdf";

type Result = { ok:true; message:string } | { ok:false; error:string };

export async function approveQuotationAction(quotationId:string, reason="Aprobada por BOOMBOX"):Promise<Result> {
  try {
    const client=await createSupabaseServerClient(); const {data:auth,error:authError}=await client.auth.getUser();
    if(authError||!auth.user) throw authError??new Error("Inicia sesión para aprobar la cotización.");
    const admin=createAdminClient();
    const {data,error}=await admin.from("quotations").select("*,quotation_items(label,quantity,total),customers!inner(full_name,email),projects!inner(name,event_date,location,city)").eq("id",quotationId).single();
    if(error) throw error;
    if(data.status==="ACCEPTED"&&data.drive_file_id&&data.gmail_draft_id) return {ok:true,message:"La cotización ya está aprobada y preparada."};
    if(!["DRAFT","SENT","ACCEPTED"].includes(data.status)) throw new Error("La cotización no se puede aprobar en su estado actual.");
    if(!data.customers.email) throw new Error("El cliente necesita un correo para preparar el borrador.");
    const pdf=await createQuotationPdf({quotationNumber:data.quotation_number,issueDate:data.issue_date,expirationDate:data.expiration_date,customer:data.customers.full_name,project:data.projects.name,eventDate:data.projects.event_date,location:[data.projects.location,data.projects.city].filter(Boolean).join(", ")||"Por confirmar",subtotal:Number(data.subtotal),transport:Number(data.transport_total),taxes:Number(data.tax_total),total:Number(data.grand_total),items:(data.quotation_items??[]).map((item:{label:string;quantity:number;total:number})=>({label:item.label,quantity:Number(item.quantity),total:Number(item.total)}))});
    const pdfPath=`${data.project_id}/quotations/${data.quotation_number}.pdf`; const checksum=createHash("sha256").update(pdf).digest("hex");
    const storageResult=await admin.storage.from("orbit-documents").upload(pdfPath,pdf,{contentType:"application/pdf",upsert:true}); if(storageResult.error) throw storageResult.error;
    const token=await loadGoogleWorkspaceAccessToken(); const connection=await loadGoogleWorkspaceConnection();
    const drive=new GoogleDriveLive(connection,new GoogleDriveApiProvider(token),new SupabaseGoogleDriveFolderRepository(admin,data.project_id));
    const timestamp=new Date().toISOString(); const root=await drive.synchronizeFolderPlan(buildRootFolderPlan(),timestamp); if(!root.ok) throw new Error(root.error.message);
    const folderSync=await drive.synchronizeFolderPlan(buildCustomerFolderPlan(data.customers.full_name,data.projects.event_date),timestamp); if(!folderSync.ok) throw new Error(folderSync.error.message);
    const quotationFolder=folderSync.folders.find((folder)=>folder.path.endsWith("/02 Cotizaciones")); if(!quotationFolder?.driveFolderId) throw new Error("No fue posible resolver la carpeta de cotizaciones.");
    let driveFileId=data.drive_file_id as string|null;
    if(!driveFileId) driveFileId=(await new GoogleDriveApiProvider(token).uploadFile({name:`${data.quotation_number} - ${data.customers.full_name}.pdf`,mimeType:"application/pdf",bytes:pdf,parentFolderId:quotationFolder.driveFolderId})).id;
    let draftId=data.gmail_draft_id as string|null; let messageId:string|undefined; let threadId:string|undefined;
    if(!draftId){const draft=await new GoogleGmailApiProvider(token).createDraft({to:data.customers.email,subject:`Cotización ${data.quotation_number} · BOOMBOX`,textBody:"Tu cotización BOOMBOX está lista.",htmlBody:`<p>Hola ${escapeHtml(data.customers.full_name)},</p><p>Tu cotización <strong>${escapeHtml(data.quotation_number)}</strong> está lista para revisión.</p><p>BOOMBOX confirmará el envío desde ORBIT.</p>`,driveFileIds:[driveFileId]});draftId=draft.draftId;messageId=draft.messageId;threadId=draft.threadId;}
    const {error:updateError}=await admin.from("quotations").update({status:"ACCEPTED",pdf_storage_path:pdfPath,drive_folder_id:quotationFolder.driveFolderId,drive_file_id:driveFileId,gmail_draft_id:draftId,approved_by:auth.user.id,approved_at:timestamp,approval_reason:reason,updated_by:auth.user.id}).eq("id",quotationId); if(updateError) throw updateError;
    const { error: documentError } = await admin.from("documents").upsert({project_id:data.project_id,customer_id:data.customer_id,document_type:"QUOTATION",storage_bucket:"orbit-documents",storage_path:pdfPath,checksum,drive_file_id:driveFileId,created_by:auth.user.id},{onConflict:"storage_path"}); if(documentError) throw documentError;
    if(messageId) await admin.from("communications").insert({customer_id:data.customer_id,project_id:data.project_id,channel:"GMAIL",direction:"OUTBOUND",communication_type:"QUOTATION",thread_key:threadId,subject:`Cotización ${data.quotation_number} · BOOMBOX`,body:"Borrador Gmail preparado para confirmación interna.",status:"DRAFT",external_message_id:messageId,created_by:auth.user.id});
    for(const [action,message] of [["QUOTATION_ACCEPTED","Cotización aprobada por BOOMBOX."],["QUOTATION_PDF_GENERATED","PDF final de cotización generado."],["QUOTATION_PDF_UPLOADED","Cotización almacenada en Google Drive."],["QUOTATION_GMAIL_DRAFT_CREATED","Borrador real de Gmail preparado."]] as const){const correlation=randomUUID();const {error:timelineError}=await admin.from("timeline_events").insert({customer_id:data.customer_id,project_id:data.project_id,event_type:action,title:message,description:message,orbit_event_id:data.orbit_event_id,actor_id:auth.user.id,actor_label:"Administrador",source:action.includes("GMAIL")?"Gmail":action.includes("UPLOADED")?"Drive":"Administrator",action,entity_type:"Quotation",entity_id:quotationId,human_message:message,correlation_id:correlation,created_by:auth.user.id});if(timelineError)throw timelineError;}
    revalidatePath(`/projects/${data.project_id}`); return {ok:true,message:"Cotización aprobada; PDF, Drive y borrador Gmail preparados."};
  }catch(error){return {ok:false,error:error instanceof Error?error.message:"No fue posible aprobar la cotización."};}
}

function escapeHtml(value:string){return value.replace(/[&<>"']/g,(character)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[character]!);}
