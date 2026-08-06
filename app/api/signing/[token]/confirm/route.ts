import { NextRequest, NextResponse } from "next/server";
import { confirmDigitalSignature } from "@/features/projects/signing/digital-signature.service";

export async function POST(request: NextRequest,{params}:{params:Promise<{token:string}>}) {
  try { const {token}=await params;const body=await request.json() as {signatureDataUrl?:string};if(!body.signatureDataUrl)return NextResponse.json({message:"Agrega tu firma antes de confirmar."},{status:400});const forwarded=request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();await confirmDigitalSignature({token,signatureDataUrl:body.signatureDataUrl,ipAddress:forwarded??request.headers.get("x-real-ip")??"unknown",userAgent:request.headers.get("user-agent")??"unknown"});return NextResponse.json({ok:true}); } catch(error) { return NextResponse.json({message:error instanceof Error?friendly(error.message):"No fue posible confirmar la firma."},{status:400}); }
}
function friendly(message:string){if(/enlace|firma|acuerdo/i.test(message))return message;return"No fue posible confirmar la firma. Solicita un nuevo enlace a BOOMBOX.";}
