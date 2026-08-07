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
import type { QuotationNegotiationInput } from "./types";
import { loadCompanySettings } from "@/features/company-settings";

type Result = { ok:true; message:string } | { ok:false; error:string };

export async function negotiateQuotationAction(input: QuotationNegotiationInput): Promise<Result> {
  try {
    const client = await createSupabaseServerClient();
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) throw authError ?? new Error("Inicia sesión para modificar la cotización.");
    const { data, error } = await client.rpc("negotiate_quotation", {
      p_quotation_id: input.quotationId,
      p_expected_version: input.expectedVersion,
      p_method: input.method,
      p_value: input.value,
      p_reason: input.reason?.trim() || null,
    });
    if (error) throw error;
    const result = data as { projectId: string; restored: boolean } | null;
    if (!result) throw new Error("No fue posible actualizar el precio.");
    revalidatePath(`/projects/${result.projectId}`);
    return { ok: true, message: result.restored ? "Precio oficial restaurado." : "Precio final actualizado." };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No fue posible actualizar el precio." };
  }
}

export async function approveQuotationAction(quotationId:string, reason="Aprobada por BOOMBOX"):Promise<Result> {
  try {
    const client=await createSupabaseServerClient(); const {data:auth,error:authError}=await client.auth.getUser();
    if(authError||!auth.user) throw authError??new Error("Inicia sesión para aprobar la cotización.");
    const admin=createAdminClient();
    const company=await loadCompanySettings(admin);
    const {data,error}=await admin.from("quotations").select("*,quotation_items(item_type,label,quantity,final_total),customers!inner(full_name,email),projects!inner(name,event_date,location,city)").eq("id",quotationId).single();
    if(error) throw error;
    if(data.status==="ACCEPTED"&&data.drive_file_id&&data.gmail_draft_id) return {ok:true,message:"La cotización ya está aprobada y preparada."};
    if(!["DRAFT","SENT","ACCEPTED"].includes(data.status)) throw new Error("La cotización no se puede aprobar en su estado actual.");
    if(!data.customers.email) throw new Error("El cliente necesita un correo para preparar el borrador.");
    const visibleItems=(data.quotation_items??[]) as Array<{item_type:string;label:string;quantity:number;final_total:number}>;
    const visibleTransport=visibleItems.filter((item)=>item.item_type==="TRANSPORT").reduce((sum,item)=>sum+Number(item.final_total),0);
    const customerItems=visibleItems.filter((item)=>item.item_type!=="TRANSPORT");
    const visibleSubtotal=customerItems.reduce((sum,item)=>sum+Number(item.final_total),0);
    const finalTotal=Number(data.final_customer_price??data.grand_total);
    const visibleTaxes=Math.max(0,finalTotal-visibleSubtotal-visibleTransport);
    const pdf=await createQuotationPdf({quotationNumber:data.quotation_number,issueDate:data.issue_date,expirationDate:data.expiration_date,customer:data.customers.full_name,project:data.projects.name,eventDate:data.projects.event_date,location:[data.projects.location,data.projects.city].filter(Boolean).join(", ")||"Por confirmar",subtotal:visibleSubtotal,transport:visibleTransport,taxes:visibleTaxes,total:finalTotal,items:customerItems.map((item)=>({label:item.label,quantity:Number(item.quantity),total:Number(item.final_total)})),branding:{productName:company.productName,productVersion:company.productVersion,brandName:company.brandName,developedBy:company.developedBy,poweredBy:company.poweredBy,footer:company.quotationFooter,currency:company.currency,locale:company.locale}});
    const pdfPath=`${data.project_id}/quotations/${data.quotation_number}.pdf`; const checksum=createHash("sha256").update(pdf).digest("hex");
    const storageResult=await admin.storage.from("orbit-documents").upload(pdfPath,pdf,{contentType:"application/pdf",upsert:true}); if(storageResult.error) throw storageResult.error;
    const token=await loadGoogleWorkspaceAccessToken(); const connection=await loadGoogleWorkspaceConnection();
    const drive=new GoogleDriveLive(connection,new GoogleDriveApiProvider(token),new SupabaseGoogleDriveFolderRepository(admin,data.project_id));
    const timestamp=new Date().toISOString(); const root=await drive.synchronizeFolderPlan(buildRootFolderPlan(company.driveRootFolder),timestamp); if(!root.ok) throw new Error(root.error.message);
    const folderSync=await drive.synchronizeFolderPlan(buildCustomerFolderPlan(data.customers.full_name,data.projects.event_date,company.driveRootFolder),timestamp); if(!folderSync.ok) throw new Error(folderSync.error.message);
    const quotationFolder=folderSync.folders.find((folder)=>folder.path.endsWith("/02 Cotizaciones")); if(!quotationFolder?.driveFolderId) throw new Error("No fue posible resolver la carpeta de cotizaciones.");
    let driveFileId=data.drive_file_id as string|null;
    if(!driveFileId) driveFileId=(await new GoogleDriveApiProvider(token).uploadFile({name:`${data.quotation_number} - ${data.customers.full_name}.pdf`,mimeType:"application/pdf",bytes:pdf,parentFolderId:quotationFolder.driveFolderId})).id;
    let draftId=data.gmail_draft_id as string|null; let messageId:string|undefined; let threadId:string|undefined;
    const quotationSubject=`Cotización ${data.quotation_number} · ${company.brandName}`;
    if(!draftId){const draft=await new GoogleGmailApiProvider(token).createDraft({to:data.customers.email,subject:quotationSubject,textBody:`Tu cotización ${company.brandName} está lista.`,htmlBody:`<p>Hola ${escapeHtml(data.customers.full_name)},</p><p>Tu cotización <strong>${escapeHtml(data.quotation_number)}</strong> está lista para revisión.</p><p>${escapeHtml(company.emailSignature)} confirmará el envío desde ${escapeHtml(company.productName)}.</p>`,driveFileIds:[driveFileId]});draftId=draft.draftId;messageId=draft.messageId;threadId=draft.threadId;}
    const {error:updateError}=await admin.from("quotations").update({status:"ACCEPTED",pdf_storage_path:pdfPath,drive_folder_id:quotationFolder.driveFolderId,drive_file_id:driveFileId,gmail_draft_id:draftId,approved_by:auth.user.id,approved_at:timestamp,approval_reason:reason,updated_by:auth.user.id}).eq("id",quotationId); if(updateError) throw updateError;
    const {data:profit}=await admin.from("profit_snapshots").select("id,operational_cost").eq("project_id",data.project_id).is("deleted_at",null).order("created_at",{ascending:false}).limit(1).maybeSingle();
    if(profit){const operationalCost=Number(profit.operational_cost);const grossMargin=finalTotal-operationalCost;const {error:profitError}=await admin.from("profit_snapshots").update({revenue:finalTotal,gross_margin:grossMargin,gross_margin_percent:finalTotal===0?0:grossMargin/finalTotal*100,approval_reason:"Cotización aceptada · precio final cliente",updated_by:auth.user.id}).eq("id",profit.id);if(profitError)throw profitError;}
    const { error: documentError } = await admin.from("documents").upsert({project_id:data.project_id,customer_id:data.customer_id,document_type:"QUOTATION",storage_bucket:"orbit-documents",storage_path:pdfPath,checksum,drive_file_id:driveFileId,created_by:auth.user.id},{onConflict:"storage_path"}); if(documentError) throw documentError;
    if(messageId) await admin.from("communications").insert({customer_id:data.customer_id,project_id:data.project_id,channel:"GMAIL",direction:"OUTBOUND",communication_type:"QUOTATION",thread_key:threadId,subject:quotationSubject,body:"Borrador Gmail preparado para confirmación interna.",status:"DRAFT",external_message_id:messageId,created_by:auth.user.id});
    for(const [action,message] of [["QUOTATION_ACCEPTED",`Cotización aprobada por ${company.brandName}.`],["QUOTATION_PDF_GENERATED","PDF final de cotización generado."],["QUOTATION_PDF_UPLOADED","Cotización almacenada en Google Drive."],["QUOTATION_GMAIL_DRAFT_CREATED","Borrador real de Gmail preparado."]] as const){const correlation=randomUUID();const {error:timelineError}=await admin.from("timeline_events").insert({customer_id:data.customer_id,project_id:data.project_id,event_type:action,title:message,description:message,orbit_event_id:data.orbit_event_id,actor_id:auth.user.id,actor_label:"Administrador",source:action.includes("GMAIL")?"Gmail":action.includes("UPLOADED")?"Drive":"Administrator",action,entity_type:"Quotation",entity_id:quotationId,human_message:message,correlation_id:correlation,created_by:auth.user.id});if(timelineError)throw timelineError;}
    revalidatePath(`/projects/${data.project_id}`); return {ok:true,message:"Cotización aprobada; PDF, Drive y borrador Gmail preparados."};
  }catch(error){return {ok:false,error:error instanceof Error?error.message:"No fue posible aprobar la cotización."};}
}

function escapeHtml(value:string){return value.replace(/[&<>"']/g,(character)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[character]!);}
