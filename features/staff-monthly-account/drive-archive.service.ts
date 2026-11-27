import { completeReservedDriveUpload } from "./reserved-drive-upload";
import { withDriveReconciliationLease } from "@/features/connectors/google-drive/application/drive-reconciliation-lease";
import"server-only";import{createHash}from"node:crypto";import type{SupabaseClient}from"@supabase/supabase-js";import{loadCompanySettings}from"@/features/company-settings";import{loadGoogleWorkspaceAccessToken}from"@/features/connectors/google-workspace/application/google-workspace.repository";import{GoogleDriveApiProvider}from"@/features/connectors/google-drive/provider/google-drive-live.provider";
const MONTHS=["01_ENERO","02_FEBRERO","03_MARZO","04_ABRIL","05_MAYO","06_JUNIO","07_JULIO","08_AGOSTO","09_SEPTIEMBRE","10_OCTUBRE","11_NOVIEMBRE","12_DICIEMBRE"];
// Keep the live archive bound to its physical ID during the move under 02_STAFF.
const BOOMBOX_STAFF_OPERATORS_ID = "1zGcNBU50KXYedhWfOXNXvod1wyF8YZRR";
const BOOMBOX_STAFF_ARCHIVE_ID = "1nFkPucHqIrMW6b3rz8FxJ-W78ZyYE6Rc";
const BOOMBOX_STAFF_CATEGORY_ID = "1wRsOwrA1eWUoZf3XAbkiLyOwruf6baLx";
const BOOMBOX_ROOT_ID = "1EFHCbHnYYXGlHY4CF0ZUWmInVRnmcfcM";
const STAFF_ARCHIVE_NAME = "ARCHIVO_DOCUMENTAL";

async function resolveBoomBoxArchive(provider: GoogleDriveApiProvider) {
  const [operators, archive] = await Promise.all([
    provider.readFolder(BOOMBOX_STAFF_OPERATORS_ID),
    provider.readFolder(BOOMBOX_STAFF_ARCHIVE_ID),
  ]);
  const atRoot = archive.name === "STAFF" && archive.parents[0] === BOOMBOX_ROOT_ID;
  const underStaff = archive.name === STAFF_ARCHIVE_NAME && archive.parents[0] === BOOMBOX_STAFF_CATEGORY_ID;
  if (archive.parents.length !== 1 || (!atRoot && !underStaff) || operators.name !== "OPERADORES"
      || operators.parents.length !== 1 || operators.parents[0] !== archive.id) {
    throw new Error("No se pudo verificar el archivo documental de Staff en Drive.");
  }
  return { id: operators.id, path: atRoot ? "BOOMBOX ORBIT/STAFF/OPERADORES" : `BOOMBOX ORBIT/02_STAFF/${STAFF_ARCHIVE_NAME}/OPERADORES` };
}

