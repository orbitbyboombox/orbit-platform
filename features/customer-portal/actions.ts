"use server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCustomerPortal } from "./customer-portal.service";

export async function submitPortalRequestAction(input:{token:string;type:"MESSAGE"|"QUESTION"|"ADDITIONAL_SERVICE"|"DESIGN_COMMENT";subject?:string;message:string;requestedCode?:string}) {
  try {
    if(!input.message.trim()) throw new Error("Escribe tu solicitud antes de enviarla.");
    const portal=await loadCustomerPortal(input.token); if(!portal) throw new Error("Este enlace ya no está disponible.");
    const admin=createAdminClient(); const correlationId=crypto.randomUUID();
    const {data:request,error}=await admin.from("customer_portal_requests").insert({project_id:portal.access.project_id,customer_id:portal.access.customer_id,request_type:input.type,subject:input.subject?.trim()||null,message:input.message.trim(),requested_code:input.requestedCode||null,correlation_id:correlationId}).select("id").single(); if(error)throw error;
    const human=input.type==="ADDITIONAL_SERVICE"?"El cliente solicitó revisar un servicio adicional.":"El cliente envió un mensaje desde su portal.";
    const results=await Promise.all([
      admin.from("timeline_events").insert({customer_id:portal.access.customer_id,project_id:portal.access.project_id,event_type:"CUSTOMER_PORTAL_REQUEST",title:human,description:input.message.trim(),orbit_event_id:portal.project.orbit_event_id,actor_label:"Cliente",source:"Customer",action:input.type,entity_type:"CustomerPortalRequest",entity_id:request.id,human_message:human,correlation_id:correlationId,reason:input.subject?.trim()||null}),
      admin.from("internal_notifications").insert({project_id:portal.access.project_id,customer_id:portal.access.customer_id,notification_type:input.type,title:human,message:input.message.trim(),correlation_id:correlationId,category:"CUSTOMER",priority:input.type==="ADDITIONAL_SERVICE"?"HIGH":"NORMAL",action_required:true,entity_type:"CustomerPortalRequest",entity_id:request.id,related_href:`/projects/${portal.access.project_id}`}),
    ]); const failure=results.find(result=>result.error); if(failure?.error)throw failure.error;
    return {ok:true as const,message:"Tu solicitud fue enviada a BOOMBOX."};
  } catch(error){return {ok:false as const,error:error instanceof Error?error.message:"No fue posible enviar tu solicitud."};}
}

export async function respondToDesignAction(input:{token:string;decision:"APPROVE"|"REQUEST_CHANGES";comment:string}) {
  try {
    if(input.decision==="REQUEST_CHANGES"&&!input.comment.trim())throw new Error("Cuéntanos qué cambios necesitas.");
    const portal=await loadCustomerPortal(input.token);if(!portal)throw new Error("Este enlace ya no está disponible.");
    const designs=portal.documents.filter(document=>document.document_type==="DESIGN");const current=designs.at(-1);if(!current)throw new Error("Aún no existe un diseño disponible para revisar.");
    const admin=createAdminClient();const now=new Date().toISOString();const approved=input.decision==="APPROVE";const action=approved?"DESIGN_APPROVED":"DESIGN_CHANGES_REQUESTED";const message=approved?"El cliente aprobó el diseño.":input.comment.trim();
    const {data:stored,error:storedError}=await admin.from("projects").select("operations").eq("id",portal.access.project_id).single();if(storedError)throw storedError;const operations=(stored.operations??{}) as Record<string,unknown>;
    const {error:updateError}=await admin.from("projects").update({operations:{...operations,designStatus:approved?"APPROVED":"CHANGES_REQUESTED",designApprovedAt:approved?now:null,designDocumentId:current.id}}).eq("id",portal.access.project_id);if(updateError)throw updateError;
    const correlation=crypto.randomUUID();const {data:request,error:requestError}=await admin.from("customer_portal_requests").insert({project_id:portal.access.project_id,customer_id:portal.access.customer_id,request_type:"DESIGN_COMMENT",subject:approved?"Diseño aprobado":"Cambios solicitados",message,requested_code:current.id,correlation_id:correlation}).select("id").single();if(requestError)throw requestError;
    const results=await Promise.all([
      admin.from("timeline_events").insert({customer_id:portal.access.customer_id,project_id:portal.access.project_id,event_type:action,title:approved?"Diseño aprobado.":"Cambios de diseño solicitados.",description:message,orbit_event_id:portal.project.orbit_event_id,actor_label:"Cliente",source:"Customer",action,entity_type:"Document",entity_id:current.id,human_message:message,correlation_id:correlation}),
      admin.from("internal_notifications").insert({project_id:portal.access.project_id,customer_id:portal.access.customer_id,notification_type:action,title:approved?"Diseño aprobado":"Cambios solicitados",message,status:"UNREAD",correlation_id:correlation,category:"CUSTOMER",priority:approved?"INFORMATION":"HIGH",action_required:!approved,entity_type:"Document",entity_id:current.id,related_href:`/projects/${portal.access.project_id}`}),
    ]);const failure=results.find(result=>result.error);if(failure?.error)throw failure.error;
    return{ok:true as const,message:approved?"✅ Diseño aprobado":"Tu solicitud de cambios fue enviada a BOOMBOX.",requestId:request.id};
  }catch(error){return{ok:false as const,error:error instanceof Error?error.message:"No fue posible actualizar el diseño."};}
}
