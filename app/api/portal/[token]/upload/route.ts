import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCustomerPortal } from "@/features/customer-portal/customer-portal.service";
import { loadGoogleWorkspaceAccessToken } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import { GoogleDriveApiProvider } from "@/features/connectors/google-drive/provider/google-drive-live.provider";

export async function POST(request:NextRequest,{params}:{params:Promise<{token:string}>}){
  const {token}=await params; const destination=new URL(`/p/${encodeURIComponent(token)}`,request.nextUrl.origin);
  try{
    const portal=await loadCustomerPortal(token);if(!portal)throw new Error("Este enlace ya no está disponible.");
    const form=await request.formData();const file=form.get("file");const instructions=String(form.get("instructions")??"").trim();
    if(!(file instanceof File)||file.size===0)throw new Error("Selecciona un archivo.");if(file.size>20*1024*1024)throw new Error("El archivo no puede superar 20 MB.");
    const admin=createAdminClient();const {data:folder}=await admin.from("drive_sync").select("external_folder_id").eq("project_id",portal.access.project_id).ilike("destination_key","%04 Diseños").not("external_folder_id","is",null).limit(1).maybeSingle();
    if(!folder?.external_folder_id)throw new Error("BOOMBOX aún está preparando la carpeta de diseño.");
    const provider=new GoogleDriveApiProvider(await loadGoogleWorkspaceAccessToken());const uploaded=await provider.uploadFile({name:file.name,mimeType:file.type||"application/octet-stream",bytes:new Uint8Array(await file.arrayBuffer()),parentFolderId:folder.external_folder_id});const correlationId=crypto.randomUUID();
    const {data:record,error}=await admin.from("customer_portal_uploads").insert({project_id:portal.access.project_id,customer_id:portal.access.customer_id,file_name:file.name,mime_type:file.type||"application/octet-stream",drive_file_id:uploaded.id,correlation_id:correlationId}).select("id").single();if(error)throw error;
    const message=instructions?`El cliente subió ${file.name}. Instrucciones: ${instructions}`:`El cliente subió ${file.name} al Centro de Diseño.`;
    const results=await Promise.all([admin.from("timeline_events").insert({customer_id:portal.access.customer_id,project_id:portal.access.project_id,event_type:"CUSTOMER_DESIGN_UPLOADED",title:"Archivo de diseño recibido.",description:message,orbit_event_id:portal.project.orbit_event_id,actor_label:"Cliente",source:"Customer",action:"CUSTOMER_DESIGN_UPLOADED",entity_type:"CustomerPortalUpload",entity_id:record.id,human_message:"El cliente compartió material para el diseño.",correlation_id:correlationId}),admin.from("internal_notifications").insert({project_id:portal.access.project_id,customer_id:portal.access.customer_id,notification_type:"DESIGN_UPLOAD",title:"Nuevo material de diseño",message,correlation_id:correlationId})]);const failure=results.find(item=>item.error);if(failure?.error)throw failure.error;destination.searchParams.set("upload","success");
  }catch(error){destination.searchParams.set("upload","error");destination.searchParams.set("message",error instanceof Error?error.message:"No fue posible subir el archivo.");}
  return NextResponse.redirect(destination,303);
}