export const staffArchivePath=(root:string,staffId:string,name:string)=>`${root}/STAFF/OPERADORES/${staffId} — ${name.trim().replace(/[\\/]+/g,"-")}`;
export const staffArchiveFileName=(document:{category:string;file_name:string;storage_path:string})=>{const fallback=document.storage_path.split("/").pop()?.trim()||document.file_name.trim()||"document";return document.category==="IDENTIDAD"?fallback:document.file_name.trim()||fallback};
async function folder(provider:GoogleDriveApiProvider,name:string,parentFolderId?:string){return(await provider.findFolder({name,parentFolderId}))??provider.createFolder({name,parentFolderId})}
async function resolvePath(provider:GoogleDriveApiProvider,parts:string[],parent:string){
  await provider.readPrivateFolder(parent);
  for(const name of parts){
    if(!name||!name.trim())throw new Error("Ruta documental de Staff inválida.");
    const next=await folder(provider,name,parent);
    const verified=await provider.readPrivateFolder(next.id);
    if(verified.name!==name||verified.parents.length!==1||verified.parents[0]!==parent)throw new Error("Destino documental de Staff no coincide con la ruta privada esperada.");
    parent=verified.id;
  }
  return parent;
}
async function verifyStaffArchiveFile(token:string,id:string,parentId:string,name:string,checksum:string,size:number,mimeType:string){
  const url=new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}`);
  url.searchParams.set("fields","id,name,mimeType,trashed,parents,sha256Checksum,size,shared,permissions(type,role)");
  url.searchParams.set("supportsAllDrives","true");
  const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});
  if(response.status===404)return false;
  if(!response.ok)throw new Error("No se pudo verificar el respaldo de Staff en Drive.");
  const file=await response.json() as {id?:string;name?:string;mimeType?:string;trashed?:boolean;parents?:string[];sha256Checksum?:string;size?:string;shared?:boolean;permissions?:{type:string;role:string}[]};
  if(file.id!==id||file.name!==name||file.mimeType!==mimeType||file.trashed!==false||file.parents?.length!==1||file.parents[0]!==parentId||file.sha256Checksum?.toLowerCase()!==checksum||file.size!==String(size)||file.shared!==false||file.permissions?.length!==1||file.permissions[0].type!=="user"||file.permissions[0].role!=="owner"){
    throw new Error("El respaldo de Staff no coincide con el original, destino o privacidad esperados.");
  }
  return true;
}
export async function syncStaffDocumentArchive(client: SupabaseClient, documentId: string) {
  const { data, error } = await client.from("staff_onboarding_documents").select("drive_file_id")
    .eq("id", documentId).eq("status", "ACTIVE").single();
  if (error) throw error;
  if (data.drive_file_id) return { status: "SKIPPED", driveFileId: data.drive_file_id };
  return withDriveReconciliationLease("staff-document-archive", () => archiveStaffDocument(client, documentId));
}
async function archiveStaffDocument(client:SupabaseClient,documentId:string){const[{data:doc,error},{driveRootFolder}]=await Promise.all([client.from("staff_onboarding_documents").select("id,staff_id,category,applicable_month,storage_bucket,storage_path,file_name,mime_type,drive_file_id,staff!inner(first_name,last_name)").eq("id",documentId).eq("status","ACTIVE").single(),loadCompanySettings(client)]);if(error)throw error;if(doc.drive_file_id)return{status:"SKIPPED",driveFileId:doc.drive_file_id};const staff=Array.isArray(doc.staff)?doc.staff[0]:doc.staff,name=`${staff.first_name} ${staff.last_name}`,root=driveRootFolder||"ORBIT",base=[root,"STAFF","OPERADORES",`${doc.staff_id} — ${name}`],category=doc.category==="IDENTIDAD"?"01_DATOS_IDENTIDAD":doc.category==="CONTRATOS"?"02_CONTRATOS":doc.category==="BOLETAS"?"03_BOLETAS_HONORARIOS":doc.category==="LIQUIDACIONES"?"04_LIQUIDACIONES":doc.category==="PAGOS"?"05_COMPROBANTES_PAGO":doc.category==="GASTOS"?"06_GASTOS_REEMBOLSOS":"07_OTROS",month=doc.applicable_month?String(doc.applicable_month).slice(0,7):null,parts=[...base,category,...(month?[month.slice(0,4),MONTHS[Number(month.slice(5,7))-1]]:[])],token=await loadGoogleWorkspaceAccessToken(),provider=new GoogleDriveApiProvider(token),archive=root==="BOOMBOX ORBIT"?await resolveBoomBoxArchive(provider):null;
if(!archive)throw new Error("No se pudo verificar la raíz privada de Staff.");
const {data:blob,error:downloadError}=await client.storage.from(doc.storage_bucket).download(doc.storage_path);
if(downloadError||!blob||!blob.size)throw new Error("Original Storage no disponible o vacío.");
const bytes=new Uint8Array(await blob.arrayBuffer());
const signature = Buffer.from(bytes.subarray(0, 8));
const originalType = signature.subarray(0, 5).equals(Buffer.from("%PDF-")) ? "application/pdf"
  : signature.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? "image/png"
  : signature.subarray(0, 3).equals(Buffer.from([255, 216, 255])) ? "image/jpeg"
  : signature.subarray(0, 4).equals(Buffer.from("RIFF")) && Buffer.from(bytes.subarray(8, 12)).equals(Buffer.from("WEBP")) ? "image/webp"
  : null;
if (bytes.byteLength !== blob.size || originalType !== doc.mime_type) {
  throw new Error("El tamaño o el tipo binario no coinciden con el original de Staff.");
}
const expectedChecksum=createHash("sha256").update(bytes).digest("hex");
const folderId=await resolvePath(provider,parts.slice(3),archive.id);
await provider.readPrivateFolder(folderId);
const fileName=staffArchiveFileName(doc);
const verify = (id: string) => verifyStaffArchiveFile(token, id, folderId, fileName, expectedChecksum, bytes.byteLength, doc.mime_type);
const reservations = "staff_archive_upload_reservations";
const readReservation = () => client.from(reservations).select("drive_id,folder_id,checksum,file_name").eq("document_id", doc.id).maybeSingle();
let { data: reservation, error: reservationError } = await readReservation();
if (reservationError) throw reservationError;
let existingId: string | undefined;
if (!reservation) {
  const candidates=await provider.findFilesByName({name:fileName,parentFolderId:folderId});
  if(candidates.length>1)throw new Error("Archivos homónimos en Drive; revisión requerida.");
  existingId = candidates[0]?.id;
  if (!existingId) {
    const response = await fetch("https://www.googleapis.com/drive/v3/files/generateIds?count=1&space=drive", {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Drive no pudo reservar el identificador de Staff.");
    const { ids } = await response.json() as { ids?: string[] };
    const id = ids?.[0];
    if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) throw new Error("Identificador reservado inválido.");
    const { error: insertError } = await client.from(reservations).insert({
      document_id: doc.id, drive_id: id, folder_id: folderId, checksum: expectedChecksum, file_name: fileName,
    });
    if (insertError && insertError.code !== "23505") throw insertError;
    ({ data: reservation, error: reservationError } = await readReservation());
    if (reservationError) throw reservationError;
  }
}
let driveFileId: string;
let status: "RECONCILED" | "UPLOADED";
if (reservation) {
  if (reservation.folder_id !== folderId || reservation.checksum !== expectedChecksum || reservation.file_name !== fileName) {
    throw new Error("El original o el destino cambió después de reservar el archivo de Staff.");
  }
  driveFileId = reservation.drive_id;
  status = await completeReservedDriveUpload(driveFileId, verify, async (reservedId) => {
    await provider.readPrivateFolder(folderId);
    await provider.uploadFile({ name: fileName, mimeType: doc.mime_type, bytes, parentFolderId: folderId, reservedId });
  });
} else {
  if (!existingId || !(await verify(existingId))) throw new Error("No se pudo verificar el respaldo existente.");
  driveFileId = existingId;
  status = "RECONCILED";
}
await provider.readPrivateFolder(folderId);
const {data:linked,error:updateError}=await client.from("staff_onboarding_documents").update({drive_file_id:driveFileId,drive_folder_id:folderId,drive_sync_status:"SYNCED",drive_sync_error:null,drive_synced_at:new Date().toISOString()}).eq("id",doc.id).eq("status","ACTIVE").eq("storage_bucket",doc.storage_bucket).eq("storage_path",doc.storage_path).is("drive_file_id",null).select("id").maybeSingle();
if(updateError)throw updateError;
if(!linked)throw new Error("El documento cambió durante el respaldo; no se reemplazó el vínculo.");
return{status,driveFileId,path:archive?[archive.path,...parts.slice(3)].join("/"):parts.join("/")}}
export async function syncStaffArchiveBackfill(client:SupabaseClient){const{data,error}=await client.from("staff_onboarding_documents").select("id").eq("status","ACTIVE").is("drive_file_id",null).not("staff_id","is",null).order("created_at");if(error)throw error;const results=[];for(const row of data??[]){try{results.push({id:row.id,...await syncStaffDocumentArchive(client,row.id)})}catch(error){await client.from("staff_onboarding_documents").update({drive_sync_status:"ERROR",drive_sync_error:error instanceof Error?error.message:String(error)}).eq("id",row.id).is("drive_file_id",null);results.push({id:row.id,status:"ERROR"})}}return results}
