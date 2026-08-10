import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { loadGoogleWorkspaceAccessToken } from "@/features/connectors/google-workspace/application/google-workspace.repository";

const folderMime="application/vnd.google-apps.folder";
export interface CustomerGalleryFile { id:string;name:string;mimeType:string;size:number|null;createdTime:string|null;webViewLink:string|null;albumId:string|null;albumName:string|null }
export interface CustomerGalleryAlbum { id:string;name:string;count:number }
export interface CustomerGallery { status:"AVAILABLE"|"COMING_SOON"|"ERROR";photos:CustomerGalleryFile[];videos:CustomerGalleryFile[];albums:CustomerGalleryAlbum[] }

export async function loadCustomerGallery(projectId:string):Promise<CustomerGallery>{
  try{
    const admin=createAdminClient();const{data:folders,error}=await admin.from("drive_sync").select("destination_key,external_folder_id").eq("project_id",projectId).not("external_folder_id","is",null);if(error)throw error;
    const photoFolder=folders?.find(item=>item.destination_key.endsWith("/05_Fotografías"));const videoFolder=folders?.find(item=>item.destination_key.endsWith("/06_Videos"));if(!photoFolder?.external_folder_id&&!videoFolder?.external_folder_id)return empty("COMING_SOON");
    const token=await loadGoogleWorkspaceAccessToken();const[photoRoot,videoRoot]=await Promise.all([photoFolder?.external_folder_id?listFiles(token,photoFolder.external_folder_id):[],videoFolder?.external_folder_id?listFiles(token,videoFolder.external_folder_id):[]]);
    const albumFolders=photoRoot.filter(item=>item.mimeType===folderMime);const albumChildren=await Promise.all(albumFolders.map(async album=>({album,files:await listFiles(token,album.id)})));
    const directPhotos=photoRoot.filter(item=>item.mimeType.startsWith("image/")).map(item=>file(item,null,null));const directVideos=[...photoRoot,...videoRoot].filter(item=>item.mimeType.startsWith("video/")).map(item=>file(item,null,null));
    const photos=[...directPhotos,...albumChildren.flatMap(({album,files})=>files.filter(item=>item.mimeType.startsWith("image/")).map(item=>file(item,album.id,album.name)))];const videos=[...directVideos,...albumChildren.flatMap(({album,files})=>files.filter(item=>item.mimeType.startsWith("video/")).map(item=>file(item,album.id,album.name)))];
    const albums=albumChildren.map(({album,files})=>({id:album.id,name:album.name,count:files.filter(item=>item.mimeType.startsWith("image/")||item.mimeType.startsWith("video/")).length}));return{status:photos.length||videos.length?"AVAILABLE":"COMING_SOON",photos,videos,albums};
  }catch{return empty("ERROR")}
}

function empty(status:"COMING_SOON"|"ERROR"):CustomerGallery{return{status,photos:[],videos:[],albums:[]}}
function file(item:DriveFile,albumId:string|null,albumName:string|null):CustomerGalleryFile{return{id:item.id,name:item.name,mimeType:item.mimeType,size:item.size?Number(item.size):null,createdTime:item.createdTime??null,webViewLink:item.webViewLink??null,albumId,albumName}}
interface DriveFile{id:string;name:string;mimeType:string;size?:string;createdTime?:string;webViewLink?:string}
async function listFiles(token:string,parentId:string):Promise<DriveFile[]>{const files:DriveFile[]=[];let pageToken="";do{const url=new URL("https://www.googleapis.com/drive/v3/files");url.searchParams.set("q",`'${parentId.replace(/'/g,"\\'")}' in parents and trashed = false`);url.searchParams.set("fields","nextPageToken,files(id,name,mimeType,size,createdTime,webViewLink)");url.searchParams.set("pageSize","1000");url.searchParams.set("orderBy","name");if(pageToken)url.searchParams.set("pageToken",pageToken);const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`},cache:"no-store"});if(!response.ok)throw new Error(`Drive gallery lookup failed (${response.status})`);const body=await response.json() as{nextPageToken?:string;files?:DriveFile[]};files.push(...(body.files??[]));pageToken=body.nextPageToken??""}while(pageToken);return files}
