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

async function synchronizeWithRetry(drive:GoogleDriveLive,plan:ReturnType<typeof buildCustomerFolderPlan>|ReturnType<typeof buildRootFolderPlan>,synchronizedAt:string){let lastError="No fue posible sincronizar Google Drive.";for(let attempt=1;attempt<=3;attempt+=1){const result=await drive.synchronizeFolderPlan(plan,synchronizedAt);if(result.ok)return result;lastError=result.error.message;if(!result.error.retryable)break;if(attempt<3)await new Promise(resolve=>setTimeout(resolve,attempt*300));}throw new Error(lastError);}

export async function synchronizeConfirmedReservationDrive(input:{client:SupabaseClient;projectId:string;actorId?:string;recordTimeline?:boolean}):Promise<ReservationDriveFolderResult>{
  const[{data:project,error:projectError},company]=await Promise.all([
    input.client.from("projects").select("id,customer_id,orbit_event_id,event_date,operations,customers!inner(full_name,metadata)").eq("id",input.projectId).is("deleted_at",null).single(),
    loadCompanySettings(input.client),
  ]);
  if(projectError)throw projectError;
  const customer=Array.isArray(project.customers)?project.customers[0]:project.customers;if(!customer)throw new Error("La reserva no tiene un cliente asociado.");
  const plan=buildCustomerFolderPlan(customer.full_name,project.event_date,company.driveRootFolder);const eventFolderPlan=plan[2];const repository=new SupabaseGoogleDriveFolderRepository(input.client,project.id);const synchronizedAt=new Date().toISOString();const provider=new GoogleDriveApiProvider(await loadGoogleWorkspaceAccessToken());const drive=new GoogleDriveLive(await loadGoogleWorkspaceConnection(),provider,repository);
  await synchronizeWithRetry(drive,buildRootFolderPlan(company.driveRootFolder),synchronizedAt);
  await synchronizeWithRetry(drive,plan.slice(0,2),synchronizedAt);
  const operations=project.operations&&typeof project.operations==="object"?project.operations as Record<string,unknown>:{};const linkedDrive=operations.googleDrive&&typeof operations.googleDrive==="object"?operations.googleDrive as Record<string,unknown>:{};
  const{data:storedFolders,error:storedError}=await input.client.from("drive_sync").select("destination_key,external_folder_id,last_synced_at,status").eq("project_id",project.id).not("external_folder_id","is",null);if(storedError)throw storedError;
  const linkedFolderId=typeof linkedDrive.folderId==="string"?linkedDrive.folderId:null;const previousEvent=(storedFolders??[]).find(row=>row.external_folder_id===linkedFolderId)??(storedFolders??[]).find(row=>row.destination_key.split("/").length===4);const reused=Boolean(previousEvent?.external_folder_id);
  if(previousEvent?.external_folder_id){const parent=await repository.findByPath(eventFolderPlan.parentPath!);if(!parent?.driveFolderId)throw new Error("No fue posible resolver el nuevo período en Google Drive.");const previousParentPath=previousEvent.destination_key.slice(0,previousEvent.destination_key.lastIndexOf("/"));const previousParent=(storedFolders??[]).find(row=>row.destination_key===previousParentPath);await provider.updateFolder({id:previousEvent.external_folder_id,name:eventFolderPlan.name,parentFolderId:parent.driveFolderId,previousParentFolderId:previousParent?.external_folder_id??undefined});const oldPath=previousEvent.destination_key;for(const row of storedFolders??[]){if(row.destination_key!==oldPath&&!row.destination_key.startsWith(`${oldPath}/`))continue;const destination=row.destination_key===oldPath?eventFolderPlan.path:`${eventFolderPlan.path}${row.destination_key.slice(oldPath.length)}`;const{error:updatePathError}=await input.client.from("drive_sync").update({destination_key:destination,status:"UPDATED",last_synced_at:synchronizedAt}).eq("project_id",project.id).eq("external_folder_id",row.external_folder_id);if(updatePathError)throw updatePathError;}}
  const synced=await synchronizeWithRetry(drive,plan,synchronizedAt);const eventFolder=synced.folders.find(folder=>folder.path===eventFolderPlan.path);if(!eventFolder?.driveFolderId)throw new Error("No fue posible resolver la carpeta del evento.");
  const folderUrl=`https://drive.google.com/drive/folders/${eventFolder.driveFolderId}`;const metadata=customer.metadata&&typeof customer.metadata==="object"?customer.metadata as Record<string,unknown>:{};const currentFolders=metadata.googleDriveFolders&&typeof metadata.googleDriveFolders==="object"?metadata.googleDriveFolders as Record<string,unknown>:{};
  const[{error:projectLinkError},{error:customerLinkError}]=await Promise.all([
    input.client.from("projects").update({operations:{...operations,googleDrive:{folderId:eventFolder.driveFolderId,folderUrl,path:eventFolder.path}},...(input.actorId&&{updated_by:input.actorId})}).eq("id",project.id),
    input.client.from("customers").update({metadata:{...metadata,googleDriveFolders:{...currentFolders,[project.id]:{folderId:eventFolder.driveFolderId,folderUrl,path:eventFolder.path}}},...(input.actorId&&{updated_by:input.actorId})}).eq("id",project.customer_id),
  ]);if(projectLinkError)throw projectLinkError;if(customerLinkError)throw customerLinkError;
  if(input.recordTimeline!==false){const message=reused?"Carpeta de Google Drive sincronizada sin cambiar su identificador.":"Carpeta y estructura documental creadas en Google Drive.";const{error:timelineError}=await input.client.from("timeline_events").insert({customer_id:project.customer_id,project_id:project.id,event_type:reused?"DRIVE_FOLDER_SYNCED":"DRIVE_FOLDER_CREATED",title:message,description:message,orbit_event_id:project.orbit_event_id,actor_id:input.actorId??null,actor_label:input.actorId?"Administrador":"Sistema",source:"Drive",action:reused?"DRIVE_FOLDER_SYNCED":"DRIVE_FOLDER_CREATED",entity_type:"DriveFolder",entity_id:eventFolder.driveFolderId,human_message:message,correlation_id:`drive:${project.orbit_event_id}:${randomUUID()}`,created_by:input.actorId??null});if(timelineError)throw timelineError;}
  return{folderId:eventFolder.driveFolderId,folderUrl,reused};
}
