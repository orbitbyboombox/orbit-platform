import { NextResponse } from "next/server";
import { loadCustomerPortal } from "@/features/customer-portal/customer-portal.service";
import { loadGoogleWorkspaceAccessToken } from "@/features/connectors/google-workspace/application/google-workspace.repository";

export const dynamic="force-dynamic";
export async function GET(request:Request,{params}:{params:Promise<{token:string;fileId:string}>}){
  const{token,fileId}=await params;const portal=await loadCustomerPortal(token);if(!portal)return NextResponse.json({message:"Este enlace ya no está disponible."},{status:404});const file=[...portal.gallery.photos,...portal.gallery.videos].find(item=>item.id===fileId);if(!file)return NextResponse.json({message:"El archivo no pertenece a esta galería."},{status:404});
  const accessToken=await loadGoogleWorkspaceAccessToken();const response=await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`,{headers:{Authorization:`Bearer ${accessToken}`},cache:"no-store"});if(!response.ok||!response.body)return NextResponse.json({message:"No fue posible abrir el archivo."},{status:response.status===404?404:502});const download=new URL(request.url).searchParams.get("download")==="1";const safeName=file.name.replace(/[\r\n"\\/]/g,"-");
  return new NextResponse(response.body,{headers:{"Cache-Control":"private, no-store, max-age=0","Content-Disposition":`${download?"attachment":"inline"}; filename="${safeName}"`,"Content-Type":file.mimeType,"X-Content-Type-Options":"nosniff"}});
}
