import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCompanySettings } from "@/features/company-settings";
import { loadGoogleWorkspaceAccessToken, loadGoogleWorkspaceConnection } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import { GoogleDriveApiProvider } from "../provider/google-drive-live.provider";
import { SupabaseGoogleDriveFolderRepository } from "../repository/google-drive-folder.repository";
import { buildCustomerFolderPlan, buildRootFolderPlan } from "./google-drive-folder-strategy";
import { GoogleDriveLive } from "./google-drive-live";

export interface ReservationDriveFolderResult { folderId:string; folderUrl:string; reused:boolean }

export async function synchronizeConfirmedReservationDrive(input:{client:SupabaseClient;projectId:string;actorId:string}):Promise<ReservationDriveFolderResult>{
  const[{data:project,error:projectError},company]=await Promise.all([
    input.client.from("projects").select("id,customer_id,orbit_event_id,event_date,operations,customers!inner(full_name,metadata)").eq("id",input.projectId).is("deleted_at",null).single(),
    loadCompanySettings(input.client),
  ]);
  if(projectError)throw projectError;
  const customer=Array.isArray(project.customers)?project.customers[0]:project.customers;if(!customer)throw new Error("La reserva no tiene un cliente asociado.");
  const plan=buildCustomerFolderPlan(customer.full_name,project.event_date,company.driveRootFolder);const eventFolderPlan=plan[2];const repository=new SupabaseGoogleDriveFolderRepository(input.client,project.id);const existing=await repository.findByPath(eventFolderPlan.path);const synchronizedAt=new Date().toISOString();const drive=new GoogleDriveLive(await loadGoogleWorkspaceConnection(),new GoogleDriveApiProvider(await loadGoogleWorkspaceAccessToken()),repository);
  const root=await drive.synchronizeFolderPlan(buildRootFolderPlan(company.driveRootFolder),synchronizedAt);if(!root.ok)throw new Error(root.error.message);const synced=await drive.synchronizeFolderPlan(plan,synchronizedAt);if(!synced.ok)throw new Error(synced.error.message);const eventFolder=synced.folders.find(folder=>folder.path===eventFolderPlan.path);if(!eventFolder?.driveFolderId)throw new Error("No fue posible resolver la carpeta del evento.");
  const folderUrl=`https://drive.google.com/drive/folders/${eventFolder.driveFolderId}`;const operations=project.operations&&typeof project.operations==="object"?project.operations as Record<string,unknown>:{};const metadata=customer.metadata&&typeof customer.metadata==="object"?customer.metadata as Record<string,unknown>:{};const currentFolders=metadata.googleDriveFolders&&typeof metadata.googleDriveFolders==="object"?metadata.googleDriveFolders as Record<string,unknown>:{};
  const[{error:projectLinkError},{error:customerLinkError}]=await Promise.all([
    input.client.from("projects").update({operations:{...operations,googleDrive:{folderId:eventFolder.driveFolderId,folderUrl,path:eventFolder.path}},updated_by:input.actorId}).eq("id",project.id),
    input.client.from("customers").update({metadata:{...metadata,googleDriveFolders:{...currentFolders,[project.id]:{folderId:eventFolder.driveFolderId,folderUrl,path:eventFolder.path}}},updated_by:input.actorId}).eq("id",project.customer_id),
  ]);if(projectLinkError)throw projectLinkError;if(customerLinkError)throw customerLinkError;
  const reused=Boolean(existing?.driveFolderId);const message=reused?"Estructura de Google Drive verificada y reutilizada.":"Carpeta y estructura documental creadas en Google Drive.";const{error:timelineError}=await input.client.from("timeline_events").insert({customer_id:project.customer_id,project_id:project.id,event_type:reused?"DRIVE_FOLDER_REUSED":"DRIVE_FOLDER_CREATED",title:message,description:message,orbit_event_id:project.orbit_event_id,actor_id:input.actorId,actor_label:"Administrador",source:"Drive",action:reused?"DRIVE_FOLDER_REUSED":"DRIVE_FOLDER_CREATED",entity_type:"DriveFolder",entity_id:eventFolder.driveFolderId,human_message:message,correlation_id:`drive:${project.orbit_event_id}:${randomUUID()}`,created_by:input.actorId});if(timelineError)throw timelineError;
  return{folderId:eventFolder.driveFolderId,folderUrl,reused};
}
