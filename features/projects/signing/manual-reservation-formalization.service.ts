import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCompanySettings } from "@/features/company-settings";
import { createCustomerPortalAccess } from "@/features/customer-portal/customer-portal.service";
import { uploadReservationDocumentToDrive } from "@/features/connectors/google-drive/application/google-drive-document-routing.service";
import { confirmDigitalSignature } from "./digital-signature.service";
import { createSignedAgreementPdf } from "./signed-agreement-pdf";
import type { ProjectDraft } from "../types/project";

const sha256=(value:string|Uint8Array)=>createHash("sha256").update(value).digest("hex");

export async function formalizeManualReservation(input:{projectId:string;actorId:string;formalization:NonNullable<ProjectDraft["commercialFormalization"]>}){
  const admin=createAdminClient();
  const {data:project,error}=await admin.from("projects").select("id,name,customer_id,event_date,event_time,location,city,operations,customers!inner(full_name,email,rut,phone),project_services(service_code,duration_hours,extras),quotations(quotation_number,final_customer_price)").eq("id",input.projectId).single();
  if(error)throw error;
  const customer=Array.isArray(project.customers)?project.customers[0]:project.customers;
  const quotation=Array.isArray(project.quotations)?project.quotations[0]:project.quotations;
  const agreementId=randomUUID();
  const rendered={formalization:input.formalization.type,documentType:input.formalization.documentType,quotationNumber:quotation?.quotation_number??"Sin cotización",termsAccepted:input.formalization.requiresSignature};
  const {error:agreementError}=await admin.from("agreements").insert({id:agreementId,project_id:project.id,status:"SENT",template_version:"RC-16",rendered_contract:rendered,created_by:input.actorId,updated_by:input.actorId});
  if(agreementError)throw agreementError;

  if(input.formalization.requiresSignature){
    if(!input.formalization.signatureDataUrl)throw new Error("La firma del contrato es obligatoria.");
    const token=randomBytes(32).toString("base64url");
    const {error:tokenError}=await admin.from("agreement_signing_tokens").insert({agreement_id:agreementId,token_hash:sha256(token),expires_at:new Date(Date.now()+15*60_000).toISOString(),created_by:input.actorId});
    if(tokenError)throw tokenError;
    return confirmDigitalSignature({token,signatureDataUrl:input.formalization.signatureDataUrl,ipAddress:"internal-manual-reservation",userAgent:"ORBIT Manual Reservation"});
  }

  const [company,portal]=await Promise.all([loadCompanySettings(admin),createCustomerPortalAccess(project.id,input.actorId)]);
  const services=project.project_services??[]; const operations=project.operations&&typeof project.operations==="object"?project.operations as Record<string,unknown>:{};
  const verificationCode=sha256(`${agreementId}:${input.formalization.type}`).slice(0,24).toUpperCase();
  const pdf=await createSignedAgreementPdf({quotationNumber:quotation?.quotation_number??"Sin cotización",customer:customer.full_name,customerRut:customer.rut??"Por confirmar",customerEmail:customer.email,customerPhone:customer.phone??"Por confirmar",event:project.name,eventDate:project.event_date,eventTime:project.event_time?.slice(0,5)??"Por confirmar",services:services.map(item=>item.service_code).join(", ")||"Por confirmar",hours:services.map(item=>item.duration_hours?`${item.duration_hours} horas`:"").filter(Boolean).join(", ")||"Por confirmar",extras:services.flatMap(item=>Array.isArray(item.extras)?item.extras:[]).join(", ")||"Sin extras",finalCustomerPrice:Number(quotation?.final_customer_price??0),venue:project.location??"Por confirmar",address:String(operations.eventAddress??project.city??"Por confirmar"),operationalContact:String(operations.operationalContact??"Equipo BOOMBOX"),agreementVersion:"RC-16",verificationCode,portalUrl:portal.url,documentMode:"COMMERCIAL_DOCUMENT",branding:{productName:company.productName,productVersion:company.productVersion,brandName:company.brandName,poweredBy:company.poweredBy,footer:company.contractFooter,currency:company.currency,locale:company.locale,timezone:company.timezone}});
  const path=`${project.id}/${agreementId}/documento-con-factura.pdf`;
  const [storage,drive]=await Promise.all([admin.storage.from("orbit-documents").upload(path,pdf,{contentType:"application/pdf",upsert:false}),uploadReservationDocumentToDrive({client:admin,projectId:project.id,customerName:customer.full_name,eventDate:project.event_date,kind:"CONTRACT",name:`Documento con Factura - ${project.name}.pdf`,mimeType:"application/pdf",bytes:pdf})]);
  if(storage.error)throw storage.error;
  const [agreementWrite,documentWrite,timelineWrite]=await Promise.all([
    admin.from("agreements").update({status:"COMMERCIAL_DOCUMENT",signed_pdf_path:path,drive_file_id:drive.id,locked_at:new Date().toISOString(),updated_by:input.actorId}).eq("id",agreementId),
    admin.from("documents").insert({project_id:project.id,customer_id:project.customer_id,document_type:"COMMERCIAL_DOCUMENT",storage_bucket:"orbit-documents",storage_path:path,checksum:sha256(pdf),drive_file_id:drive.id,created_by:input.actorId}),
    admin.from("timeline_events").insert({customer_id:project.customer_id,project_id:project.id,event_type:"COMMERCIAL_DOCUMENT_GENERATED",title:"Documento comercial oficial generado.",description:`Formalización ${input.formalization.type} sin firma.`,actor_id:input.actorId,actor_label:"Administrador",source:"Administrator",action:"COMMERCIAL_DOCUMENT_GENERATED",entity_type:"Agreement",entity_id:agreementId,human_message:"Documento con Factura generado y almacenado.",correlation_id:`commercial-document:${agreementId}`,created_by:input.actorId}),
  ]);
  for(const result of [agreementWrite,documentWrite,timelineWrite])if(result.error)throw result.error;
  return portal;
}
