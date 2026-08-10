import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCustomerPortal } from "@/features/customer-portal/customer-portal.service";

export const dynamic="force-dynamic";
export async function GET(request:Request,{params}:{params:Promise<{token:string;documentId:string}>}){
  const{token,documentId}=await params;const portal=await loadCustomerPortal(token);if(!portal)return NextResponse.json({message:"Este enlace ya no está disponible."},{status:404});
  const document=portal.documents.find(item=>item.id===documentId&&item.document_type==="DESIGN");if(!document)return NextResponse.json({message:"El diseño no está disponible."},{status:404});const download=new URL(request.url).searchParams.get("download")==="1";
  if(document.storage_bucket&&document.storage_path){const admin=createAdminClient();const{data,error}=await admin.storage.from(document.storage_bucket).download(document.storage_path);if(!error&&data)return new NextResponse(data,{headers:{"Cache-Control":"private, no-store, max-age=0","Content-Disposition":`${download?"attachment":"inline"}; filename="Diseno-BOOMBOX"`,"Content-Type":data.type||"application/octet-stream","X-Content-Type-Options":"nosniff"}});}
  if(document.drive_file_id)return NextResponse.redirect(download?`https://drive.google.com/uc?export=download&id=${encodeURIComponent(document.drive_file_id)}`:`https://drive.google.com/file/d/${encodeURIComponent(document.drive_file_id)}/preview`);
  return NextResponse.json({message:"El archivo del diseño no está disponible."},{status:404});
}
